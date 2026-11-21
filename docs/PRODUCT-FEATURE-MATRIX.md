# Product feature matrix

Status values match the in-app badges: **Live verified**, **Read-only**, **Fork/testnet**, **Simulation**, **Unavailable**. The app computes badges server-side (`apps/web/lib/server/capabilities.ts`); this table is the planning view as of 2026-11-21 (updated after Phase 5).

| Pillar | Feature | Status | Evidence / blocker |
|---|---|---|---|
| Discover | Base wallet connect (wagmi injected) | Read-only | `lib/client/wagmi.ts`; signatures only for SIWE and fork transactions (chain 31337) |
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
| Execute | Capital Intent Engine: presets + natural-language goals → typed, bounded constraints (deterministic grammar; out-of-range values rejected, never clamped) → constrained Solver Arena + verifier | Simulation | `packages/intent`, `/api/intent`, Strategies page; LLM explainer not configured (deterministic template) |
| Execute | Aave V4 Equities Hub: reserves (CF, bonus, fee, risk, caps, liquidity, rates, prices) and user positions | Live verified | ABIs @ aave-v4 `4885a7ad`; `/positions`, `/api/aave/*` |
| Execute | Borrowing / HF / liquidation-price math (bigint) | Live verified | exact match with Spoke HF on 5 live borrowers |
| Execute | Fork execution: supply, use as collateral, borrow USDC, partial repay, withdraw (Aave V4 MAG7 Spoke) | Fork/testnet | `packages/execution`, `/fork`; receipts + reconciliation in `fixtures/fork/*.fork.json` |
| Execute | Pipeline stages (validate → fork guard → fresh state → typed route → verifier → simulation → preview → signing → sending → receipts → reconcile → proof) | Fork/testnet | every stage recorded per run; blocked and reverted runs recorded |
| Execute | Revert handling (decoded Spoke/Hub/SafeERC20 custom errors; unknown selectors shown raw) | Fork/testnet | revert drill record: `HealthFactorBelowThreshold()` |
| Execute | User-wallet signing on the fork: wagmi adds/switches to chain 31337, the SIWE-proven wallet signs each previewed step; server checks from/to/calldata/chainId/value of every tx against the preview, then receipts → reconcile → proof | Fork/testnet | `packages/execution/src/wallet-exec.ts`, `components/fork-wallet.tsx`; evidence `fixtures/fork/wallet-*.fork.json`; `tests/e2e-fork/wallet.spec.ts` |
| Execute | Mainnet execution | Unavailable by design | shown as "Mainnet signing: unavailable"; signers refuse chain ≠ 31337 and non-loopback RPCs |
| Execute | Kamino (Solana) xStocks market: reserves + any owner's obligations, LTV / liquidation LTV / distance to liquidation | Read-only | `packages/kamino` (official klend-sdk 14); verified program + market only; deposits/borrows not built |
| Execute | Morpho (Base, Steakhouse markets on Coinbase equities) | Unavailable — researched, not built | market ids not pinned from an official source |
| Execute | Lista (BNB Chain bStocks) | Unavailable — blocked | different issuer tokens (Binance bStocks) and oracle; no verified market list |
| Guardian | RWA Risk Clock (session, oracle age, re-open gap stress on the live position) | Live verified | `components/risk-clock.tsx` |
| Guardian | CMC vs oracle disagreement flag (>1%) | Live verified | `lib/server/asset.ts` |
| Guardian | Risk radar (health, distance, Monday gap, oracle freshness, concentration, draw-cap capacity, rate) | Live verified | `packages/protocols/src/guardian.ts`, `/guardian` |
| Guardian | In-app alert center: monitor-only policies, de-duplicated inbox, acknowledge, 60 s re-evaluation while open | Read-only | in-browser; synced to the server store (`/api/guardian/policies`, `/alerts`) when signed in; no push/email channel; no action mode exists |
| Guardian | Emergency center: positions, allowances (address book + Approval-log discovery), position managers | Live verified | `/api/guardian/allowances` |
| Guardian | Revoke preparation (approve(spender,0), setUserPositionManager(pm,false)) | Fork/testnet | simulated as the owner in a reverted anvil snapshot; never sent |
| Guardian | Automated protection / kill switch | Unavailable by design | |
| Platform | Proof Center: fork execution records, capability matrix + CMC credit ledger | Live verified | `/proof`, `/api/proof/records`, `/api/ledger` |
| Platform | Playwright e2e on a controlled fixture dataset (wallet → analysis → risk → simulation → proof) | CI | `tests/e2e/flow.spec.ts`, `VEYDARA_DATASET=fixture` |
| Platform | SIWE (EIP-4361) sign-in: single-use server nonces, 1 h HttpOnly SameSite=Strict cookies (`__Host-` + Secure over HTTPS), CSRF header + same-origin check, multi-wallet ownership proof | Live verified | `packages/auth` (9 tests), `/api/auth/*`, `/account`; EOA via ecrecover, contract wallets via ERC-1271/6492 on Base |
| Platform | Persistence: Postgres via Drizzle (migrations) for users, wallets, nonces, sessions, policies, alerts, proofs, credit ledger; JSON-file fallback without `DATABASE_URL` | Built; Postgres verified locally | `packages/store` (contract tests on PGlite + JSON); no cloud database provisioned |
| Platform | Opt-in fork e2e: SIWE → add chain 31337 → wallet-signed lifecycle | Fork/testnet | `pnpm e2e:fork` (needs `pnpm fork`); not in CI |
