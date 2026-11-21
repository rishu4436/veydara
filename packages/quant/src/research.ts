/**
 * Multi-horizon technical read: deterministic facts only (no forecasts, no
 * buy/sell calls). Each horizon carries its own candle source and the exact
 * rules used, so the UI can show "why" next to every statement.
 */
import type { Candle } from "./candles";
import { atr, ema, rsi, volatility } from "./indicators";
import { supportResistanceZones, type Zone } from "./levels";

export type Trend = "up" | "down" | "range" | "insufficient-data";

export interface HorizonRead {
  horizon: string;
  candles: number;
  lastClose: number | null;
  lastCloseTime: number | null;
  trend: Trend;
  trendRule: string;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  rsiState: "overbought" | "oversold" | "neutral" | null;
  atrPct: number | null;
  volatility20: number | null;
  changePct: number | null;
  nearestSupport: Pick<Zone, "low" | "high" | "quality" | "touches"> | null;
  nearestResistance: Pick<Zone, "low" | "high" | "quality" | "touches"> | null;
  notes: string[];
}

const last = <T>(a: (T | null)[]): T | null => (a.length ? (a[a.length - 1] ?? null) : null);

export function horizonRead(horizon: string, c: Candle[]): HorizonRead {
  const closes = c.map((x) => x.close);
  const lc = closes.length ? closes[closes.length - 1]! : null;
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const r = last(rsi(closes, 14));
  const a = last(atr(c, 14));
  const v = last(volatility(closes, 20));
  const notes: string[] = [];
  let trend: Trend = "insufficient-data";
  const trendRule = "up: close > EMA20 > EMA50; down: close < EMA20 < EMA50; otherwise range";
  if (lc !== null && e20 !== null && e50 !== null) {
    trend = lc > e20 && e20 > e50 ? "up" : lc < e20 && e20 < e50 ? "down" : "range";
  } else notes.push(`Needs ≥50 closed candles for EMA50 (have ${c.length}).`);
  const z = supportResistanceZones(c);
  let sup: HorizonRead["nearestSupport"] = null;
  let res: HorizonRead["nearestResistance"] = null;
  if (z.status === "ok" && lc !== null) {
    const below = z.zones.filter((x) => x.high < lc).sort((x, y) => y.high - x.high)[0];
    const above = z.zones.filter((x) => x.low > lc).sort((x, y) => x.low - y.low)[0];
    if (below) sup = { low: below.low, high: below.high, quality: below.quality, touches: below.touches };
    if (above) res = { low: above.low, high: above.high, quality: above.quality, touches: above.touches };
    const inside = z.zones.find((x) => x.low <= lc && lc <= x.high);
    if (inside) notes.push(`Price is inside a ${inside.quality} ${inside.kind} zone (${inside.touches} touches).`);
  } else if (z.status === "insufficient-data") notes.push(`Zones: ${z.reason}`);
  const first = closes.length ? closes[0]! : null;
  return {
    horizon,
    candles: c.length,
    lastClose: lc,
    lastCloseTime: c.length ? c[c.length - 1]!.closeTime : null,
    trend,
    trendRule,
    ema20: e20,
    ema50: e50,
    rsi14: r,
    rsiState: r === null ? null : r >= 70 ? "overbought" : r <= 30 ? "oversold" : "neutral",
    atrPct: a !== null && lc ? (a / lc) * 100 : null,
    volatility20: v,
    changePct: first && lc ? ((lc - first) / first) * 100 : null,
    nearestSupport: sup,
    nearestResistance: res,
    notes,
  };
}

/** Agreement across horizons — a fact summary, never a recommendation. */
export function horizonConsensus(reads: HorizonRead[]): { aligned: Trend | "mixed"; detail: string } {
  const t = reads.filter((r) => r.trend !== "insufficient-data").map((r) => r.trend);
  if (t.length === 0) return { aligned: "insufficient-data", detail: "No horizon has enough closed candles." };
  const allSame = t.every((x) => x === t[0]);
  return allSame ? { aligned: t[0]!, detail: `All ${t.length} horizons with data read "${t[0]}".` } : { aligned: "mixed", detail: reads.map((r) => `${r.horizon}: ${r.trend}`).join(" · ") };
}
