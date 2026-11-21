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

export const INTERVAL_MS: Record<string, number> = { "15min": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 };

/**
 * Map CMC DEX K-line rows ([open, high, low, close, volume, timestamp, traders]).
 * Timestamp unit is detected (docs: seconds; observed live 2026-11-21: ms).
 * A candle is closed only when openTime + interval <= now (no look-ahead).
 */
export function fromCmcKlineRows(rows: (number | string | null)[][], intervalMs: number, nowMs = Date.now()): Candle[] {
  return rows.flatMap((r) => {
    const [o, h, l, c, v, ts] = r.map((x) => (x === null || x === undefined ? NaN : Number(x)));
    if (![o, h, l, c, ts].every((x) => Number.isFinite(x))) return [];
    const openTime = ts! < 1e12 ? ts! * 1000 : ts!;
    const closeTime = openTime + intervalMs;
    return [{ openTime, closeTime, open: o!, high: h!, low: l!, close: c!, volume: Number.isFinite(v) ? v! : null, closed: closeTime <= nowMs }];
  });
}
