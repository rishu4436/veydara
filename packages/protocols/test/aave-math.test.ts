import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountMath, borrowAprBps, drawdownToLiquidationBps, liquidationBonusBps, liquidationPrice, maxAdditionalBorrow, positionLegs, WAD, MAX_UINT256, accruedInterest, type AaveMarket, type AaveUserPosition } from "../src";

const nvda = { amount: 100_000_000n, decimals: 8, price: 130_00000000n, collateralFactorBps: 7000n };
const usdcDebt = { amount: 50_000_000n, decimals: 6, price: 1_00000000n };

describe("Aave V4 math (hand-computed)", () => {
  it("health factor = Σ(CF·value)/debt in WAD", () => {
    const m = accountMath([nvda], [usdcDebt]);
    expect(m.healthFactor).toBe(1_820000000000000000n); // 0.70·130/50
    expect(m.avgCollateralFactorWad).toBe(700000000000000000n);
    expect(accountMath([nvda], []).healthFactor).toBe(MAX_UINT256);
  });
  it("liquidation price rounds up (conservative)", () => {
    expect(liquidationPrice(nvda, [], [usdcDebt])).toBe(7142857143n); // 50/0.70 = 71.428571428…
    expect(liquidationPrice(nvda, [], [])).toBeNull();
  });
  it("max additional borrow at a target HF rounds down", () => {
    expect(maxAdditionalBorrow([nvda], [usdcDebt], { decimals: 6, price: 1_00000000n }, 1_500000000000000000n)).toBe(10_666_666n);
    expect(maxAdditionalBorrow([nvda], [usdcDebt], { decimals: 6, price: 1_00000000n }, 2_000000000000000000n)).toBe(0n);
    expect(() => maxAdditionalBorrow([nvda], [], { decimals: 6, price: 1n }, WAD - 1n)).toThrow();
  });
  it("uniform drawdown to liquidation = 1 − 1/HF", () => {
    expect(drawdownToLiquidationBps(1_820000000000000000n)).toBe(4505n);
    expect(drawdownToLiquidationBps(WAD)).toBe(0n);
    expect(drawdownToLiquidationBps(MAX_UINT256)).toBeNull();
  });
  it("liquidation bonus interpolates between min and max (LiquidationLogic)", () => {
    const cfg = { healthFactorForMaxBonus: 900000000000000000n, liquidationBonusFactor: 9000n };
    expect(liquidationBonusBps(850000000000000000n, cfg, 10550n)).toBe(10550n);
    expect(liquidationBonusBps(950000000000000000n, cfg, 10550n)).toBe(10522n);
    expect(liquidationBonusBps(WAD, cfg, 10550n)).toBe(10495n);
  });
  it("borrow APR and simple interest", () => {
    const rate = 37436185700396797552184836n; // live USDC drawn rate, 2026-11-21
    expect(borrowAprBps(rate, 0n)).toBe(374n);
    expect(borrowAprBps(rate, 1000n)).toBe(411n);
    expect(accruedInterest(1_000_000_000n, 10n ** 26n, 0n, 365n * 86400n)).toBe(100_000_000n); // 10%/yr on 1000 USDC
  });
  it("risk premium weights the collateral covering debt by ascending collateral risk", () => {
    const risky = { amount: 100_000_000n, decimals: 8, price: 100_00000000n, collateralFactorBps: 5500n, collateralRiskBps: 1000n };
    const m = accountMath([{ ...nvda, collateralRiskBps: 0n }, risky], [{ amount: 200_000_000n, decimals: 6, price: 1_00000000n }]);
    // $130 risk-0 covers 130 of 200 debt, remaining 70 by risk 1000 ⇒ ceil(70·1000/200) = 350
    expect(m.riskPremiumBps).toBe(350n);
  });
});

describe("Aave V4 math vs live Spoke (recorded fixtures)", () => {
  const market = JSON.parse(readFileSync("fixtures/chain/aave-v4-market.live.json", "utf8")) as AaveMarket;
  const rec = JSON.parse(readFileSync("fixtures/chain/aave-v4-positions.live.json", "utf8")) as { positions: AaveUserPosition[] };
  it.each(rec.positions.map((p) => [p.user, p] as const))("reproduces getUserAccountData.healthFactor exactly for %s", (_u, p) => {
    const { coll, debt } = positionLegs(p, market);
    const m = accountMath(coll, debt);
    expect(m.healthFactor.toString()).toBe(p.account.healthFactorWad);
    expect(m.totalCollateralValue.toString()).toBe(p.account.totalCollateralValue);
    expect(m.riskPremiumBps.toString()).toBe(p.account.riskPremiumBps);
  });
});
