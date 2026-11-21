import { z } from "zod";
import { atr, ema, macd, rsi, sma, supportResistanceZones } from "@veydara/quant";
import { KLINE_INTERVALS, loadCandles } from "@/lib/server/candles";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({
  chain: z.enum(["base", "solana"]),
  address: z.string().min(6).max(64),
  interval: z.enum(KLINE_INTERVALS).default("1d"),
  limit: z.coerce.number().int().min(30).max(300).default(200),
});

/** Real CMC DEX K-line candles + deterministic indicators/zones, computed server-side on request. */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ohlcv", 15);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "chain, address and interval (15min|1h|4h|1d|1w) required" } }, { status: 400 });
  const r = await loadCandles(p.data.chain, p.data.address, p.data.interval, p.data.limit, "alpha.chart");
  if (r.status !== "ok") return json(r);
  const closes = r.candles.map((c) => c.close);
  return json({
    ...r,
    indicators: { sma20: sma(closes, 20), ema20: ema(closes, 20), ema50: ema(closes, 50), ema200: ema(closes, 200), rsi14: rsi(closes, 14), macd: macd(closes), atr14: atr(r.candles, 14) },
    zones: supportResistanceZones(r.candles),
  });
}
