import { scanBaseWallet, scanSolanaWallet, type Holding, type ScanResult } from "@veydara/chains";
import { mulAmountByPrice, normalizeDecimal, formatUnitsSafe, type Provenance } from "@veydara/domain";
import { pickQuote, resolveContract } from "@veydara/cmc";
import { aaveListingFor } from "@veydara/protocols";
import { getAddress } from "viem";
import { cmc } from "./cmc";
import { serverEnv } from "./env";

export interface PricedHolding extends Holding {
  cmcId: number | null;
  price: { usd: string; provenance: Provenance; label: string } | null;
  valueUsd: string | null;
  /** USD value in micro-dollars (bigint as string), floor-rounded. */
  valueMicros: string | null;
  priceUnavailableReason: string | null;
  aaveListing: { symbol: string; feed: string } | null;
}

export interface PortfolioResponse {
  scan: Omit<ScanResult, "holdings">;
  holdings: PricedHolding[];
  quarantined: PricedHolding[];
  walletKind: "empty" | "stablecoin-only" | "has-assets" | "quarantine-only";
  totals: { pricedUsd: string; unpricedCount: number; stableUsd: string };
  pricing: { mode: "pro" | "keyless" | null; error: string | null };
}

/** Resolve exact CMC ids for verified tokens: registry id first, else CMC contract lookup (cached 24h). */
async function cmcIdFor(h: Holding): Promise<{ id: number | null; reason: string | null }> {
  const reg = h.identity.verified;
  if (reg?.cmcId) return { id: reg.cmcId, reason: null };
  if (h.address === "native") return { id: null, reason: "No CMC id mapped for native asset" };
  // CMC expects the checksummed form for EVM contracts.
  const lookup = h.chain === "base" ? getAddress(h.address) : h.address;
  const r = await cmc().request("cryptoInfoV2", { address: lookup }, { feature: "portfolio.identity" });
  if (!r.ok) return { id: null, reason: `CMC identity lookup unavailable: ${r.error.message}` };
  const res = resolveContract(r.data.data, h.chain, h.address);
  if (res.status === "exact") return { id: res.cmcId, reason: null };
  return { id: null, reason: res.status === "ambiguous" ? "CMC lists multiple assets for this contract; refusing to guess." : res.status === "mismatch" ? res.reason : "Not listed on CMC" };
}

export async function buildPortfolio(chain: "base" | "solana", address: string, extraTokens: string[] = []): Promise<PortfolioResponse> {
  const env = serverEnv();
  const scan = chain === "base" ? await scanBaseWallet(address, { rpcUrl: env.BASE_RPC_URL, extraTokens }) : await scanSolanaWallet(address, { rpcUrl: env.SOLANA_RPC_URL });

  const verified = scan.holdings.filter((h) => h.identity.status === "verified");
  const quarantinedRaw = scan.holdings.filter((h) => h.identity.status !== "verified");

  // Sequential on purpose: registry ids cover most holdings; remaining lookups are cached 24h
  // and serialized to avoid bursting the shared keyless rate pool.
  const ids: { id: number | null; reason: string | null }[] = [];
  for (const h of verified) ids.push(await cmcIdFor(h));
  const uniqueIds = [...new Set(ids.map((x) => x.id).filter((x): x is number => x !== null))].sort((a, b) => a - b);
  let quotes: Map<number, { price: string; prov: Provenance }> = new Map();
  let pricingError: string | null = null;
  const mode = cmc().modeFor("cryptoQuotesLatestV3");
  if (uniqueIds.length) {
    const r = await cmc().request("cryptoQuotesLatestV3", { id: uniqueIds.join(",") }, { feature: "portfolio.quotes" });
    const data = r.ok ? r.data : r.stale?.data;
    if (!r.ok) pricingError = `${r.error.code}: ${r.error.message}${r.stale ? " (showing last cached quotes, flagged stale)" : ""}`;
    if (data) {
      const prov: Provenance = r.ok ? r.provenance : { ...r.provenance, freshness: "stale", coverage: "complete", fetchedAt: r.stale!.fetchedAt };
      quotes = new Map(
        data.data.flatMap((q) => {
          const usd = pickQuote(q, "USD");
          return usd?.price != null ? [[q.id, { price: normalizeDecimal(usd.price), prov: { ...prov, assetId: String(q.id), observedAt: usd.last_updated ?? prov.observedAt } }] as const] : [];
        }),
      );
    }
  }

  const priced: PricedHolding[] = verified.map((h, i) => {
    const { id, reason } = ids[i]!;
    const q = id !== null ? quotes.get(id) : undefined;
    const micros = q ? mulAmountByPrice(BigInt(h.rawBalance), h.decimals, q.price, 6) : null;
    const value = micros !== null ? formatUnitsSafe(micros, 6, 2) : null;
    const listing = h.address !== "native" ? aaveListingFor(h.address) : null;
    return {
      ...h,
      cmcId: id,
      price: q ? { usd: q.price, provenance: q.prov, label: h.identity.verified?.assetClass === "tokenized-equity" ? "CMC market price for this exact issuer token" : "CMC market price" } : null,
      valueUsd: value,
      valueMicros: micros !== null ? micros.toString() : null,
      priceUnavailableReason: q ? null : (reason ?? pricingError ?? "No CMC quote returned"),
      aaveListing: listing && listing.symbol !== "USDC" ? { symbol: listing.symbol, feed: listing.feed } : null,
    };
  });
  const quarantined: PricedHolding[] = quarantinedRaw.map((h) => ({ ...h, cmcId: null, price: null, valueUsd: null, valueMicros: null, priceUnavailableReason: "Quarantined: unverified contract — not priced, not analysed.", aaveListing: null }));

  const sumUsd = (xs: PricedHolding[]) => xs.reduce((a, h) => a + (h.valueMicros ? BigInt(h.valueMicros) : 0n), 0n);
  const toUsd = (micros: bigint) => formatUnitsSafe(micros, 6, 2);
  const stable = priced.filter((h) => h.identity.verified?.assetClass === "stablecoin");
  const nonStable = priced.filter((h) => h.identity.verified?.assetClass !== "stablecoin");
  const walletKind: PortfolioResponse["walletKind"] = priced.length === 0 ? (quarantined.length ? "quarantine-only" : "empty") : nonStable.length === 0 ? "stablecoin-only" : "has-assets";
  const { holdings: _h, ...scanMeta } = scan;
  return {
    scan: scanMeta,
    holdings: priced,
    quarantined,
    walletKind,
    totals: { pricedUsd: toUsd(sumUsd(priced)), unpricedCount: priced.filter((h) => !h.valueUsd).length, stableUsd: toUsd(sumUsd(stable)) },
    pricing: { mode, error: pricingError },
  };
}
