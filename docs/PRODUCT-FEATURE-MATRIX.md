# Product feature matrix

Status values match the in-app badges: **Live verified**, **Read-only**, **Fork/testnet**, **Simulation**, **Unavailable**. The app computes badges server-side (`apps/web/lib/server/capabilities.ts`); this table is the planning view as of 2026-11-21 (updated after Phase 2–3).

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
| Discover | CMC RWA quotes: aggregate vs issuer tokens | Unavailable — project key returns 402/1004 (plan expired) | gateway reports `CMC_PLAN_EXPIRED`; renders automatically once the key is active |
| Discover | Issuer graph (underlying → issuer tokens, SVG) | Built; Unavailable (402/1004) | `/api/issuers`, `components/analysis.tsx` |
| Discover | Capital Constellation (holdings → underlying → venues → live Aave position) with table fallback | Live verified | `components/constellation.tsx` |
| Alpha | Indicator engine (SMA/EMA/RSI/MACD/ATR/vol/pivots/Fib) | Built, fixture-tested | `packages/quant`; Wilder RSI checked against an independent reference |
| Alpha | Support/resistance zones (clustered pivots, ATR tolerance, insufficient-data) | Built, fixture-tested | `packages/quant/src/levels.ts` |
| Alpha | Candlestick chart (1h/4h/1d/1w) with EMA20/50, S/R zones, RSI/MACD/ATR, table view, outlier-wick disclosure | Live verified (CMC DEX K-line, keyless) | `/api/ohlcv`; CEX-aggregated v5 OHLCV blocked by 402 |
| Alpha | Multi-horizon research (1h/4h/1d trend, RSI, ATR%, nearest zones, consensus, sources) | Live verified | `/api/research`, `packages/quant/src/research.ts` |
| Alpha | Thesis tabs, thesis drift, Portfolio X-Ray, Copilot | Not built (Phase 2/5) | |
| Alpha | Parallel Futures (gap −10/−20, crash −35, single-name −40, debt +2%, rates ×2 for 90d) | Simulation on live state | `packages/protocols/src/strategy.ts`, `/futures` |
| Execute | Solver Arena (4 solvers) + independent rational-arithmetic verifier (caps, liquidity, reserve state, balances, HF policy 1.25) | Simulation | `strategy.ts`, `verifier.ts`, `/strategies` |
| Execute | Free-form intent engine | Not built | |
| Execute | Aave V4 Equities Hub: reserves (CF, bonus, fee, risk, caps, liquidity, rates, prices) and user positions | Live verified | ABIs @ aave-v4 `4885a7ad`; `/positions`, `/api/aave/*` |
| Execute | Borrowing / HF / liquidation-price math (bigint) | Live verified | exact match with Spoke HF on 5 live borrowers |
| Execute | Fork execution receipts | Not built (Phase 4) | needs Base fork (anvil) + funded fork accounts |
| Execute | Kamino / Morpho / Lista | Unavailable (not started) | |
| Guardian | RWA Risk Clock (session, oracle age, re-open gap stress on the live position) | Live verified | `components/risk-clock.tsx` |
| Guardian | CMC vs oracle disagreement flag (>1%) | Live verified | `lib/server/asset.ts` |
| Guardian | Monitors, alerts, policies, kill switch | Not built (Phase 5); automation disabled | |
| Platform | Proof Center: capability matrix + CMC credit ledger | Live verified | `/proof`, `/api/ledger` |
| Platform | SIWE sessions, Postgres persistence | Not built | ledger is in-memory per server process |
