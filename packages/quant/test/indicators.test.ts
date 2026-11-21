import { describe, expect, it } from "vitest";
import { atr, classicPivots, ema, fibonacciLevels, macd, rsi, sma, volatility, type Candle } from "../src";

// FIXTURE: Wilder RSI reference closes (the widely published StockCharts RSI worked example).
const RSI_CLOSES = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];

describe("indicator engine", () => {
  it("SMA", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("EMA seeded by SMA", () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[2]).toBe(2);
    expect(e[3]).toBeCloseTo(3, 10); // 4*0.5 + 2*0.5
    expect(e[4]).toBeCloseTo(4, 10);
  });
  it("RSI matches the published Wilder worked example", () => {
    const r = rsi(RSI_CLOSES, 14);
    expect(r[13]).toBeNull();
    // Independent reference (unrounded Wilder recurrence computed separately in Python):
    const reference = [70.4641, 66.2496, 66.4809, 69.3469, 66.2947, 57.915];
    reference.forEach((v, i) => expect(r[14 + i]).toBeCloseTo(v, 3));
    // The published worked example (70.53, 66.32, 66.55, 69.41, 66.36, 57.97) rounds
    // intermediate averages to 2 dp, so it differs by < 0.1.
    [70.53, 66.32, 66.55, 69.41, 66.36, 57.97].forEach((v, i) => expect(Math.abs(r[14 + i]! - v)).toBeLessThan(0.1));
  });
  it("RSI edge cases: monotonic up = 100, too short = all null", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).at(-1)).toBe(100);
    expect(rsi([1, 2], 14).every((v) => v === null)).toBe(true);
  });
  it("MACD line equals EMA12-EMA26 and histogram = line - signal", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.1);
    const m = macd(closes);
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).toBeCloseTo(e12[25]! - e26[25]!, 10);
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).not.toBeNull();
    expect(m.histogram[40]).toBeCloseTo(m.macd[40]! - m.signal[40]!, 10);
  });
  it("ATR on constant-range candles equals that range", () => {
    const c: Candle[] = Array.from({ length: 20 }, (_, i) => ({ openTime: i, closeTime: i + 1, open: 10, high: 11, low: 9, close: 10, volume: 1, closed: true }));
    expect(atr(c, 14)[13]).toBe(2);
    expect(atr(c, 14)[19]).toBeCloseTo(2, 10);
  });
  it("volatility of constant-growth series is ~0", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i);
    expect(volatility(closes, 20).at(-1)).toBeCloseTo(0, 10);
  });
  it("classic pivots and fibonacci", () => {
    const p = classicPivots({ high: 110, low: 90, close: 100 });
    expect(p).toEqual({ p: 100, r1: 110, s1: 90, r2: 120, s2: 80 });
    expect(fibonacciLevels(100, 200).find((l) => l.ratio === 0.5)!.price).toBe(150);
  });
});
