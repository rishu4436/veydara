/**
 * Evidence-based support/resistance zones (spec §2.B):
 * 1. find swing pivots (fractal high/low with `wing` candles each side),
 * 2. cluster pivot prices within an ATR-scaled tolerance,
 * 3. a zone = cluster price band; quality from touches, recency and volume.
 * Never emits a single "magic" price; returns "insufficient-data" when the
 * series is too short or too gappy.
 */
import type { Candle } from "./candles";
import { detectGaps } from "./candles";
import { atr } from "./indicators";

export interface Pivot {
  index: number;
  time: number;
  price: number;
  kind: "high" | "low";
  volume: number | null;
}

export interface Zone {
  kind: "support" | "resistance";
  low: number;
  high: number;
  mid: number;
  widthPct: number;
  touches: number;
  lastTouch: number;
  quality: "strong" | "moderate" | "weak";
  invalidation: string;
  pivots: Pivot[];
}

export type ZoneResult =
  | { status: "ok"; zones: Zone[]; method: string; tolerance: number; atr: number; lastClose: number; gaps: number }
  | { status: "insufficient-data"; reason: string };

export function swingPivots(c: Candle[], wing = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = wing; i < c.length - wing; i++) {
    const x = c[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (c[j]!.high >= x.high) isHigh = false;
      if (c[j]!.low <= x.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: x.openTime, price: x.high, kind: "high", volume: x.volume });
    if (isLow) out.push({ index: i, time: x.openTime, price: x.low, kind: "low", volume: x.volume });
  }
  return out;
}

export function supportResistanceZones(c: Candle[], opts: { wing?: number; minCandles?: number; atrMult?: number; maxZones?: number } = {}): ZoneResult {
  const wing = opts.wing ?? 3;
  const minCandles = opts.minCandles ?? 40;
  if (c.length < minCandles) return { status: "insufficient-data", reason: `Need at least ${minCandles} closed candles; have ${c.length}.` };
  const gaps = detectGaps(c, 3);
  if (gaps.length > c.length * 0.2) return { status: "insufficient-data", reason: `Series is too gappy (${gaps.length} large gaps in ${c.length} candles).` };
  const a = atr(c, 14);
  const lastAtr = a[a.length - 1];
  if (lastAtr === null || lastAtr === undefined || !(lastAtr > 0)) return { status: "insufficient-data", reason: "ATR unavailable (flat or degenerate series)." };
  const lastClose = c[c.length - 1]!.close;
  const tolerance = Math.max(lastAtr * (opts.atrMult ?? 0.5), lastClose * 0.002);

  const pivots = swingPivots(c, wing).sort((x, y) => x.price - y.price);
  const clusters: Pivot[][] = [];
  for (const p of pivots) {
    const cur = clusters[clusters.length - 1];
    if (cur && p.price - cur[0]!.price <= tolerance * 2) cur.push(p);
    else clusters.push([p]);
  }
  const lastTime = c[c.length - 1]!.openTime;
  const span = lastTime - c[0]!.openTime || 1;
  const zones: Zone[] = clusters.map((cl) => {
    const prices = cl.map((p) => p.price);
    const low = Math.min(...prices) - tolerance / 2;
    const high = Math.max(...prices) + tolerance / 2;
    const mid = (low + high) / 2;
    const touches = cl.length;
    const lastTouch = Math.max(...cl.map((p) => p.time));
    const recency = (lastTouch - c[0]!.openTime) / span;
    const score = touches + recency;
    const kind: Zone["kind"] = mid < lastClose ? "support" : "resistance";
    return {
      kind,
      low,
      high,
      mid,
      widthPct: ((high - low) / mid) * 100,
      touches,
      lastTouch,
      quality: score >= 3.5 ? "strong" : score >= 2.2 ? "moderate" : "weak",
      invalidation: kind === "support" ? `Closed candle below ${low.toPrecision(6)}` : `Closed candle above ${high.toPrecision(6)}`,
      pivots: cl,
    };
  });
  const ranked = zones
    .filter((z) => z.touches >= 2 || z.quality !== "weak")
    .sort((x, y) => Math.abs(x.mid - lastClose) - Math.abs(y.mid - lastClose))
    .slice(0, opts.maxZones ?? 6)
    .sort((x, y) => x.mid - y.mid);
  return {
    status: "ok",
    zones: ranked,
    method: `Fractal swing pivots (±${wing} candles) clustered within 2×tolerance; tolerance = max(0.5×ATR14, 0.2% of last close). Zones need ≥2 touches unless recent.`,
    tolerance,
    atr: lastAtr,
    lastClose,
    gaps: gaps.length,
  };
}
