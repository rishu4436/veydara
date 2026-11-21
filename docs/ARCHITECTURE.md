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

## Not yet present (planned)
PostgreSQL (Drizzle) for ledger/snapshots/proofs, Redis for shared cache across instances, `apps/workers` for monitors, Foundry `contracts/` + anvil Base fork for Phase 4, Playwright e2e.
