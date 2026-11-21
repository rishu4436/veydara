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

## Kamino (Solana) — read-only
- SDK: official `@kamino-finance/klend-sdk` 14.0.0 with `@solana/kit` (https://www.npmjs.com/package/@kamino-finance/klend-sdk).
- Program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` (SDK `PROGRAM_ID`, checked at runtime) and the **xStocks market** `5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua` from Kamino's xStocks deposit guide (https://docs.kamino.com). `packages/kamino/src/types.ts::KAMINO_SOURCE`; any other market id is refused.
- Implemented: `marketDiscovery` (reserves: symbol, mint, LTV, liquidation LTV, supply/borrow APY, deposits, borrows, oracle price) and `readPositions` (all obligations of an owner: deposits, debt, LTV, liquidation LTV, distance to liquidation = 1 − LTV/liqLTV).
- Recorded live (slot 472097135): `fixtures/chain/kamino-xstocks-*.live.json`; the public sample borrower's obligation held NVDAx/GOOGLx/MSTRx ($255.80) against $94.66 USDC, LTV 0.370 vs liquidation LTV 0.5405 (31.5 % to liquidation).
- Not built: deposits, borrows, repay, liquidation. xStocks (Backed) are different issuer tokens from Coinbase's Base equities; identity is per (chain, mint).

## Morpho (Base) — researched, not built
- Steakhouse-curated Morpho markets accept Coinbase tokenized equities on Base (AAPLc/GOOGLc/NVDAc/METAc/SPCXc) per the Steakhouse announcement and press coverage (sources in `capabilities.ts`).
- Blocker: no market ids pinned from an official Morpho/Steakhouse registry yet, so nothing is shown as eligible.

## Lista (BNB Chain) — blocked
- Lista's bStocks lending uses Binance bStocks on BNB Chain with an Atlas oracle (https://docs.bsc.lista.org, Lista blog).
- Blocked: different issuer tokens and oracle, no verified market list, no BNB chain reader in VEYDARA.

Rule: only exact verified RWA markets may be shown as eligible; no token of an issuer is assumed to work in another protocol.
