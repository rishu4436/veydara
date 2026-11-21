/** Stage 10 — reconcile: the post-execution on-fork position vs what the verifier predicted, and VEYDARA's HF vs the Spoke's. */
import { accountMath, positionLegs, MAX_UINT256 } from "@veydara/protocols";
import type { FreshState } from "./state";
import type { RouteVerdict } from "./verify-route";

const RAY = 10n ** 27n;
const YEAR = 365n * 24n * 3600n;

export interface Reconciliation {
  ok: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
  healthFactor: { spoke: string; veydara: string; matches: boolean };
}

export function reconcile(v: RouteVerdict, before: FreshState, after: FreshState): Reconciliation {
  const checks: Reconciliation["checks"] = [];
  const dt = BigInt(Math.max(0, after.blockTimestamp - before.blockTimestamp)) + 2n;
  for (const p of v.predicted.reserves) {
    const r = after.market.reserves[p.reserveId]!;
    const a = after.position.reserves[p.reserveId]!;
    const touched = p.supplied !== before.position.reserves[p.reserveId]!.supplied || p.debtRay !== before.position.reserves[p.reserveId]!.debtRay || p.wallet !== (before.wallet[p.reserveId] ?? "0");
    if (!touched) continue;
    const sym = r.symbol ?? `#${r.reserveId}`;
    const sDiff = BigInt(a.supplied) - BigInt(p.supplied);
    checks.push({ name: `${sym} supplied matches prediction (±2 units rounding)`, pass: sDiff >= -2n && sDiff <= 2n, detail: `predicted=${p.supplied} actual=${a.supplied}` });
    const predictedDebt = BigInt(p.debtRay);
    const actualDebt = BigInt(a.debtRay);
    const interestBound = (predictedDebt * BigInt(r.drawnRateRay) * 3n * dt) / (RAY * YEAR) + 2n * RAY; // ≤3× drawn rate covers premium; +2 units share rounding
    checks.push({ name: `${sym} debt matches prediction within accrued-interest bound`, pass: actualDebt + 2n * RAY >= predictedDebt && actualDebt - predictedDebt <= interestBound, detail: `predicted=${predictedDebt / RAY} actual=${actualDebt / RAY} (units), bound=${interestBound / RAY} over ${dt}s` });
    const wDiff = BigInt(after.wallet[p.reserveId] ?? "0") - BigInt(p.wallet);
    checks.push({ name: `${sym} wallet balance matches prediction (±2 units)`, pass: wDiff >= -2n && wDiff <= 2n, detail: `predicted=${p.wallet} actual=${after.wallet[p.reserveId]}` });
    checks.push({ name: `${sym} collateral flag matches`, pass: a.collateralEnabled === p.collateralEnabled, detail: `predicted=${p.collateralEnabled} actual=${a.collateralEnabled}` });
  }
  const { coll, debt } = positionLegs(after.position, after.market);
  const m = accountMath(coll, debt);
  const spoke = after.position.account.healthFactorWad;
  const matches = m.healthFactor.toString() === spoke;
  checks.push({ name: "VEYDARA bigint HF equals Spoke getUserAccountData HF", pass: matches, detail: `veydara=${m.healthFactor} spoke=${spoke}` });
  if (v.predicted.healthFactorWad && BigInt(spoke) !== MAX_UINT256) {
    const pred = BigInt(v.predicted.healthFactorWad);
    const diff = pred > BigInt(spoke) ? pred - BigInt(spoke) : BigInt(spoke) - pred;
    checks.push({ name: "Spoke HF within 0.1% of verifier prediction (interest drift)", pass: diff * 1000n <= pred, detail: `predicted=${pred} spoke=${spoke}` });
  }
  return { ok: checks.every((c) => c.pass), checks, healthFactor: { spoke, veydara: m.healthFactor.toString(), matches } };
}
