import { z } from "zod";
import { horizonConsensus, horizonRead } from "@veydara/quant";
import { loadCandles, type KlineInterval } from "@/lib/server/candles";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({ chain: z.enum(["base", "solana"]), address: z.string().min(6).max(64) });
const HORIZONS: { horizon: string; interval: KlineInterval; limit: number }[] = [
  { horizon: "Intraday (1h × 200)", interval: "1h", limit: 200 },
  { horizon: "Swing (4h × 200)", interval: "4h", limit: 200 },
  { horizon: "Position (1d × 200)", interval: "1d", limit: 200 },
];

/** Multi-horizon deterministic read with per-horizon sources. Facts, not advice. */
export async function GET(req: Request) {
  const limited = rateLimit(req, "research", 8);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "chain and address required" } }, { status: 400 });
  const out = [];
  for (const h of HORIZONS) {
    // sequential: keeps the shared keyless pool happy; each response is cached 5 min
    const r = await loadCandles(p.data.chain, p.data.address, h.interval, h.limit, "alpha.research");
    out.push(r.status === "ok" ? { status: "ok" as const, read: horizonRead(h.horizon, r.candles), source: r.source, provenance: r.provenance, gaps: r.gaps } : { status: "unavailable" as const, horizon: h.horizon, code: r.code, reason: r.reason });
  }
  const reads = out.flatMap((o) => (o.status === "ok" ? [o.read] : []));
  return json({ horizons: out, consensus: horizonConsensus(reads), disclaimer: "Deterministic technical facts from CMC DEX candles. Not investment advice; no forecast is made." });
}
