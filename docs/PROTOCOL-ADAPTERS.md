# Protocol adapters

Registry: `packages/protocols/src/capabilities.ts`. A capability is `implemented: true` only when code, verified addresses and tests exist.

## Aave V4 — Equities Hub (Base)
- Addresses: `packages/protocols/src/aave-v4-base.ts`, pinned to the address-book commit `967c772c`.
- ABIs: `aave-v4-abi.ts`, transcribed from aave/aave-v4 @ `4885a7ad` interfaces and verified by live `eth_call` decoding.
- Implemented (live, block-pinned):
  - `oracleRead` — Chainlink feeds (`oracle.ts`) and the spoke oracle `getReservePrice`.
  - `marketDiscovery` — `readAaveV4Market`: per reserve CF, max liquidation bonus, liquidation fee, collateral risk, paused/frozen/borrowable, spoke add/draw caps (uncapped = `MAX_ALLOWED_SPOKE_CAP`), spoke active/halted, hub liquidity, drawn rate, oracle price; spoke liquidation config.
  - `readPositions` — `readAaveV4Position`: per-reserve collateral/borrow flags, supplied assets, total debt and full-precision debtRay, plus `getUserAccountData`.
  - `quoteBorrow` — deterministic math + Solver Arena + verifier (simulation only).
- Aave V4 has a single collateral factor per reserve (no separate LTV/liquidation threshold); user positions keep the dynamic-config key they opened with, so a reserve config change applies to a user only after refresh — VEYDARA currently reads the reserve's latest key and matched the Spoke exactly for all sampled users (key 0 everywhere at block 60302763).
- Fork execution (Phase 4): supply, use as collateral, borrow, repay, withdraw via `packages/execution` on a local anvil fork only (see docs/EXECUTION-RUNBOOK.md). Write ABIs: `aave-v4-write-abi.ts`.
- Pending: per-user dynamic config key read for robustness; liquidation calls are not exposed.

## Kamino (Solana), Morpho, Lista (BNB)
Not started. Rule: only exact verified RWA markets may be shown as eligible; no token of an issuer is assumed to work in another protocol.
