# Dice Chess Bots — Deno Deploy

[![CI](https://github.com/fortemate/dicechess-bots-deno/actions/workflows/ci.yml/badge.svg)](https://github.com/fortemate/dicechess-bots-deno/actions/workflows/ci.yml)
[![Leaderboard](https://img.shields.io/badge/Ladder-Leaderboard-1E90FF)](https://fortemate.com/leaderboard)
[![Engine](https://img.shields.io/badge/Engine-dicechess--engine-8A2BE2)](https://github.com/fortemate/dicechess-engine)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-lightgrey)](./LICENSE)

One application hosting the fixed rating anchors that run on Deno Deploy, each on its own path.

| Path      | Identity            | Algorithm         | Role in the scale                |
| --------- | ------------------- | ----------------- | -------------------------------- |
| `/greedy` | `cloudflare/greedy` | built-in `greedy` | base greedy material evaluation  |
| `/random` | `anchor/random`     | built-in `random` | lower horizon of admissible play |

## Why one application and not one per bot

Deno Deploy bills **Memory Time** as provisioned memory × every second the _application_ is loaded in memory —
not memory actually used, and not CPU. Measured over four hours with both anchors on the ladder: 1.7 GiB·h
consumed, isolates resident about 39 % of the time. Projected to a month that is ~285 GiB·h for two separate
apps against a free-plan allowance of **350 GiB·h**, and exceeding the allowance **pauses the application
until the next billing cycle** rather than billing for it.

Collapsing them into one application halves that, because the meter counts applications rather than
identities. It also makes the next anchor nearly free instead of adding another ~140 GiB·h.

## Each identity keeps its own secret

`POST /bot/webhook` issues one HMAC key per bot. They are not interchangeable and must not be shared: a shared
key would let a delivery meant for one anchor be replayed against another, which is exactly what
`src/bots_test.ts` pins with a cross-route test.

| Identity            | Environment variable    |
| ------------------- | ----------------------- |
| `cloudflare/greedy` | `GREEDY_WEBHOOK_SECRET` |
| `anchor/random`     | `RANDOM_WEBHOOK_SECRET` |

## The one rule

**Do not improve these bots.** No opening book, no algorithm swap, no config knob. An anchor that gets tuned
is not an anchor. If you want a stronger Deno bot, add a new identity — never repurpose one that already
carries rating history.

`greedy` takes the best-scoring turn and **breaks ties uniformly at random**: over 200 calls the `a1a7`
position is stable 200/200 because its best move is unique, while the opening roll `NBK` yields all four
knight moves at roughly 25 % each. The anchors are therefore _statistically_ stationary, which is what the
scale needs, but only the unique-best case can be pinned.

## Adding an anchor

1. One entry in `BOTS` (`src/bots.ts`) — route, identity, algorithm, secret variable.
2. One environment variable on the Production timeline.
3. `POST /bot/webhook` with `https://<app>.deno.net/<route>`; store the returned secret.

Do **not** create another Deno Deploy application: that is the cost this repository exists to avoid.

## Running it locally

```bash
GREEDY_WEBHOOK_SECRET=gk RANDOM_WEBHOOK_SECRET=rk deno task dev
```

```bash
curl -s localhost:8000          # lists the roster
curl -s localhost:8000/greedy   # {"status":"ok","bot":"cloudflare/greedy","algorithm":"greedy"}
deno task test                  # 8 tests
deno task check                 # type check, fmt, lint
```

## Licence

AGPL-3.0-only, the same as the engine. See [LICENSE](./LICENSE) and [CLA.md](./CLA.md).
