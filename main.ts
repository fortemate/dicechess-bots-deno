// One Deno Deploy application serving several Dice Chess ladder anchors, each on its own path.
//
//   https://<app>.deno.net/greedy   → cloudflare/greedy
//   https://<app>.deno.net/random   → anchor/random
//
// Each identity keeps its OWN webhook secret — play-api issues one per bot, and a shared key would
// let a delivery meant for one anchor be replayed against another. Routing happens before any
// verification so an unknown path never touches HMAC at all.
//
// The warm-up below runs one throwaway search at module scope. A cold V8 isolate spends ~17 ms
// JIT-compiling the engine on its first search against ~0.4 ms warm; doing it at start-up keeps the
// cost off a turn that is on the clock. One warm-up covers every bot — the engine is shared.
import { handleDelivery } from './src/webhook.ts';
import { BOTS, byRoute, chooseMoves, WARMUP_DFEN } from './src/bots.ts';

const started = performance.now();
chooseMoves(BOTS[0], WARMUP_DFEN);
console.log(`[bots] engine warm in ${(performance.now() - started).toFixed(1)} ms`);

const secrets = new Map<string, string>();
for (const bot of BOTS) {
  const value = Deno.env.get(bot.secretEnv) ?? '';
  if (!value) console.warn(`[bots] ${bot.secretEnv} is unset — turns for ${bot.identity} will be rejected`);
  secrets.set(bot.route, value);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (request: Request) => {
  const path = new URL(request.url).pathname;
  const bot = byRoute(path);

  if (request.method !== 'POST') {
    return bot
      ? json(200, { status: 'ok', bot: bot.identity, algorithm: bot.algorithm })
      : json(200, { status: 'ok', bots: BOTS.map((b) => ({ route: `/${b.route}`, identity: b.identity })) });
  }
  if (!bot) return json(404, { error: `no bot at ${path}` });

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const now = Math.floor(Date.now() / 1000);
  const { status, body } = await handleDelivery(
    headers,
    rawBody,
    secrets.get(bot.route) ?? '',
    (dfen) => chooseMoves(bot, dfen),
    now,
  );
  return json(status, body);
});
