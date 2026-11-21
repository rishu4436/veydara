/**
 * Indicator math operates on float64 prices: these are analytics, never token
 * amounts or collateral bounds (which use bigint in @veydara/domain).
 */
export interface Candle {
  openTime: number; // ms epoch UTC
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  /** false for the still-forming period; indicators drop it (no look-ahead). */
  closed: boolean;
}

export type Series = (number | null)[];

export function completeCandles(c: Candle[]): Candle[] {
  const sorted = [...c].sort((a, b) => a.openTime - b.openTime);
  return sorted.filter((x) => x.closed && [x.open, x.high, x.low, x.close].every(Number.isFinite) && x.high >= x.low);
}

/** Detect gaps larger than `factor` × the median spacing (e.g. weekends for 24/5 RWAs). */
export function detectGaps(c: Candle[], factor = 1.5): { index: number; gapMs: number }[] {
  if (c.length < 3) return [];
  const d = c.slice(1).map((x, i) => x.openTime - c[i]!.openTime);
  const med = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)]!;
  return d.flatMap((g, i) => (g > med * factor ? [{ index: i + 1, gapMs: g }] : []));
}

/** Map CMC v5 OHLCV compact rows ([o,h,l,c,v,mcap,openTime,highTime,lowTime,closeTime]) to candles. */
export function fromCmcV5Rows(rows: (number | string | null)[][], nowMs = Date.now()): Candle[] {
  return rows.flatMap((r) => {
    const [o, h, l, cl, v, , ot, , , ct] = r;
    if (typeof o !== "number" || typeof h !== "number" || typeof l !== "number" || typeof cl !== "number") return [];
    const closeTime = Date.parse(String(ct));
    return [{ openTime: Date.parse(String(ot)), closeTime, open: o, high: h, low: l, close: cl, volume: typeof v === "number" ? v : null, closed: closeTime <= nowMs }];
  });
}
