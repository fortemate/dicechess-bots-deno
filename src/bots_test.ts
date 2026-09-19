import { assert, assertEquals, assertMatch } from '@std/assert';
import { BOTS, byRoute, chooseMoves } from './bots.ts';
import { handleDelivery, sign } from './webhook.ts';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK';
const GREEDY = BOTS.find((b) => b.route === 'greedy')!;
const RANDOM = BOTS.find((b) => b.route === 'random')!;
const AGGRESSIVE = BOTS.find((b) => b.route === 'aggressive')!;

Deno.test('the roster is wired to distinct identities, algorithms and secret variables', () => {
  assertEquals(BOTS.length, 3);
  assertEquals(new Set(BOTS.map((b) => b.route)).size, BOTS.length, 'routes must be unique');
  assertEquals(new Set(BOTS.map((b) => b.identity)).size, BOTS.length, 'identities must be unique');
  assertEquals(new Set(BOTS.map((b) => b.secretEnv)).size, BOTS.length, 'each bot needs its OWN secret');
});

Deno.test('routing tolerates surrounding slashes and rejects the unknown', () => {
  assertEquals(byRoute('/greedy')?.identity, 'cloudflare/greedy');
  assertEquals(byRoute('greedy/')?.identity, 'cloudflare/greedy');
  assertEquals(byRoute('/random')?.identity, 'anchor/random');
  assertEquals(byRoute('/aggressive')?.identity, 'anchor/aggressive');
  assertEquals(byRoute('/'), undefined);
  assertEquals(byRoute('/nope'), undefined);
});

// The load-bearing test of the merge: greedy must still play exactly as it did on Cloudflare and
// as it did in its own single-bot Deno app. Carried over verbatim from the Cloudflare starter.
Deno.test('greedy grabs undefended material — unchanged across every host it has run on', () => {
  assertEquals(chooseMoves(GREEDY, '1r4k1/p4ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 R'), ['a1a7']);
});

Deno.test('each route runs its own algorithm', () => {
  const g = chooseMoves(GREEDY, DFEN);
  const r = chooseMoves(RANDOM, DFEN);
  for (const m of [...g, ...r]) assertMatch(m, UCI);
  assertEquals(g.length, 1);
  assertEquals(r.length, 1);
});

Deno.test('a position with no legal move yields an empty pass on both routes', () => {
  for (const bot of BOTS) assertEquals(chooseMoves(bot, '4k3/8/8/8/8/8/8/4K3 w - - 0 1 R'), []);
});

// The reason the roster carries a secretEnv per bot rather than one shared key: a delivery signed
// for one identity must not be accepted on another's route.
Deno.test("one bot's signature is not valid on another bot's route", async () => {
  const body = JSON.stringify({ type: 'turn', dfen: DFEN });
  const ts = 1_700_000_000;
  const headers = {
    'x-dicechess-timestamp': String(ts),
    'x-dicechess-signature': await sign('greedy-key', ts, body),
  };
  const onOwn = await handleDelivery(headers, body, 'greedy-key', (d) => chooseMoves(GREEDY, d), ts);
  assertEquals(onOwn.status, 200);
  const onOther = await handleDelivery(headers, body, 'random-key', (d) => chooseMoves(RANDOM, d), ts);
  assertEquals(onOther.status, 401);
});

Deno.test('the verification handshake echoes the nonce without a signature', async () => {
  const r = await handleDelivery({}, JSON.stringify({ type: 'verification', nonce: 'n1' }), 'k', () => [], 0);
  assertEquals(r.status, 200);
  assertEquals(r.body, { nonce: 'n1' });
});

Deno.test('a stale timestamp is rejected even with a genuine signature', async () => {
  const body = JSON.stringify({ type: 'turn', dfen: DFEN });
  const ts = 1_700_000_000;
  const headers = { 'x-dicechess-timestamp': String(ts), 'x-dicechess-signature': await sign('k', ts, body) };
  assertEquals(
    (await handleDelivery(headers, body, 'k', (d) => chooseMoves(GREEDY, d), ts + 400)).status,
    401,
  );
});

// Every identity here is a built-in engine algorithm, with nothing decorating it: no opening book,
// no clock-budgeted search, nothing that can be retrained or extended. That is what lets all three
// be fixed points of the scale — Anchor Set v1.0 requires exactly this.
Deno.test('every bot is a plain built-in engine algorithm', () => {
  const builtIn = new Set(['random', 'checkmate-aware', 'greedy', 'greedy-v2', 'aggressive']);
  for (const bot of BOTS) {
    assert(builtIn.has(bot.algorithm), `${bot.algorithm} is not a built-in engine algorithm`);
  }
});

Deno.test('aggressive answers a legal turn', () => {
  const moves = chooseMoves(AGGRESSIVE, DFEN);
  assertEquals(moves.length, 1);
  assertMatch(moves[0], UCI);
});
