// The roster this application serves. Adding an anchor is one entry here plus one environment
// variable — deliberately NOT another Deno Deploy application.
//
// Why one app for many bots: Deno Deploy's Memory Time meter bills the provisioned memory for every
// second an *application* is loaded in memory, regardless of how many identities it serves. Two
// apps at 512 MiB each, resident ~39% of the time, project to about 285 GiB-h a month against the
// free plan's 350; a third would not fit at all. Collapsed into one app the same traffic costs half
// that, and further identities are close to free.
import { DiceChess } from '@fortemate/dicechess-engine';

export interface Bot {
  /** Path segment the webhook URL ends in, e.g. `/greedy`. */
  readonly route: string;
  /** The play-api identity, for logs and the health response. */
  readonly identity: string;
  /** The engine's built-in algorithm. Never change one for a registered anchor. */
  readonly algorithm: string;
  /** Environment variable holding this identity's own HMAC key from POST /bot/webhook. */
  readonly secretEnv: string;
}

export const BOTS: readonly Bot[] = [
  { route: 'greedy', identity: 'cloudflare/greedy', algorithm: 'greedy', secretEnv: 'GREEDY_WEBHOOK_SECRET' },
  { route: 'random', identity: 'anchor/random', algorithm: 'random', secretEnv: 'RANDOM_WEBHOOK_SECRET' },
  {
    route: 'aggressive',
    identity: 'anchor/aggressive',
    algorithm: 'aggressive',
    secretEnv: 'AGGRESSIVE_WEBHOOK_SECRET',
  },
];

export const byRoute = (path: string): Bot | undefined =>
  BOTS.find((b) => b.route === path.replace(/^\/+|\/+$/g, ''));

/** DFEN in, the turn's UCI micro-moves out. `[]` = pass (no legal move; the server auto-passes). */
export function chooseMoves(bot: Bot, dfen: string): string[] {
  const result = DiceChess.getBestMove(dfen, { algorithm: bot.algorithm });
  return (result?.moves ?? []).map((m) => m.from + m.to + (m.promotion ?? ''));
}

export const WARMUP_DFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK';
