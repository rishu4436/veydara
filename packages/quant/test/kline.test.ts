import { describe, expect, it } from "vitest";
import { completeCandles, fromCmcKlineRows, INTERVAL_MS } from "../src";

describe("fromCmcKlineRows", () => {
  // Rows copied from a live keyless /v1/k-line/candles response for NVDAc on Base (2026-11-21), truncated.
  const rows = [
    ["156.119943194067510489", "163.650952175668020371", "149.545032238115464022", "161.338904713645571267", "17557048.33", 1794873600000, 1809],
    ["129.361356102911372830", "131.285763978600598058", "127.033265265004590928", "128.787161025850634282", 8411017.54, 1795219200000, 1021],
  ] as (number | string)[][];
  it("parses ms timestamps and string numbers, and marks the forming candle open", () => {
    const now = 1795219200000 + 3_600_000; // one hour into the last daily candle
    const c = fromCmcKlineRows(rows, INTERVAL_MS["1d"]!, now);
    expect(c).toHaveLength(2);
    expect(c[0]!.openTime).toBe(1794873600000);
    expect(c[0]!.close).toBeCloseTo(161.3389, 4);
    expect(c[1]!.closed).toBe(false);
    expect(completeCandles(c)).toHaveLength(1);
  });
  it("accepts second-based timestamps as documented", () => {
    const c = fromCmcKlineRows([[1, 2, 0.5, 1.5, 10, 1794873600, 3]], INTERVAL_MS["1h"]!, 1794873600000 + 7_200_000);
    expect(c[0]!.openTime).toBe(1794873600000);
    expect(c[0]!.closed).toBe(true);
  });
});

import { horizonRead, horizonConsensus } from "../src";
describe("horizonRead", () => {
  const mk = (closes: number[]) => closes.map((c, i) => ({ openTime: i * 3_600_000, closeTime: (i + 1) * 3_600_000, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1, closed: true }));
  it("labels a steady rise as up with the rule attached", () => {
    const r = horizonRead("1h", mk(Array.from({ length: 80 }, (_, i) => 100 + i)));
    expect(r.trend).toBe("up");
    expect(r.trendRule).toMatch(/EMA20/);
    expect(r.rsiState).toBe("overbought");
  });
  it("refuses to call a trend on short history", () => {
    const r = horizonRead("1d", mk([1, 2, 3]));
    expect(r.trend).toBe("insufficient-data");
    expect(horizonConsensus([r]).aligned).toBe("insufficient-data");
  });
  it("reports mixed horizons honestly", () => {
    const up = horizonRead("1h", mk(Array.from({ length: 80 }, (_, i) => 100 + i)));
    const down = horizonRead("1d", mk(Array.from({ length: 80 }, (_, i) => 200 - i)));
    expect(horizonConsensus([up, down]).aligned).toBe("mixed");
  });
});
