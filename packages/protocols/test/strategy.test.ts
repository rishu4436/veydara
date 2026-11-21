import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parallelFutures, solverArena, verifyPlan, POLICY, type AaveMarket, type AaveUserPosition, type Book } from "../src";

const market = JSON.parse(readFileSync("fixtures/chain/aave-v4-market.live.json", "utf8")) as AaveMarket;
const { positions } = JSON.parse(readFileSync("fixtures/chain/aave-v4-positions.live.json", "utf8")) as { positions: AaveUserPosition[] };
const usdc = market.reserves.find((r) => r.symbol === "USDC")!;
const nvdac = market.reserves.find((r) => r.symbol === "NVDAc")!;

function bookOf(p: AaveUserPosition): Book {
  return {
    collateral: p.reserves.filter((r) => r.collateralEnabled && BigInt(r.supplied) > 0n).map((r) => ({ reserveId: r.reserveId, amount: BigInt(r.supplied), supplied: true })),
    debt: p.reserves.filter((r) => BigInt(r.debtRay) > 0n).map((r) => ({ reserveId: r.reserveId, amount: BigInt(r.debt), amountRay: BigInt(r.debtRay) })),
  };
}

describe("Parallel Futures on a recorded live position", () => {
  const p = positions[0]!;
  const f = parallelFutures(bookOf(p), market);
  it("the 'now' scenario equals the Spoke's own health factor", () => {
    expect(f[0]!.healthFactorWad).toBe(p.account.healthFactorWad);
  });
  it("deeper equity shocks never improve health", () => {
    const hf = (id: string) => BigInt(f.find((s) => s.id === id)!.healthFactorWad);
    expect(hf("gap10")).toBeLessThanOrEqual(hf("now"));
    expect(hf("gap20")).toBeLessThan(hf("gap10"));
    expect(hf("crash35")).toBeLessThan(hf("gap20"));
    expect(hf("rates")).toBeLessThan(hf("now"));
  });
});

describe("Solver Arena + independent verifier", () => {
  // What-if: supply 10 NVDAc (not yet supplied), borrow USDC. Wallet balance given explicitly.
  const book: Book = { collateral: [{ reserveId: nvdac.reserveId, amount: 10n * 10n ** 8n, supplied: false }], debt: [] };
  const plans = solverArena(book, market, usdc.reserveId);
  const verdicts = plans.map((pl) => verifyPlan(pl, book, market, POLICY.minHealthFactorWad, { [nvdac.reserveId]: 10n * 10n ** 8n }));
  it("accepts conservative plans and their HF claims match exactly", () => {
    for (const v of verdicts.filter((v) => v.solver !== "Aggressive")) {
      expect(v.accepted, JSON.stringify(v.checks.filter((c) => !c.pass))).toBe(true);
    }
  });
  it("rejects the aggressive plan on the policy floor", () => {
    const v = verdicts.find((v) => v.solver === "Aggressive")!;
    expect(v.accepted).toBe(false);
    expect(v.checks.find((c) => c.name.includes("policy"))!.pass).toBe(false);
  });
  it("rejects a plan exceeding the wallet balance or a non-borrowable reserve", () => {
    const pl = plans[0]!;
    expect(verifyPlan(pl, book, market, POLICY.minHealthFactorWad, { [nvdac.reserveId]: 1n }).accepted).toBe(false);
    expect(verifyPlan({ ...pl, borrowReserveId: nvdac.reserveId }, book, market, POLICY.minHealthFactorWad, { [nvdac.reserveId]: 10n * 10n ** 8n }).accepted).toBe(false);
  });
  it("orders borrow size by target HF", () => {
    const amt = (s: string) => BigInt(plans.find((p) => p.solver === s)!.borrowAmount);
    expect(amt("Fortress")).toBeLessThan(amt("Buffer-35"));
    expect(amt("Gap-proof")).toBeLessThanOrEqual(amt("Buffer-35"));
    expect(amt("Buffer-35")).toBeLessThan(amt("Aggressive"));
  });
});
