# Architecture

```
apps/web                Next.js 16 (App Router, React 19, TS strict, Tailwind v4)
  app/api/*             server routes: capabilities, portfolio, asset, search, rwa, ohlcv, ledger
  lib/server/*          env schema (zod), CMC gateway singleton, portfolio + asset services, rate limiting
  lib/client/*          wagmi config (Base, injected), wallet context (EVM/Solana/watch-only)
  components/*          shell, command palette, holdings, Collateral Passport stage, Risk Clock, chart
packages/domain         provenance, capability statuses, bigint unit math, token identity types, US market session
packages/cmc            endpoint registry, zod schemas, gateway (cache/single-flight/negative cache/backoff/circuit), credit ledger, normalizers
packages/chains         verified token registry, identity + quarantine, Base scan (viem multicall, block-pinned), Solana scan (JSON-RPC)
packages/protocols      Aave V4: addresses (address book), view ABIs (aave-v4 @4885a7ad), block-pinned market/position reads,
                        bigint HF/liquidation math, Parallel Futures, Solver Arena, independent verifier; Chainlink reader
packages/execution      fork-only pipeline: guard (loopback, chain 31337, anvil fork of Base), intent, fresh state, typed route,
                        independent route verifier, snapshot simulation, preview, local signing, receipts, reconcile, records
packages/intent         Capital Intent Engine: bounded constraint schema, presets, deterministic NL grammar (trace + unrecognised clauses),
                        constrained Solver Arena (intent solver + arena solvers, verifier + constraint checks)
packages/auth           SIWE (EIP-4361) nonces/verification (EOA + ERC-1271/6492), sessions, CSRF, multi-wallet linking
packages/store          persistence: Drizzle schema + migrations (Postgres via DATABASE_URL), JSON-file fallback; one Store interface
packages/kamino         read-only Kamino (Solana) adapter on the official klend-sdk: verified xStocks market reserves + owner obligations
packages/quant          candles (CMC v5 + DEX K-line parsers, outlier wicks), indicators, S/R zones, multi-horizon research
fixtures/cmc            CMC fixtures: *.doc.json = docs examples, *.live.json = recorded keyless responses (all labeled)
fixtures/chain          registry verification evidence
tests/live              opt-in live read tests (pnpm test:live)
```

## Data flow: connect → holdings
1. Client obtains an address (wagmi injected / Solana Wallet Standard / watch-only). No signatures.
2. `GET /api/portfolio` → `scanBaseWallet` pins `eth_blockNumber`, reads `eth_getBalance` and one `multicall` of `balanceOf` for the registry at that block → `classifyToken` per holding.
3. Verified holdings → one batched CMC v3 quote via the gateway. Values computed with bigint (`mulAmountByPrice`, floor-rounded micro-USD). Quarantined holdings are never priced.
4. Response carries provenance per number (source, endpoint/contract, block, observed/fetched time, freshness, isSimulated=false).

## Data flow: open asset (Collateral Passport)
On-chain ERC-20 metadata at a pinned block → CMC exact-contract resolution (`resolveContract` requires the address on the right platform) → CMC quote → CMC DEX liquidity → CMC RWA aggregate vs issuer tokens (key) → Aave listing check + live Chainlink feed → US session state → CMC-vs-oracle disagreement flag.

## Data flow: positions → futures → arena
`/api/aave/market` (30 s single-flight cache) pins one block and multicalls Spoke/Hub/Oracle views → `/api/aave/position` reads the user at the same block, recomputes HF with bigint math (must equal the Spoke), derives liquidation prices/headroom and runs Parallel Futures → `/api/strategy` adds eligible wallet holdings as what-if collateral, runs four solvers and verifies each plan independently. No calldata is ever built.

## Stack decisions
| Choice | Why |
|---|---|
| pnpm workspaces, TS source packages (`transpilePackages`) | no build step for internal packages; one typecheck |
| Next.js 16 route handlers as the API layer | keeps keys server-side; one deploy unit for the hackathon |
| viem 2 + wagmi 3 (injected only) | official EVM stack; WalletConnect deferred until a project id exists |
| `@solana/wallet-adapter-react` with Wallet Standard | no per-wallet adapters bundled |
| Zod 4 | runtime validation of every upstream payload and env |
| lightweight-charts 5 | performant financial charts |
| motion | restrained transitions, respects reduced motion via CSS |
| Vitest | unit/contract tests across packages |
| TypeScript 5.9 (not 7.0) | ecosystem (typescript-eslint, Next) compatibility |

## Data flow: SIWE → wallet-signed fork run
`GET /api/auth/nonce` → wallet signs the EIP-4361 message → `POST /api/auth/verify` (nonce burned, fields checked, ecrecover / ERC-1271) → session + CSRF cookies. Fork Lab with signer "My wallet": `POST /api/fork/prepare` (auth + CSRF; intent signer must be a proven wallet; simulation impersonates it in a reverted snapshot) → `POST /api/fork/wallet/begin` (preview hash + freshness re-check → exact steps for chain 31337) → wagmi `switchChain`/`wallet_addEthereumChain` → wallet sends each step to the fork RPC → `POST /api/fork/wallet/finish` (every tx's from/to/calldata/chainId/value checked against the preview) → receipts → reconcile → Proof Center record.

## Data flow: intent → constrained arena
`POST /api/intent {preset | text}` → `parseIntent` (deterministic grammar; errors for out-of-bound values; unrecognised clauses listed) → `effectiveTargetHf` = max(policy 1.25, min HF, 1/(1−drop), 1.24/(1−gap)) → `solveIntent` on the live (or fixture) Aave state → verifier + constraint checks per plan → proof record `intent-solve`.

## Persistence
`createStore()` picks Postgres (node-postgres pool via Drizzle) when `DATABASE_URL` is set, else the JSON file (`.veydara/data.json`, or `/tmp` on Vercel = ephemeral). Tables: users, wallets, siwe_nonces, sessions, guardian_policies, guardian_alerts, proofs, credit_ledger. Migrations: `packages/store/drizzle/` (`pnpm db:generate`, `pnpm db:migrate`). The same contract tests run against PGlite (committed migrations) and the JSON store.

## Not yet present (planned)
Redis for shared cache across instances, `apps/workers` for monitors and push/email alerts.
