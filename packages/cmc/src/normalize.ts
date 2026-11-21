import type { CryptoInfoV2, CryptoQuoteV3, RwaQuoteItem } from "./schemas";

/** v3 quotes are arrays; pick the requested convert explicitly, never assume map-shaped fields. */
export function pickQuote(q: CryptoQuoteV3, convertSymbol = "USD") {
  return q.quote.find((x) => x.symbol.toUpperCase() === convertSymbol.toUpperCase()) ?? null;
}

const PLATFORM_ALIASES: Record<string, string[]> = {
  base: ["base"],
  ethereum: ["ethereum"],
  bnb: ["bnb smart chain (bep20)", "bnb chain", "bnb smart chain"],
  solana: ["solana"],
};

export type ContractResolution =
  | { status: "exact"; cmcId: number; name: string; symbol: string; slug: string }
  | { status: "ambiguous"; candidates: { cmcId: number; symbol: string; name: string }[] }
  | { status: "mismatch"; reason: string }
  | { status: "not-found" };

/**
 * Resolve a CMC listing from /v2/cryptocurrency/info?address= results, but only
 * accept it if CMC's own contract list contains this exact address on this
 * exact chain. Ticker collisions or cross-chain matches are rejected.
 */
export function resolveContract(data: Record<string, CryptoInfoV2 | CryptoInfoV2[]>, chain: keyof typeof PLATFORM_ALIASES, address: string): ContractResolution {
  const items = Object.values(data).flatMap((v) => (Array.isArray(v) ? v : [v]));
  if (items.length === 0) return { status: "not-found" };
  const needle = chain === "solana" ? address : address.toLowerCase();
  const aliases = PLATFORM_ALIASES[chain] ?? [chain];
  const exact = items.filter((it) =>
    (it.contract_address ?? []).some((c) => {
      const addr = chain === "solana" ? c.contract_address : c.contract_address.toLowerCase();
      return addr === needle && aliases.includes(c.platform.name.toLowerCase());
    }),
  );
  if (exact.length === 1) {
    const e = exact[0]!;
    return { status: "exact", cmcId: e.id, name: e.name, symbol: e.symbol, slug: e.slug };
  }
  if (exact.length > 1) return { status: "ambiguous", candidates: exact.map((e) => ({ cmcId: e.id, symbol: e.symbol, name: e.name })) };
  return { status: "mismatch", reason: `CMC returned ${items.length} listing(s) but none list ${address} on ${chain}.` };
}

/**
 * Split an RWA quote into the three price concepts the UI must never conflate:
 * CMC aggregate tokenized price, each issuer token's own price, and (elsewhere)
 * the protocol oracle.
 */
export function splitRwaPrices(item: RwaQuoteItem) {
  return {
    aggregate: { label: "CMC aggregate tokenized price (all issuers)", price: item.average_tokenized_price ?? null, lastUpdated: item.last_updated ?? null },
    issuerTokens: (item.tokens ?? []).map((t) => ({
      label: `${t.symbol} — ${t.issuer_name ?? "unknown issuer"}`,
      symbol: t.symbol,
      cmcId: t.crypto_id,
      issuerId: t.issuer_id ?? null,
      issuerName: t.issuer_name ?? null,
      price: t.price ?? null,
    })),
  };
}

/** Refuse to resolve a bare ticker into "the first hit" (spec §3.4). */
export function resolveSymbolStrict<T extends { symbol: string }>(items: T[], symbol: string): { status: "unique"; item: T } | { status: "ambiguous"; items: T[] } | { status: "none" } {
  const m = items.filter((i) => i.symbol.toUpperCase() === symbol.toUpperCase());
  if (m.length === 0) return { status: "none" };
  if (m.length === 1) return { status: "unique", item: m[0]! };
  return { status: "ambiguous", items: m };
}
