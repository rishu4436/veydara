import type { Candle, Series } from "./candles";

export function sma(values: number[], period: number): Series {
  if (period < 1) throw new Error("period must be >= 1");
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values (standard convention). */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI. Lookback: period+1 closes before the first value. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let ag = gain / period;
  let al = loss / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): { macd: Series; signal: Series; histogram: Series } {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line: Series = closes.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i]! - es[i]! : null));
  const firstIdx = line.findIndex((v) => v !== null);
  const sig: Series = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[];
    const s = ema(compact, signal);
    s.forEach((v, j) => (sig[firstIdx + j] = v));
  }
  const hist: Series = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i]! : null));
  return { macd: line, signal: sig, histogram: hist };
}

export function trueRange(c: Candle[]): number[] {
  return c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1]!.close), Math.abs(x.low - c[i - 1]!.close))));
}

/** Wilder ATR seeded with the simple mean of the first `period` true ranges. */
export function atr(c: Candle[], period = 14): Series {
  const tr = trueRange(c);
  const out: Series = new Array(c.length).fill(null);
  if (c.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < c.length; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}

/** Stdev of log returns over `period`, not annualized (caller annualizes per timeframe). */
export function volatility(closes: number[], period = 20): Series {
  const r = closes.map((x, i) => (i === 0 ? null : Math.log(x / closes[i - 1]!)));
  return r.map((_, i) => {
    if (i < period) return null;
    const w = r.slice(i - period + 1, i + 1) as number[];
    const m = w.reduce((a, b) => a + b, 0) / period;
    return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (period - 1));
  });
}

export function classicPivots(prev: { high: number; low: number; close: number }) {
  const p = (prev.high + prev.low + prev.close) / 3;
  return { p, r1: 2 * p - prev.low, s1: 2 * p - prev.high, r2: p + (prev.high - prev.low), s2: p - (prev.high - prev.low) };
}

export function fibonacciLevels(swingLow: number, swingHigh: number) {
  const d = swingHigh - swingLow;
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: swingHigh - d * r }));
}

/** Indicator lookback requirements, surfaced in the UI as "insufficient data" reasons. */
export const LOOKBACK = { sma200: 200, ema200: 200, rsi14: 15, macd: 34, atr14: 14 } as const;
