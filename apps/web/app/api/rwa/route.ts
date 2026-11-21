import { z } from "zod";
import { splitRwaPrices } from "@veydara/cmc";
import { cmc } from "@/lib/server/cmc";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({ symbol: z.string().regex(/^[A-Za-z0-9]{1,10}$/) });

export async function GET(req: Request) {
  const limited = rateLimit(req, "rwa", 20);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "symbol required" } }, { status: 400 });
  const r = await cmc().request("rwaQuotesLatest", { symbol: p.data.symbol.toUpperCase() }, { feature: "discover.rwa" });
  if (!r.ok) return json({ status: "unavailable", code: r.error.code, reason: r.error.message });
  return json({ status: "ok", provenance: r.provenance, assets: r.data.data.rwa_assets.map((a) => ({ rwaId: a.rwa_id, name: a.name, symbol: a.symbol, assetType: a.asset_type, ...splitRwaPrices(a), tradfi: a.tradfi_markets ?? [] })) });
}
