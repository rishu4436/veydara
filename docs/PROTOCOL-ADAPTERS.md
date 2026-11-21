# Protocol adapters

Registry: `packages/protocols/src/capabilities.ts`. A capability is `implemented: true` only when code, verified addresses and tests exist.

## Aave V4 — Equities Hub (Base)
- Addresses: `packages/protocols/src/aave-v4-base.ts`, pinned to the address-book commit `967c772c`.
- Implemented: `oracleRead` — `latestRoundData/decimals/description` on the MAG7 spoke feeds at a pinned block (`oracle.ts`), live-tested (`tests/live`).
- Pending: pin the V4 Hub/Spoke ABIs from the official aave-v4 repository; read reserve config (caps, LTV, liquidation threshold, paused/frozen), utilization and rates; read user positions; then quote borrow. Execution (deposit/borrow/repay/withdraw) only on an anvil Base fork with labeled receipts until the owner approves otherwise.

## Kamino (Solana), Morpho, Lista (BNB)
Not started. Rule: only exact verified RWA markets may be shown as eligible; no token of an issuer is assumed to work in another protocol.
