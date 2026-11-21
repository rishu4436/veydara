/**
 * Endpoint registry: path, access mode, plan gating, TTL by data class and
 * a documented credit estimator. Credit rules are quoted from the CMC docs
 * (retrieved 2026-11-21); actual credit_count from each response is logged
 * next to the estimate in the credit ledger.
 */
import type { z } from "zod";
import * as S from "./schemas";

export type DataClass = "static-metadata" | "quote" | "recent-candles" | "historical" | "id-map";
export type PlanTier = "basic" | "startup" | "growth" | "enterprise";

export interface EndpointDef<TSchema extends z.ZodType = z.ZodType> {
  id: string;
  path: string;
  /** Callable via https://pro-api.coinmarketcap.com/public-api without a key. */
  keyless: boolean;
  minPlan: PlanTier;
  dataClass: DataClass;
  ttlMs: number;
  /** After ttl, serve stale (flagged) up to this age while revalidating. */
  staleMs: number;
  schema: TSchema;
  estimateCredits: (params: Record<string, string>) => number;
  docsUrl: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const countList = (v?: string) => (v ? v.split(",").filter(Boolean).length : 1);
const extraConverts = (p: Record<string, string>) => Math.max(0, countList(p.convert ?? p.convert_id) - 1);
const RWA_DOCS = "https://coinmarketcap.com/api/documentation/pro-api-reference/real-world-assets/";
const CRYPTO_DOCS = "https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency";
const KEYLESS_DOCS = "https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api";

function def<T extends z.ZodType>(d: EndpointDef<T>): EndpointDef<T> {
  return d;
}

export const ENDPOINTS = {
  cryptoQuotesLatestV3: def({
    id: "cryptoQuotesLatestV3",
    path: "/v3/cryptocurrency/quotes/latest",
    keyless: true,
    minPlan: "basic",
    dataClass: "quote",
    ttlMs: 60_000, // CMC updates every 15-25s; one minute keeps credits low
    staleMs: 15 * MIN,
    schema: S.QuotesLatestV3Schema,
    estimateCredits: (p) => Math.ceil(countList(p.id ?? p.slug ?? p.symbol) / 250) + extraConverts(p),
    docsUrl: CRYPTO_DOCS,
  }),
  cryptoInfoV2: def({
    id: "cryptoInfoV2",
    path: "/v2/cryptocurrency/info",
    keyless: true,
    minPlan: "basic",
    dataClass: "static-metadata",
    ttlMs: 24 * HOUR,
    staleMs: 7 * 24 * HOUR,
    schema: S.InfoV2Schema,
    estimateCredits: (p) => Math.ceil(countList(p.id ?? p.slug ?? p.symbol ?? p.address) / 100),
    docsUrl: CRYPTO_DOCS,
  }),
  cryptoOhlcvHistoricalV5: def({
    id: "cryptoOhlcvHistoricalV5",
    path: "/v5/cryptocurrency/ohlcv/historical",
    keyless: false,
    minPlan: "startup",
    dataClass: "historical",
    ttlMs: 15 * MIN,
    staleMs: 6 * HOUR,
    schema: S.OhlcvHistoricalV5Schema,
    estimateCredits: (p) => Math.max(1, Math.ceil(Number(p.count ?? 10) / 100)),
    docsUrl: CRYPTO_DOCS,
  }),
  rwaMap: def({
    id: "rwaMap",
    path: "/v5/real-world-assets/map",
    keyless: false,
    minPlan: "basic",
    dataClass: "id-map",
    ttlMs: 6 * HOUR,
    staleMs: 7 * 24 * HOUR,
    schema: S.RwaMapSchema,
    estimateCredits: () => 0, // "No credit is needed when querying this endpoint."
    docsUrl: RWA_DOCS,
  }),
  rwaInfo: def({
    id: "rwaInfo",
    path: "/v5/real-world-assets/info",
    keyless: false,
    minPlan: "basic",
    dataClass: "static-metadata",
    ttlMs: 24 * HOUR,
    staleMs: 7 * 24 * HOUR,
    schema: S.RwaInfoSchema,
    estimateCredits: (p) => Math.ceil(countList(p.rwa_id ?? p.rwa_slug ?? p.symbol) / 250),
    docsUrl: RWA_DOCS,
  }),
  rwaQuotesLatest: def({
    id: "rwaQuotesLatest",
    path: "/v5/real-world-assets/quotes/latest",
    keyless: false,
    minPlan: "basic",
    dataClass: "quote",
    ttlMs: 60_000, // documented update frequency: every 60 seconds
    staleMs: 30 * MIN,
    schema: S.RwaQuotesLatestSchema,
    estimateCredits: (p) => Math.ceil(countList(p.rwa_id ?? p.rwa_slug ?? p.symbol) / 250) + extraConverts(p),
    docsUrl: RWA_DOCS,
  }),
  rwaQuotesHistorical: def({
    id: "rwaQuotesHistorical",
    path: "/v5/real-world-assets/quotes/historical",
    keyless: false,
    minPlan: "basic",
    dataClass: "historical",
    ttlMs: 5 * MIN, // documented: every 5 minutes
    staleMs: 6 * HOUR,
    schema: S.RwaQuotesHistoricalSchema,
    estimateCredits: (p) => Math.max(1, Math.ceil((countList(p.rwa_id ?? p.rwa_slug ?? p.symbol) * Number(p.count ?? 10)) / 100)) + extraConverts(p),
    docsUrl: RWA_DOCS,
  }),
  rwaIssuersList: def({
    id: "rwaIssuersList",
    path: "/v5/real-world-assets/issuers/list",
    keyless: false,
    minPlan: "basic",
    dataClass: "static-metadata",
    ttlMs: 6 * HOUR,
    staleMs: 7 * 24 * HOUR,
    schema: S.RwaIssuersListSchema,
    estimateCredits: () => 1,
    docsUrl: RWA_DOCS,
  }),
  rwaIssuer: def({
    id: "rwaIssuer",
    path: "/v5/real-world-assets/issuers",
    keyless: false,
    minPlan: "basic",
    dataClass: "static-metadata",
    ttlMs: 6 * HOUR,
    staleMs: 7 * 24 * HOUR,
    schema: S.RwaIssuerSchema,
    estimateCredits: () => 1,
    docsUrl: RWA_DOCS,
  }),
  dexToken: def({
    id: "dexToken",
    path: "/v1/dex/token",
    keyless: true,
    minPlan: "basic",
    dataClass: "quote",
    ttlMs: 2 * MIN,
    staleMs: 30 * MIN,
    schema: S.DexTokenSchema,
    estimateCredits: () => 1,
    docsUrl: KEYLESS_DOCS,
  }),
  dexTokenPools: def({
    id: "dexTokenPools",
    path: "/v1/dex/token/pools",
    keyless: true,
    minPlan: "basic",
    dataClass: "quote",
    ttlMs: 5 * MIN,
    staleMs: HOUR,
    schema: S.DexTokenPoolsSchema,
    estimateCredits: () => 1,
    docsUrl: KEYLESS_DOCS,
  }),
  dexKlineCandles: def({
    id: "dexKlineCandles",
    path: "/v1/k-line/candles",
    keyless: true,
    minPlan: "basic",
    dataClass: "recent-candles",
    ttlMs: 5 * MIN,
    staleMs: 6 * HOUR,
    schema: S.KlineCandlesSchema,
    estimateCredits: (p) => Math.max(1, Math.ceil(Number(p.limit ?? 100) / 100)), // observed 2026-11-21: limit≤100 → 1 credit, 200 → 2
    docsUrl: KEYLESS_DOCS,
  }),
  keyInfo: def({
    id: "keyInfo",
    path: "/v1/key/info",
    keyless: false,
    minPlan: "basic",
    dataClass: "id-map",
    ttlMs: 10 * MIN,
    staleMs: HOUR,
    schema: S.KeyInfoSchema,
    estimateCredits: () => 0, // "This endpoint does not use credits"
    docsUrl: "https://coinmarketcap.com/api/documentation/pro-api-reference/key",
  }),
} as const;

export type EndpointId = keyof typeof ENDPOINTS;
export type EndpointData<E extends EndpointId> = z.infer<(typeof ENDPOINTS)[E]["schema"]>;
