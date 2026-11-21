import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, evaluatePolicies, riskRadar, MAX_UINT256, type RadarInput } from "../src";

const base: RadarInput = { healthFactorWad: "1027000000000000000", drawdownToLiquidationBps: "263", gap10HealthFactorWad: "924000000000000000", oracleMaxAgeSeconds: 9 * 3600, marketOpen: false, largestCollateralShare: 1, drawCapUtilisation: 0.42, borrowAprBps: 374 };

describe("risk radar", () => {
  it("scores a near-liquidation single-collateral position as critical", () => {
    const r = riskRadar(base);
    expect(r.overall).toBe("critical");
    expect(r.axes.find((a) => a.id === "health")!.score).toBe(95);
    expect(r.axes.find((a) => a.id === "gap")!.score).toBe(95);
    expect(r.axes.find((a) => a.id === "oracle")!.score).toBe(20); // closed market: expected staleness
    expect(r.axes.find((a) => a.id === "concentration")!.score).toBe(60);
  });
  it("no debt → nothing to liquidate", () => {
    const r = riskRadar({ ...base, healthFactorWad: MAX_UINT256.toString(), drawdownToLiquidationBps: null, gap10HealthFactorWad: null, largestCollateralShare: 0.4, drawCapUtilisation: null, borrowAprBps: null });
    expect(r.hasDebt).toBe(false);
    expect(r.axes.find((a) => a.id === "health")!.level).toBe("none");
    expect(r.score).toBe(20); // only the closed-market oracle note
  });
  it("stale oracle during market hours is high", () => {
    expect(riskRadar({ ...base, marketOpen: true }).axes.find((a) => a.id === "oracle")!.score).toBe(90);
    expect(riskRadar({ ...base, marketOpen: true, oracleMaxAgeSeconds: 600 }).axes.find((a) => a.id === "oracle")!.score).toBe(5);
  });
});

describe("alert policies (monitor-only)", () => {
  it("fires deduplicated, monitor-only alerts and never an action", () => {
    const r = riskRadar(base);
    const a = evaluatePolicies("0xB6c0C00b", "60302763", base, r, DEFAULT_POLICIES);
    expect(a.map((x) => x.policyId).sort()).toEqual(["p-dd", "p-gap", "p-hf"]);
    expect(a.every((x) => x.mode === "monitor" && x.action === "none (monitor-only)")).toBe(true);
    expect(a.find((x) => x.policyId === "p-hf")!.severity).toBe("critical");
    expect(new Set(a.map((x) => x.key)).size).toBe(a.length);
  });
  it("disabled policies stay silent; oracle policy only during market hours", () => {
    const r = riskRadar(base);
    expect(evaluatePolicies("0x1", "1", base, r, DEFAULT_POLICIES.map((p) => ({ ...p, enabled: false })))).toHaveLength(0);
    const open = { ...base, marketOpen: true };
    expect(evaluatePolicies("0x1", "1", open, riskRadar(open), DEFAULT_POLICIES).some((x) => x.policyId === "p-oracle")).toBe(true);
  });
});
