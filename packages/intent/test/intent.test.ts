import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AaveMarket, AaveUserPosition, Book } from "@veydara/protocols";
import { effectiveTargetHf, parseIntent, solveIntent, DEFAULT_CONSTRAINTS } from "../src";

const market = JSON.parse(readFileSync("fixtures/chain/aave-v4-market.live.json", "utf8")) as AaveMarket;
const { positions } = JSON.parse(readFileSync("fixtures/chain/aave-v4-positions.live.json", "utf8")) as { positions: AaveUserPosition[] };
const usdc = market.reserves.find((r) => r.symbol === "USDC")!;
const bookOf = (p: AaveUserPosition): Book => ({
  collateral: p.reserves.filter((r) => r.collateralEnabled && BigInt(r.supplied) > 0n).map((r) => ({ reserveId: r.reserveId, amount: BigInt(r.supplied), supplied: true })),
  debt: p.reserves.filter((r) => BigInt(r.debtRay) > 0n).map((r) => ({ reserveId: r.reserveId, amount: BigInt(r.debt), amountRay: BigInt(r.debtRay) })),
});

describe("deterministic intent parser", () => {
  it("parses a full sentence into typed constraints with a trace", () => {
    const r = parseIntent("Borrow $2,500 USDC against my NVDA and Tesla, keep HF above 1.8, survive a 30% drop, APR under 12% for 3 months");
    expect(r.ok).toBe(true);
    expect(r.constraints).toMatchObject({ goal: "borrow", borrowAmountUsd: 2500, collateral: ["NVDAc", "TSLAc"], minHealthFactor: 1.8, survivesDropPct: 30, maxAprPct: 12, horizonDays: 90 });
    expect(r.trace.map((t) => t.field).sort()).toEqual(["borrowAmountUsd", "collateral", "horizonDays", "maxAprPct", "minHealthFactor", "survivesDropPct"]);
    expect(r.unrecognised).toEqual([]);
  });

  it("is deterministic and reports what it could not understand", () => {
    const a = parseIntent("borrow max against apple, buy a yacht");
    expect(a).toEqual(parseIntent("borrow max against apple, buy a yacht"));
    expect(a.constraints).toMatchObject({ borrowAmountUsd: null, collateral: ["AAPLc"] });
    expect(a.unrecognised).toEqual(["buy a yacht"]);
  });

  it("rejects out-of-bound values instead of clamping", () => {
    expect(parseIntent("survive a 95% crash").errors[0]).toMatch(/outside the allowed range/);
    expect(parseIntent("borrow 50m").errors[0]).toMatch(/outside the allowed range/);
    expect(parseIntent("keep hf above 12").ok).toBe(false);
  });

  it("enforces the policy floor and flags conflicting goals", () => {
    const r = parseIntent("keep health factor 1.1");
    expect(r.ok).toBe(true);
    expect(r.notes[0]).toMatch(/policy floor/);
    expect(effectiveTargetHf(r.constraints!).hf).toBe(1.25);
    expect(parseIntent("protect my position and borrow 500").errors[0]).toMatch(/Conflicting/);
  });

  it("monday gap and presets map to the documented HF targets", () => {
    expect(effectiveTargetHf(parseIntent("handle a 20% monday gap").constraints!).hf).toBe(1.55);
    expect(effectiveTargetHf(parseIntent("", { preset: "fortress" }).constraints!).hf).toBe(2);
    expect(effectiveTargetHf({ ...DEFAULT_CONSTRAINTS, survivesDropPct: 35 }).hf).toBeCloseTo(1.5385, 4);
  });
});

describe("intent → Solver Arena", () => {
  const p = positions.find((x) => x.reserves.some((r) => BigInt(r.debtRay) > 0n) && BigInt(x.account.healthFactorWad) > 2n * 10n ** 18n)!;

  it("max-borrow intent picks a verified plan that meets the effective target", () => {
    const c = parseIntent("borrow max, survive a 40% drop").constraints!;
    const s = solveIntent({ constraints: c, book: bookOf(p), market, wallet: {}, borrowReserveId: usdc.reserveId, currentHfWad: p.account.healthFactorWad });
    expect(s.outcome).toBe("solved");
    const chosen = s.plans.find((x) => x.plan.solver === s.chosen)!;
    expect(chosen.verdict.accepted).toBe(true);
    expect(BigInt(chosen.verdict.hfIndependent!)).toBeGreaterThanOrEqual(BigInt(s.target.hfWad));
    // The Aggressive arena solver can never satisfy a 40% drop constraint.
    expect(s.plans.find((x) => x.plan.solver === "Aggressive")!.satisfiesAll).toBe(false);
  });

  it("an infeasible fixed amount is rejected honestly", () => {
    const c = parseIntent("borrow 9,000,000 usdc, keep hf above 2").constraints!;
    const s = solveIntent({ constraints: c, book: bookOf(p), market, wallet: {}, borrowReserveId: usdc.reserveId, currentHfWad: p.account.healthFactorWad });
    expect(s.outcome).toBe("no-feasible-plan");
    expect(s.plans[0]!.plan.solver).toBe("Intent");
    expect(s.plans[0]!.satisfiesAll).toBe(false);
  });

  it("protect goal reports without proposing debt", () => {
    const s = solveIntent({ constraints: parseIntent("protect").constraints!, book: bookOf(p), market, wallet: {}, borrowReserveId: usdc.reserveId, currentHfWad: p.account.healthFactorWad });
    expect(s.outcome).toBe("protect-report");
    expect(s.plans).toHaveLength(0);
  });
});
