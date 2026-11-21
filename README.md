# VEYDARA — Crypto & RWA Capital Operating System

> Understands what you actually own, explains the exact instrument and its real risks, and shows every number's source.

Built for the **CoinMarketCap API Hackathon, Round 2 — Real World Assets track** (submissions close 9 Dec 2026, 23:59 UTC).

![Collateral Passport — NVDAc](docs/screenshots/passport-nvdac.png)

## What works today (verified 2026-11-21)

| | |
|---|---|
| **Holdings-first wallet scan** | Connect a Base wallet (injected) or Solana wallet, or watch any address. Base: block-pinned native + verified-registry balances via one multicall. Solana: SOL + all SPL/Token-2022 accounts. |
| **Exact token identity** | Registry of Coinbase tokenized equities on Base pinned to the official Aave address book and cross-checked on-chain and against CMC's exact-contract listing. Unknown tokens are quarantined; ticker collisions and homoglyphs are flagged as impersonation. |
| **Honest states** | Stablecoin-only wallets get a calm cash view and "Which token are you considering?" — no shilling. Empty wallets get a research state, never an invented portfolio. |
| **CMC gateway** | Typed Zod schemas, keyed TTL cache, single-flight, negative caching for 403s, backoff for 429/`1022`, circuit breaker, and a credit ledger (expected vs CMC-reported `credit_count`). Works keyless for the documented keyless subset; key-only endpoints return an honest *Unavailable* without a network call. |
| **Collateral Passport** | For each tokenized equity: underlying vs issuer token, on-chain supply at a pinned block, CMC listing, **three distinct prices** (CMC issuer-token quote, CMC RWA aggregate, Aave V4 protocol oracle) with a disagreement flag, DEX liquidity, explicit unknowns, sources with dates. |
| **RWA Risk Clock (slice)** | NYSE session (DST/holiday-aware), next open in local time, live Aave oracle age. |
| **Alpha engine** | SMA/EMA/RSI/MACD/ATR/volatility/pivots/Fibonacci + clustered support/resistance zones, fixture-tested; runs only on real CMC v5 candles (needs key). |
| **Proof Center** | Backend-computed capability matrix and the live CMC credit ledger. |

Not built yet (and shown as such in the UI): Capital Constellation, Parallel Futures, Solver Arena, protocol position reads, any execution, Guardian monitors. See [docs/PRODUCT-FEATURE-MATRIX.md](docs/PRODUCT-FEATURE-MATRIX.md).

## CMC endpoints used
- `/v3/cryptocurrency/quotes/latest` — holdings and asset quotes (keyless or keyed)
- `/v2/cryptocurrency/info?address=` — exact-contract → CMC listing identity
- `/v1/dex/token` — DEX liquidity context
- `/v5/real-world-assets/quotes/latest` — aggregate tokenized price vs issuer tokens (key)
- `/v5/real-world-assets/map` — RWA ticker search (key, 0 credits)
- `/v5/cryptocurrency/ohlcv/historical` — candles for indicators/zones (key)
- Schemas also cover `/v5/real-world-assets/info`, `/quotes/historical`, `/issuers/list`, `/issuers`, `/v1/dex/token/pools`.

Evidence of real calls: `fixtures/cmc/*.live.json` (recorded keyless responses) and the in-app ledger at `/proof`.

## Run locally
```bash
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local   # optional: add CMC_API_KEY, BASE_RPC_URL
pnpm check:env
pnpm dev                               # http://localhost:3000
```
Try it without a wallet: `http://localhost:3000/?watch=0xa4d5947Eb727A052bae69C593FfC84247EC9864E` (the Aave V4 Equities Hub contract — a real protocol contract holding tokenized equities, not a personal wallet).

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # what CI runs
pnpm test:live          # opt-in live reads (Base RPC, Aave feed, CMC keyless)
pnpm verify:registry    # re-verify registry contracts on-chain + on CMC
```

## Supported chains
Base (8453) — scan, identity, Aave V4 oracle. Solana mainnet — scan, identity. Ethereum/BNB: architecture only.

## Docs
[Architecture](docs/ARCHITECTURE.md) · [Feature matrix](docs/PRODUCT-FEATURE-MATRIX.md) · [CMC credit strategy](docs/CMC-API-CREDIT-STRATEGY.md) · [Sources & claims](docs/SOURCES-AND-CLAIMS.md) · [Issuer eligibility](docs/ISSUER-ELIGIBILITY.md) · [Protocol adapters](docs/PROTOCOL-ADAPTERS.md) · [Financial models](docs/FINANCIAL-MODELS.md) · [Security](docs/SECURITY.md) · [Execution runbook](docs/EXECUTION-RUNBOOK.md) · [Demo script](docs/DEMO-SCRIPT.md)

## Disclaimer
VEYDARA is research software. It is not investment, legal or tax advice, does not recommend buying, selling or borrowing, and in this release cannot sign or send transactions. Tokenized securities are subject to issuer- and jurisdiction-specific eligibility rules that VEYDARA has not verified for you.

MIT licensed.
