import type { AaveMarket, AaveUserPosition } from "./aave-v4-reads";
import type { CollateralLeg, DebtLeg } from "./aave-v4-math";

/** Convert an on-chain position + market snapshot into math legs (same block, same oracle prices). */
export function positionLegs(p: AaveUserPosition, m: AaveMarket): { coll: CollateralLeg[]; debt: DebtLeg[] } {
  const coll: CollateralLeg[] = [];
  const debt: DebtLeg[] = [];
  for (const r of p.reserves) {
    const res = m.reserves[r.reserveId]!;
    if (r.collateralEnabled && BigInt(r.supplied) > 0n) coll.push({ amount: BigInt(r.supplied), decimals: res.decimals, price: BigInt(res.price), collateralFactorBps: BigInt(res.collateralFactorBps), collateralRiskBps: BigInt(res.collateralRiskBps) });
    if (BigInt(r.debt) > 0n || BigInt(r.debtRay) > 0n) debt.push({ amount: BigInt(r.debt), amountRay: BigInt(r.debtRay), decimals: res.decimals, price: BigInt(res.price) });
  }
  return { coll, debt };
}
