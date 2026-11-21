# CMC API credit strategy

## Gateway (`packages/cmc/src/gateway.ts`)
- **Access modes**: `pro` (key in `X-CMC_PRO_API_KEY`, server-only) → `keyless` (`/public-api`, documented subset only) → `unavailable` (no network call; `CMC_KEY_MISSING`).
- **TTL by data class** (`endpoints.ts`): quotes 60 s (CMC refresh 15–60 s), DEX token 2 min, RWA historical 5 min, OHLCV 15 min, static metadata/id maps 6–24 h. Stale window per endpoint for flagged stale serving.
- **Single-flight**: concurrent identical requests share one upstream call (ledger outcome `dedup`).
- **Negative caching**: plan 403 / key errors cached 1 h; bad requests 10 min; credit exhaustion blocks the endpoint 30 min.
- **Backoff**: 429 / `1008` / `1009` / keyless `1022` → 20 s (pro) or 60 s (keyless) backoff during which cached data is served marked **stale**.
- **Circuit breaker**: 5 consecutive network/5xx failures → open 30 s.
- **Schema validation**: Zod; mismatches surface as `CMC_SCHEMA_MISMATCH`, never rendered.
- **Ledger**: every decision (miss/hit/stale/dedup/negative/blocked) with expected credits (documented formula) vs CMC `status.credit_count`. Visible at `/proof` and `/api/ledger`.

## Call budget per user action
| Action | Calls |
|---|---|
| Connect / watch a wallet | Base RPC only + **1** batched `/v3/cryptocurrency/quotes/latest` for verified holdings (registry carries pre-verified CMC ids, so no identity lookups) |
| Open an asset | `/v2/cryptocurrency/info?address=` (24 h cache), `/v3/.../quotes/latest` (60 s cache, often a hit), `/v1/dex/token` (2 min), `/v5/real-world-assets/quotes/latest` (key only) |
| Open an asset (chart) | `/v1/k-line/candles` limit=200 → 2 credits, 5 min cache (keyless-capable) |
| Open an asset (research) | 3 × `/v1/k-line/candles` (1h/4h/1d, limit 200), sequential, 5 min cache; the 1d call is shared with the chart |
| Issuer graph | `/v5/real-world-assets/quotes/latest?symbol=` (key) — 1 credit, 60 s cache |
| Capabilities page | with a key: `/v1/key/info` (0 credits, 10 min cache) + `/v5/real-world-assets/map` (0 credits, 6 h cache) as an access probe |
| Marketing / empty pages | **0** CMC calls (capability page reads the ledger, it does not probe CMC) |

`/v5/real-world-assets/market-pairs/list` (Growth+) and CMC AI endpoints are not called by the app (both probed once, see below).

## Expired-plan handling (observed 2026-11-21)
The project key answers `/v1/key/info` (450,000 credits/month, 600 req/min) but every data endpoint returns **HTTP 402 / error 1004 "Your API Key's subscription plan has expired."** with `credit_count` 0. The gateway maps this to `CMC_PLAN_EXPIRED`, suspends pro mode for 15 min (no hammering), transparently retries keyless-capable endpoints via `/public-api` (ledger feature tag `… (keyless fallback: pro plan expired)`), and reports key-only features as Unavailable with the exact CMC message. Probe cost: 0 credits. Re-run `node scripts/probe-cmc-plan.mjs --save` after the subscription is renewed.

## Observed (2026-11-21, keyless)
Keyless quotes/info/DEX each reported `credit_count: 1`. The shared anonymous pool returned `1022` after roughly 10 quick calls from one IP, so the hackathon key is required for a reliable demo.

## API feedback for CMC (submission note draft)
1. RWA `quotes/historical` docs show the Issuers List response as the example payload.
2. `/v2/cryptocurrency/info?address=` rejects lowercase EVM addresses with a confusing `Invalid value for 'slug': 'null'` (HTTP 400).
3. v3 quotes `platform` for USDC reports zkSync Era — the "primary platform" is arbitrary for multi-chain tokens; contract-level identity must come from `contract_address[]`.
4. Keyless pool limit is undocumented numerically; `1022` arrives quickly.
5. `/v1/k-line/candles` docs say the timestamp is UNIX seconds; live responses return milliseconds, and prices are serialized with more digits than IEEE-754 doubles hold.
6. `/v1/key/info` returns 200 with only a `notice` when the subscription has expired, while data endpoints return 402/1004 — a machine-readable `plan.status` field would let clients detect this without a failing data call.
7. CMC AI plan availability differs between the reference page (Basic+) and the launch post (Enterprise first).
