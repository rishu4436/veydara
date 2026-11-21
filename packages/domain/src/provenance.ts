/**
 * Provenance: every financial datum VEYDARA shows carries where it came from,
 * when it was observed and fetched, and whether it is simulated.
 * Spec §3 "Provenance".
 */
export type DataSource =
  | "cmc-pro"
  | "cmc-keyless"
  | "base-rpc"
  | "solana-rpc"
  | "chainlink-feed"
  | "aave-address-book"
  | "fixture"
  | "user-input";

export type Freshness = "live" | "cached" | "stale" | "unavailable";
export type Coverage = "complete" | "partial" | "none";

export interface Provenance {
  source: DataSource;
  endpointOrContract: string;
  assetId?: string;
  chainId?: number | string;
  address?: string;
  observedAt: string | null;
  fetchedAt: string;
  blockNumber?: string;
  currency?: string;
  unit?: string;
  freshness: Freshness;
  coverage: Coverage;
  isSimulated: boolean;
}

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
}

/** Classify freshness from an observation age against a TTL budget. */
export function classifyFreshness(observedAtMs: number | null, nowMs: number, freshMs: number, staleMs: number): Freshness {
  if (observedAtMs === null || Number.isNaN(observedAtMs)) return "unavailable";
  const age = nowMs - observedAtMs;
  if (age <= freshMs) return "live";
  if (age <= staleMs) return "cached";
  return "stale";
}
