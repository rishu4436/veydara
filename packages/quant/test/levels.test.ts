import { describe, expect, it } from "vitest";
import { completeCandles, detectGaps, fromCmcV5Rows, supportResistanceZones, swingPivots, type Candle } from "../src";

const H = 3_600_000;
/** FIXTURE: synthetic oscillating series between ~95 and ~105 (deterministic, labeled test data). */
function oscillating(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const mid = 100 + 5 * Math.sin((i / 10) * Math.PI);
    return { openTime: i * H, closeTime: (i + 1) * H - 1, open: mid, high: mid + 0.6, low: mid - 0.6, close: mid + 0.1, volume: 1000, closed: true };
  });
}

describe("support/resistance zones", () => {
  it("finds a support band near 95 and resistance band near 105 with multiple touches", () => {
    const r = supportResistanceZones(oscillating(120));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const sup = r.zones.find((z) => z.kind === "support")!;
    const res = r.zones.find((z) => z.kind === "resistance")!;
    expect(sup.low).toBeLessThan(94.5);
    expect(sup.high).toBeGreaterThan(94.3);
    expect(res.high).toBeGreaterThan(105.5);
    expect(sup.touches).toBeGreaterThanOrEqual(3);
    expect(res.touches).toBeGreaterThanOrEqual(3);
    expect(sup.high - sup.low).toBeGreaterThan(0); // a band, never a single price
  });
  it("returns insufficient-data on short series", () => {
    expect(supportResistanceZones(oscillating(10)).status).toBe("insufficient-data");
  });
  it("returns insufficient-data on flat series (ATR 0)", () => {
    const flat = oscillating(60).map((c) => ({ ...c, open: 1, high: 1, low: 1, close: 1 }));
    expect(supportResistanceZones(flat).status).toBe("insufficient-data");
  });
  it("pivots never use future candles beyond the wing (no look-ahead past series end)", () => {
    const c = oscillating(50);
    const piv = swingPivots(c, 3);
    expect(piv.every((p) => p.index <= c.length - 4)).toBe(true);
  });
  it("drops the still-open candle and detects weekend-like gaps", () => {
    const c = oscillating(10);
    c[9] = { ...c[9]!, closed: false };
    expect(completeCandles(c)).toHaveLength(9);
    const gappy = oscillating(10).map((x, i) => (i >= 5 ? { ...x, openTime: x.openTime + 48 * H } : x));
    expect(detectGaps(gappy)).toEqual([{ index: 5, gapMs: 49 * H }]);
  });
  it("maps CMC v5 compact rows and marks future-closing rows as not closed", () => {
    const rows = [[1, 2, 0.5, 1.5, 10, 100, "2026-09-01T00:00:00.000Z", null, null, "2026-09-01T00:14:59.999Z"]];
    const c = fromCmcV5Rows(rows, Date.parse("2026-09-01T00:10:00Z"));
    expect(c[0]!.closed).toBe(false);
    expect(fromCmcV5Rows(rows, Date.parse("2026-09-02T00:00:00Z"))[0]!.closed).toBe(true);
  });
});
