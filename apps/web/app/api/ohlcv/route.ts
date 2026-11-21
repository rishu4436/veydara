import { z } from "zod";
import { completeCandles, ema, fromCmcV5Rows, macd, rsi, sma, supportResistanceZones, atr } from "@veydara/quant";
import { cmc } from "@/lib/server/cmc";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({ id: z.string().regex(/^\d+$/), interval: z.enum(["15m", "1h", "4h", "1d", "1w", "1M"]).default("1d"), count: z.coerce.number().int().min(30).max(400).default(200) });

/** Candles + deterministic indicators, computed server-side only when the user opens a chart. */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ohlcv", 10);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "id (CMC id) and interval required" } }, { status: 400 });
  const r = await cmc().request("cryptoOhlcvHistoricalV5", { id: p.data.id, interval: p.data.interval, count: String(p.data.count) }, { feature: "alpha.chart" });
  if (!r.ok) return json({ status: "unavailable", code: r.error.code, reason: r.error.message }, { status: 200 });
  const candles = completeCandles(fromCmcV5Rows(r.data.data));
  if (candles.length === 0) return json({ status: "unavailable", code: "EMPTY_HISTORY", reason: "CMC returned no closed candles for this window." });
  const closes = candles.map((c) => c.close);
  return json({
    status: "ok",
    provenance: r.provenance,
    candles,
    indicators: { sma20: sma(closes, 20), ema50: ema(closes, 50), ema200: ema(closes, 200), rsi14: rsi(closes, 14), macd: macd(closes), atr14: atr(candles, 14) },
    zones: supportResistanceZones(candles),
  });
}
