# Product feature matrix

Status values match the in-app badges: **Live verified**, **Read-only**, **Fork/testnet**, **Simulation**, **Unavailable**. The app computes badges server-side (`apps/web/lib/server/capabilities.ts`); this table is the planning view as of 2026-11-21.

| Pillar | Feature | Status | Evidence / blocker |
|---|---|---|---|
| Discover | Base wallet connect (wagmi injected) | Read-only | `lib/client/wagmi.ts`; no signatures requested |
| Discover | Solana wallet connect (Wallet Standard) | Read-only | `app/providers.tsx` |
| Discover | Watch-only (Base/Solana, `/?watch=`), opt-in local persistence, disconnect | Read-only | `lib/client/wallet-context.tsx` |
| Discover | Base balance scan, block-pinned (native + verified registry + user-added contracts) | Live verified | `packages/chains/src/evm.ts`; unknown-token discovery needs an indexer key |
| Discover | Solana balance scan (SOL + all SPL/Token-2022 accounts) | Live verified | `packages/chains/src/solana.ts` |
| Discover | Token identity registry + spam/impersonation quarantine | Live verified | `packages/chains/src/identity.ts` + tests |
| Discover | Stablecoin-only and empty-wallet states | Live verified | `components/holdings.tsx` |
| Discover | CMC pricing of verified holdings (batched, cached) | Live verified (keyless) | `lib/server/portfolio.ts` |
| Discover | Collateral Passport (identity, on-chain supply, CMC listing, price triad, explicit unknowns, sources) | Read-only | `components/asset-stage.tsx` |
| Discover | CMC RWA quotes: aggregate vs issuer tokens | Unavailable → needs `CMC_API_KEY` | gateway returns `CMC_KEY_MISSING` without a network call |
| Discover | RWA map / issuers / issuer graph | Unavailable → needs key; graph is Phase 2/3 | |
| Discover | Capital Constellation graph | Not built (Phase 3) | |
| Alpha | Indicator engine (SMA/EMA/RSI/MACD/ATR/vol/pivots/Fib) | Built, fixture-tested | `packages/quant`; Wilder RSI checked against an independent reference |
| Alpha | Support/resistance zones (clustered pivots, ATR tolerance, insufficient-data) | Built, fixture-tested | `packages/quant/src/levels.ts` |
| Alpha | Candlestick chart with zones/EMA | Unavailable until key (CMC v5 OHLCV) | `/api/ohlcv`, `components/price-chart.tsx` |
| Alpha | Thesis tabs, thesis drift, Portfolio X-Ray, Copilot | Not built (Phase 2/5) | |
| Alpha | Parallel Futures | Not built (Phase 3) | |
| Execute | Intent engine, Solver Arena, verifier | Not built (Phase 3) | |
| Execute | Aave V4 Equities Hub adapter | Oracle read live; market/positions/borrow Unavailable | ABI pinning + reserve reads pending |
| Execute | Fork execution receipts | Not built (Phase 4) | needs Base fork (anvil) + funded fork accounts |
| Execute | Kamino / Morpho / Lista | Unavailable (not started) | |
| Guardian | RWA Risk Clock (session + live oracle age) | Read-only | gap stress + headroom in Phase 3 |
| Guardian | CMC vs oracle disagreement flag (>1%) | Live verified | `lib/server/asset.ts` |
| Guardian | Monitors, alerts, policies, kill switch | Not built (Phase 5); automation disabled | |
| Platform | Proof Center: capability matrix + CMC credit ledger | Live verified | `/proof`, `/api/ledger` |
| Platform | SIWE sessions, Postgres persistence | Not built | ledger is in-memory per server process |
