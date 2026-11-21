import { z } from "zod";
import { cmc } from "@/lib/server/cmc";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({ symbol: z.string().regex(/^[A-Za-z.]{1,10}$/) });

export interface IssuerGraph {
  status: "ok";
  underlying: { symbol: string; name: string; rwaId: number; aggregatePriceUsd: number | null; tokenizedMarketCap: number | null; lastUpdated: string | null };
  issuers: { issuerId: string | null; issuerName: string; tokens: { symbol: string; name: string; cmcId: number; priceUsd: number | null; marketCap: number | null; volume24h: number | null }[] }[];
  provenance: unknown;
}

/** Issuer graph for one underlying from CMC RWA quotes (key required). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "issuers", 12);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "symbol (underlying ticker) required" } }, { status: 400 });
  const r = await cmc().request("rwaQuotesLatest", { symbol: p.data.symbol.toUpperCase() }, { feature: "passport.issuer-graph" });
  if (!r.ok) return json({ status: "unavailable", code: r.error.code, reason: r.error.message });
  const a = r.data.data.rwa_assets[0];
  if (!a) return json({ status: "unavailable", code: "NOT_FOUND", reason: `CMC has no RWA entry for ${p.data.symbol}.` });
  const by = new Map<string, IssuerGraph["issuers"][number]>();
  for (const t of a.tokens ?? []) {
    const k = t.issuer_id ?? t.issuer_name ?? "unknown";
    if (!by.has(k)) by.set(k, { issuerId: t.issuer_id ?? null, issuerName: t.issuer_name ?? "Unknown issuer", tokens: [] });
    by.get(k)!.tokens.push({ symbol: t.symbol, name: t.name, cmcId: t.crypto_id, priceUsd: t.price ?? null, marketCap: t.market_cap ?? null, volume24h: t.volume_24h ?? null });
  }
  const g: IssuerGraph = {
    status: "ok",
    underlying: { symbol: a.symbol, name: a.name, rwaId: a.rwa_id, aggregatePriceUsd: a.average_tokenized_price ?? null, tokenizedMarketCap: a.tokenized_market_cap ?? null, lastUpdated: a.last_updated ?? null },
    issuers: [...by.values()],
    provenance: r.provenance,
  };
  return json(g);
}
