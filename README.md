# Dice Chess Bots — Deno Deploy

[![CI](https://github.com/fortemate/dicechess-bots-deno/actions/workflows/ci.yml/badge.svg)](https://github.com/fortemate/dicechess-bots-deno/actions/workflows/ci.yml)
[![Leaderboard](https://img.shields.io/badge/Ladder-Leaderboard-1E90FF)](https://fortemate.com/leaderboard)
[![Engine](https://img.shields.io/badge/Engine-dicechess--engine-8A2BE2)](https://github.com/fortemate/dicechess-engine)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-lightgrey)](./LICENSE)

One application hosting the fixed rating anchors that run on Deno Deploy, each on its own path.

| Path          | Identity            | Algorithm             | Expected level | Role in the scale                    |
| ------------- | ------------------- | --------------------- | -------------: | ------------------------------------ |
| `/random`     | `anchor/random`     | built-in `random`     |         ≈ −610 | lower horizon of admissible play     |
| `/greedy`     | `cloudflare/greedy` | built-in `greedy`     |         ≈ −125 | base greedy material evaluation      |
| `/aggressive` | `anchor/aggressive` | built-in `aggressive` |          ≈ −35 | attacking heuristic, no opening book |

Three of the four members of `Anchor Set v1.0` live here. The fourth, `rabestro/java-baseline`, is a separate
ONNX bot hosted elsewhere. `cloudflare/greedy` keeps its team name although the specification calls it
`anchor/greedy`: renaming would create a new identity and discard its game history.

### Everything here is a built-in engine algorithm

That is the rule, not a coincidence. No opening book, no clock-budgeted search, no weights that can be
retrained — nothing a faster engine or a growing book could silently strengthen. It is what lets these
identities be fixed points the rest of the ladder is read against, and `src/bots_test.ts` asserts it: every
`algorithm` in the roster must be one the engine ships.

The engine dependency is pinned to an exact release in `deno.json` and its package integrity is recorded in
`deno.lock`. These algorithms do not use a time budget, so running the same engine faster does not change their
play. An engine update can still change move selection through code changes and therefore requires an explicit
anchor-replacement decision instead of an automatic dependency bump.

## Why one application and not one per bot

Deno Deploy bills **Memory Time** as provisioned memory × every second the _application_ is loaded in memory —
not memory actually used, and not CPU. The free-plan allowance is **350 GiB·h**, and exceeding it **pauses the
application until the next billing cycle** rather than billing for it.

The meter counts applications, not identities, so one app per bot multiplies the bill for nothing. At the
platform-minimum 512 MiB an application resident round the clock costs 0.5 × 730 = 365 GiB·h, slightly over
the whole allowance — which makes residency, not traffic, the number to watch.

Measured here over 14.6 hours with three bots on the ladder: **0.46 GiB·h per hour, ~92 % residency,
projecting to ~335 GiB·h a month — 96 % of the allowance.** Note what that corrects: an earlier reading with
one and two bots showed 39 % residency, and projecting _that_ onto the merged app was wrong. Residency is the
**union** of every bot's activity, so adding identities to one application pushes it toward 100 % rather than
leaving it flat. Consolidating still halves the cost of an hour; it does not stop more bots from buying more
hours.

## Each identity keeps its own secret

`POST /bot/webhook` issues one HMAC key per bot. They are not interchangeable and must not be shared: a shared
key would let a delivery meant for one anchor be replayed against another, which is exactly what
`src/bots_test.ts` pins with a cross-route test.

| Identity            | Environment variable        |
| ------------------- | --------------------------- |
| `anchor/random`     | `RANDOM_WEBHOOK_SECRET`     |
| `cloudflare/greedy` | `GREEDY_WEBHOOK_SECRET`     |
| `anchor/aggressive` | `AGGRESSIVE_WEBHOOK_SECRET` |

## The one rule

**Do not improve these bots.** No opening book, no algorithm swap, no config knob. An anchor that gets tuned
is not an anchor. If you want a stronger Deno bot, add a new identity — never repurpose one that already
carries rating history.

`greedy` takes the best-scoring turn and **breaks ties uniformly at random**: over 200 calls the `a1a7`
position is stable 200/200 because its best move is unique, while the opening roll `NBK` yields all four
knight moves at roughly 25 % each. The anchors are therefore _statistically_ stationary, which is what the
scale needs, but only the unique-best case can be pinned.

## Adding an anchor

1. One entry in `BOTS` (`src/bots.ts`) — route, identity, a **built-in** algorithm, secret variable.
2. One environment variable on the Production timeline.
3. `POST /bot/webhook` with `https://<app>.deno.net/<route>`; store the returned secret.

Do **not** create another Deno Deploy application: that is the cost this repository exists to avoid.

## Running it locally

```bash
GREEDY_WEBHOOK_SECRET=gk RANDOM_WEBHOOK_SECRET=rk AGGRESSIVE_WEBHOOK_SECRET=ak deno task dev
```

```bash
curl -s localhost:8000          # lists the roster
curl -s localhost:8000/greedy   # {"status":"ok","bot":"cloudflare/greedy","algorithm":"greedy"}
deno task test                  # 10 tests
deno task check                 # type check, fmt, lint
```

## Licence

AGPL-3.0-only, the same as the engine. See [LICENSE](./LICENSE) and [CLA.md](./CLA.md).
