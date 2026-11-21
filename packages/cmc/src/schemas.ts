/**
 * Typed runtime schemas for the CMC endpoints VEYDARA uses.
 * Built from the documented response shapes (docs retrieved 2026-11-21, see
 * docs/SOURCES-AND-CLAIMS.md) and — where marked — verified against live
 * keyless responses recorded in fixtures/cmc/.
 * Objects are "loose" so additive CMC fields never break parsing; only the
 * fields VEYDARA reads are required.
 */
import { z } from "zod";

const num = z.number();
const nullableNum = z.number().nullable().optional();
const code = z.union([z.number(), z.string()]);

export const StatusSchema = z.looseObject({
  timestamp: z.string(),
  error_code: code,
  error_message: z.string().nullable().optional(),
  elapsed: z.number().optional(),
  credit_count: z.number().optional(),
  notice: z.string().nullable().optional(),
});
export type CmcStatus = z.infer<typeof StatusSchema>;

export const ErrorEnvelopeSchema = z.looseObject({ status: StatusSchema });

/* ---------- /v3/cryptocurrency/quotes/latest (keyless verified 2026-11-21) ---------- */
export const QuoteV3Schema = z.looseObject({
  id: num,
  symbol: z.string(),
  price: nullableNum,
  volume_24h: nullableNum,
  percent_change_1h: nullableNum,
  percent_change_24h: nullableNum,
  percent_change_7d: nullableNum,
  market_cap: nullableNum,
  last_updated: z.string().nullable().optional(),
});
export const CryptoQuoteV3Schema = z.looseObject({
  id: num,
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  cmc_rank: nullableNum,
  last_updated: z.string().nullable().optional(),
  platform: z
    .looseObject({ id: z.union([z.number(), z.string()]), name: z.string(), slug: z.string().optional(), token_address: z.string().optional() })
    .nullable()
    .optional(),
  quote: z.array(QuoteV3Schema),
});
export const QuotesLatestV3Schema = z.looseObject({ data: z.array(CryptoQuoteV3Schema), status: StatusSchema });
export type CryptoQuoteV3 = z.infer<typeof CryptoQuoteV3Schema>;

/* ---------- /v2/cryptocurrency/info?address= (keyless verified 2026-11-21) ---------- */
export const CryptoInfoV2Schema = z.looseObject({
  id: num,
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  urls: z.record(z.string(), z.array(z.string())).optional(),
  platform: z.unknown().optional(),
  contract_address: z
    .array(
      z.looseObject({
        contract_address: z.string(),
        platform: z.looseObject({ name: z.string(), coin: z.looseObject({ id: z.union([z.string(), z.number()]), slug: z.string().optional() }).optional() }),
      }),
    )
    .optional(),
});
export const InfoV2Schema = z.looseObject({
  data: z.record(z.string(), z.union([CryptoInfoV2Schema, z.array(CryptoInfoV2Schema)])),
  status: StatusSchema,
});
export type CryptoInfoV2 = z.infer<typeof CryptoInfoV2Schema>;

/* ---------- /v5/cryptocurrency/ohlcv/historical (documented 10-value compact rows) ---------- */
export const OhlcvRowV5Schema = z.tuple([
  z.number().nullable(), // 0 open
  z.number().nullable(), // 1 high
  z.number().nullable(), // 2 low
  z.number().nullable(), // 3 close
  z.number().nullable(), // 4 volume
  z.number().nullable(), // 5 marketcap
  z.string(), // 6 openTime
  z.string().nullable(), // 7 highTime
  z.string().nullable(), // 8 lowTime
  z.string(), // 9 closeTime
]);
export const OhlcvHistoricalV5Schema = z.looseObject({ data: z.array(OhlcvRowV5Schema), status: StatusSchema });

/* ---------- RWA family (documented shapes; key required) ---------- */
export const RwaAssetTypeSchema = z.enum(["stock", "commodity", "currency", "government_security", "etf", "real_estate"]);
export const RwaMapItemSchema = z.looseObject({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  rwa_id: num,
  asset_type: z.string(),
  rwa_rank: nullableNum,
  has_tokens: z.boolean(),
  first_historical_data: z.string().nullable().optional(),
  last_historical_data: z.string().nullable().optional(),
});
export const RwaMapSchema = z.looseObject({
  data: z.looseObject({ rwa_assets: z.array(RwaMapItemSchema), total_size: nullableNum, has_more: z.boolean().optional() }),
  status: StatusSchema,
});

export const RwaInfoItemSchema = z.looseObject({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  rwa_id: num,
  asset_type: z.string(),
  website: z.string().nullable().optional(),
  employees: nullableNum,
  founded: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  cik: z.string().nullable().optional(),
  primary_exchange: z.string().nullable().optional(),
  about: z
    .looseObject({ description: z.string().nullable().optional(), logo: z.string().nullable().optional(), website: z.string().nullable().optional() })
    .nullable()
    .optional(),
});
export const RwaInfoSchema = z.looseObject({ data: z.looseObject({ rwa_assets: z.array(RwaInfoItemSchema) }), status: StatusSchema });

export const RwaTokenSchema = z.looseObject({
  symbol: z.string(),
  name: z.string(),
  price: nullableNum,
  crypto_id: num,
  issuer_id: z.string().nullable().optional(),
  issuer_name: z.string().nullable().optional(),
  market_cap: nullableNum,
  volume_24h: nullableNum,
});
export const RwaQuoteItemSchema = z.looseObject({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  rwa_id: num,
  asset_type: z.string(),
  has_tokens: z.boolean(),
  average_tokenized_price: nullableNum,
  tokenized_market_cap: nullableNum,
  tokenized_volume_24h: nullableNum,
  last_updated: z.string().nullable().optional(),
  quotes: z.array(z.looseObject({ symbol: z.string(), crypto_id: nullableNum, average_tokenized_price: nullableNum, last_updated: z.string().nullable().optional() })).optional(),
  tokens: z.array(RwaTokenSchema).optional(),
  tradfi_markets: z
    .array(z.looseObject({ exchange: z.looseObject({ slug: z.string(), name: z.string(), exchange_id: num }), ticker: z.string(), market_url: z.string().nullable().optional() }))
    .optional(),
});
export const RwaQuotesLatestSchema = z.looseObject({ data: z.looseObject({ rwa_assets: z.array(RwaQuoteItemSchema) }), status: StatusSchema });
export type RwaQuoteItem = z.infer<typeof RwaQuoteItemSchema>;

/**
 * /v5/real-world-assets/quotes/historical — NOTE: on 2026-11-21 the documented
 * response example on the RWA reference page showed the Issuers List payload,
 * not a historical series (reported in docs/CMC-API-CREDIT-STRATEGY.md as API
 * feedback). Field names below follow the endpoint prose ("average tokenized
 * price, tokenized market cap and 24h tokenized volume … tagged with
 * convert_id and convert_symbol") and are deliberately tolerant until a real
 * keyed response is recorded.
 */
export const RwaHistoricalPointSchema = z.looseObject({
  timestamp: z.string().optional(),
  time: z.string().optional(),
  average_tokenized_price: nullableNum,
  tokenized_market_cap: nullableNum,
  tokenized_volume_24h: nullableNum,
  convert_id: z.union([z.number(), z.string()]).optional(),
  convert_symbol: z.string().optional(),
});
export const RwaQuotesHistoricalSchema = z.looseObject({
  data: z.looseObject({
    rwa_assets: z.array(z.looseObject({ rwa_id: num, symbol: z.string(), quotes: z.array(RwaHistoricalPointSchema) })),
  }),
  status: StatusSchema,
});

export const RwaIssuerListItemSchema = z.looseObject({
  name: z.string(),
  website: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  issuer_id: z.string(),
  num_tokens: nullableNum,
});
export const RwaIssuersListSchema = z.looseObject({
  data: z.looseObject({ issuers: z.array(RwaIssuerListItemSchema), total_size: nullableNum, has_more: z.boolean().optional() }),
  status: StatusSchema,
});
export const RwaIssuerSchema = z.looseObject({
  data: z.looseObject({
    name: z.string(),
    website: z.string().nullable().optional(),
    issuer_id: z.string(),
    num_tokens: nullableNum,
    tokens: z.array(z.looseObject({ name: z.string(), symbol: z.string(), crypto_id: num, rwa_id: num })),
  }),
  status: StatusSchema,
});

/* ---------- DEX keyless (/v1/dex/token, /v1/dex/token/pools) — keyless verified 2026-11-21 ---------- */
export const DexTokenSchema = z.looseObject({
  data: z.looseObject({
    n: z.string(),
    sym: z.string(),
    addr: z.string(),
    plt: z.string().optional(),
    dec: z.number().optional(),
    p: z.string().nullable().optional(),
    mcap: z.string().nullable().optional(),
    liqUsd: z.string().nullable().optional(),
    pt: z.string().nullable().optional(),
    web: z.string().nullable().optional(),
  }),
  status: StatusSchema,
});
export const DexPoolSchema = z.looseObject({
  addr: z.string(),
  v24: z.string().nullable().optional(),
  exn: z.string().optional(),
  liqUsd: z.string().nullable().optional(),
  t0: z.looseObject({ addr: z.string(), sym: z.string(), liqUsd: z.string().nullable().optional() }),
  t1: z.looseObject({ addr: z.string(), sym: z.string(), liqUsd: z.string().nullable().optional() }),
  top: z.boolean().optional(),
});
export const DexTokenPoolsSchema = z.looseObject({ data: z.array(DexPoolSchema), status: StatusSchema });

/* ---------- DEX K-line candles (/v1/k-line/candles) — keyless verified 2026-11-21 ----------
 * Docs say [o,h,l,c,volume,timestamp(seconds),traders]; live responses on
 * 2026-11-21 returned the timestamp in MILLISECONDS and numbers with >15
 * significant digits. Both are handled in @veydara/quant fromCmcKlineRows. */
export const KlineRowSchema = z.array(z.union([z.number(), z.string(), z.null()])).min(6);
export const KlineCandlesSchema = z.looseObject({ data: z.array(KlineRowSchema), status: StatusSchema });

/* ---------- /v1/key/info (0 credits) ---------- */
export const KeyInfoSchema = z.looseObject({
  data: z.looseObject({
    plan: z.looseObject({ credit_limit_monthly: nullableNum, credit_limit_monthly_reset_timestamp: z.string().nullable().optional(), rate_limit_minute: nullableNum }),
    usage: z.looseObject({ current_month: z.looseObject({ credits_used: nullableNum, credits_left: nullableNum }).optional() }).optional(),
  }),
  status: StatusSchema,
});
