# Execution runbook (Phase 4 — fork only)

**Mainnet execution does not exist in VEYDARA.** All writes go through `packages/execution`, whose guard refuses:
- any RPC URL whose host is not loopback (`127.0.0.1`, `localhost`, `::1`);
- any node whose `eth_chainId` ≠ **31337**, that is not anvil (`anvil_nodeInfo`), or that is not running in fork mode;
- any node where the Aave V4 MAG7 Spoke has no code (i.e. not a Base fork);
- any account that is not one of the fork's anvil-generated accounts;
- any signed transaction whose embedded chain id is not 31337 (checked after signing, before sending).

## Start the fork
```bash
pnpm fork      # anvil --fork-url https://base-rpc.publicnode.com --chain-id 31337 --host 127.0.0.1 --mnemonic-random --config-out /tmp/veydara-fork/anvil-accounts.json
```
`BASE_FORK_UPSTREAM` and `FORK_BLOCK` override the upstream and block. Account keys are written by anvil to a 0600 file outside the repo and only read by the local signer.

## Pipeline (per run)
1. **Fork guard** — as above; records chain id, fork block, upstream host (no path/query).
2. **Validate** — zod intent (`supply | enableCollateral | borrow | repay | withdraw`, base-unit integer amounts, listed reserve ids, anvil account).
3. **Fresh state** — one block: market (`readAaveV4Market`), the account's position, wallet balances, allowances to the Spoke.
4. **Typed route** — calldata from the pinned Spoke ABI (`aave-v4-write-abi.ts`, aave-v4 @ 4885a7ad); approvals for the exact amount only when the allowance is short.
5. **Verifier** — independent exact-rational replay (does not import the math module): reserve flags, wallet balances, add/draw caps, hub liquidity, protocol HF ≥ 1, VEYDARA HF ≥ 1.25.
6. **Simulation** — `evm_snapshot`; each step `eth_call`ed (decoded revert) and applied; Spoke HF read; `evm_revert` always.
7. **Preview** — plain-language steps, HF before → after (verifier and simulation), warnings, notes; `previewHash = keccak256(chainId, account, [to, calldata]…)`.
8. **Confirmation** — the UI requires an explicit checkbox; the server requires the same `previewId` + `previewHash`.
9. **Freshness re-check** — rebuild the route from current fork state; any difference aborts ("re-preview required").
10. **Signing / sending** — local ECDSA with the anvil key via viem (`prepareTransactionRequest` → `signTransaction` → `sendRawTransaction`) to the fork RPC.
11. **Receipts** — status per step; a status-0 receipt is replayed at the parent block to decode the custom error; later steps are not sent. A node rejection during gas estimation is recorded as "not sent" with the decoded reason.
12. **Reconcile** — supplied / debt / wallet / collateral flag vs the verifier's prediction (±2 units rounding; debt within an accrued-interest bound), and VEYDARA bigint HF == Spoke `getUserAccountData` HF.
13. **Proof record** — JSON with every stage, route, verdict, simulation, preview, funding, receipts, before/after positions and reconciliation. Local runs: `FORK_RECORDS_DIR` (default `/tmp/veydara-fork/records`); committed evidence: `fixtures/fork/`.

Blocked runs (validation, verifier or simulation failure) are also recorded, with nothing signed.

## Funding on the fork
`fundFromHolder` scans recent `Transfer` logs of the token (through the fork RPC), picks an existing holder with enough balance (EOA preferred; hub/spokes/treasury excluded so protocol accounting is untouched), impersonates it **on the fork only**, and transfers to the anvil account. The donor and tx hash are recorded.

Coinbase tokenized equities are Base **B20** tokens (node-native precompiles; one-byte `0xef` stub). anvil 1.10 executes them on a Base fork, so transfers, approvals and `transferFrom` by the Spoke run natively.

## Revert drill
`pnpm record:fork` includes an intentional drill: a borrow the verifier rejects is force-sent with fixed gas so the fork mines a status-0 receipt; the record shows the decoded `HealthFactorBelowThreshold()`. The UI never offers this path.

## Emergency Center revoke preparation
`approve(spender, 0)` or `setUserPositionManager(pm, false)` calldata is built for the user's own wallet (chain 8453) and **simulated as the owner on the fork** inside a reverted snapshot (`anvil_impersonateAccount`), reporting the allowance / manager flag before → after. VEYDARA never signs or sends it.
