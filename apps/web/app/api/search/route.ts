import { z } from "zod";
import { ALL_VERIFIED, isSolanaAddress } from "@veydara/chains";
import { isAddress } from "viem";
import { json, rateLimit } from "@/lib/server/http";
import { cmc } from "@/lib/server/cmc";

export const dynamic = "force-dynamic";
const Q = z.object({ q: z.string().trim().min(1).max(64) });

/**
 * Search: (1) exact contract/mint → asset page, (2) verified registry by
 * symbol/name/underlying (free), (3) CMC RWA map by ticker when a key exists.
 * Ticker matches across issuers are all returned — never collapsed to the first hit.
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "search", 40);
  if (limited) return limited;
  const parsed = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return json({ results: [], rwa: null });
  const q = parsed.data.q;
  if (isAddress(q, { strict: false })) return json({ results: [{ kind: "contract", chain: "base", address: q.toLowerCase(), label: "Base contract" }], rwa: null });
  if (isSolanaAddress(q)) return json({ results: [{ kind: "contract", chain: "solana", address: q, label: "Solana mint" }], rwa: null });
  const needle = q.toLowerCase();
  const results = ALL_VERIFIED.filter((t) => t.address !== "native")
    .filter((t) => t.symbol.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle) || t.underlying?.symbol.toLowerCase() === needle)
    .map((t) => ({ kind: "verified-token", chain: t.chain, address: t.address, label: `${t.symbol} — ${t.name}`, issuer: t.issuer ?? null, underlying: t.underlying?.symbol ?? null }));
  let rwa: unknown = null;
  if (/^[A-Za-z0-9.]{1,10}$/.test(q) && cmc().modeFor("rwaMap")) {
    const r = await cmc().request("rwaMap", { symbol: q.toUpperCase() }, { feature: "search.rwa" });
    rwa = r.ok ? { status: "ok", assets: r.data.data.rwa_assets } : { status: "unavailable", reason: r.error.message };
  } else if (!cmc().modeFor("rwaMap")) {
    rwa = { status: "unavailable", reason: "CMC RWA map requires CMC_API_KEY." };
  }
  return json({ results, rwa });
}
