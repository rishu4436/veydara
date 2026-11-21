/** Token identity is (chain, contract/mint), never ticker alone (spec §1.1.1). */
export type ChainKey = "base" | "ethereum" | "bnb" | "solana";

export const CHAIN_IDS: Record<Exclude<ChainKey, "solana">, number> = {
  base: 8453,
  ethereum: 1,
  bnb: 56,
};

export type AssetClass =
  | "native"
  | "stablecoin"
  | "tokenized-equity"
  | "wrapped-crypto"
  | "crypto"
  | "unknown";

export type VerificationStatus = "verified" | "unverified" | "suspected-spam" | "impersonation";

export interface TokenRepresentation {
  chain: ChainKey;
  /** lowercase hex for EVM, base58 for Solana, "native" for the gas token */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  assetClass: AssetClass;
  issuer?: string;
  /** Canonical underlying instrument, e.g. "NVDA" for NVDAc. Never inferred from ticker. */
  underlying?: { symbol: string; name: string; kind: "stock" | "etf" | "commodity" | "fiat" | "crypto" };
  cmcId?: number;
  /** URLs of the official sources that verify this exact contract. */
  sources: { label: string; url: string; retrievedAt: string }[];
}

export function tokenKey(chain: ChainKey, address: string): string {
  return `${chain}:${chain === "solana" ? address : address.toLowerCase()}`;
}
