/**
 * Server-side CMC gateway (spec §3 budget controller).
 * - Missing key never triggers a network call for key-only endpoints → honest CMC_KEY_MISSING.
 * - Keyless (/public-api) mode for the documented keyless subset.
 * - Keyed TTL cache by data class, stale-while-error, single-flight dedupe.
 * - Negative caching for plan 403s (no repeated 403 hammering), backoff on 429/1022,
 *   circuit breaker on upstream failures.
 * - Every decision is written to the credit ledger with expected vs actual credit_count.
 */
import type { Provenance } from "@veydara/domain";
import { VeydaraError, type VeydaraErrorCode } from "@veydara/domain";
import { ENDPOINTS, type EndpointData, type EndpointId } from "./endpoints";
import { CreditLedger, type CacheOutcome } from "./ledger";
import { ErrorEnvelopeSchema } from "./schemas";

export const PRO_BASE = "https://pro-api.coinmarketcap.com";
export const KEYLESS_BASE = "https://pro-api.coinmarketcap.com/public-api";

export interface GatewayOptions {
  apiKey?: string | undefined;
  /** Allow keyless public API for documented keyless endpoints when no key is set. */
  allowKeyless?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ledger?: CreditLedger;
  timeoutMs?: number;
  circuitThreshold?: number;
  circuitCooldownMs?: number;
}

export interface RequestOptions {
  feature: string;
  /** Bypass fresh cache (e.g. revalidation before execution). Still single-flighted. */
  revalidate?: boolean;
}

export type GatewayResult<T> =
  | { ok: true; data: T; provenance: Provenance; cache: CacheOutcome; creditCount?: number }
  | { ok: false; error: { code: VeydaraErrorCode; message: string; httpStatus?: number; cmcErrorCode?: string }; provenance: Provenance; stale?: { data: T; fetchedAt: string } };

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  observedAt: string | null;
  mode: "pro" | "keyless";
  creditCount?: number;
}

interface NegativeEntry {
  until: number;
  code: VeydaraErrorCode;
  message: string;
  httpStatus?: number;
  cmcErrorCode?: string;
}

export function paramsKey(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

export class CmcGateway {
  readonly ledger: CreditLedger;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly negative = new Map<string, NegativeEntry>();
  private readonly inflight = new Map<string, Promise<GatewayResult<unknown>>>();
  private failures = 0;
  private circuitOpenUntil = 0;
  private backoffUntil: Record<"pro" | "keyless", number> = { pro: 0, keyless: 0 };
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opts: GatewayOptions = {}) {
    this.ledger = opts.ledger ?? new CreditLedger();
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  get hasKey(): boolean {
    return Boolean(this.opts.apiKey && this.opts.apiKey.trim());
  }

  /** Which access mode would be used for this endpoint, or null when unavailable. */
  modeFor(endpoint: EndpointId): "pro" | "keyless" | null {
    if (this.hasKey) return "pro";
    if (ENDPOINTS[endpoint].keyless && this.opts.allowKeyless !== false) return "keyless";
    return null;
  }

  async request<E extends EndpointId>(endpoint: E, params: Record<string, string>, ro: RequestOptions): Promise<GatewayResult<EndpointData<E>>> {
    const def = ENDPOINTS[endpoint];
    const pk = paramsKey(params);
    const key = `${endpoint}?${pk}`;
    const now = this.now();
    const expected = def.estimateCredits(params);
    const mode = this.modeFor(endpoint);
    const baseProv = (freshness: Provenance["freshness"], fetchedAt: number, observedAt: string | null, src: "cmc-pro" | "cmc-keyless"): Provenance => ({
      source: src,
      endpointOrContract: def.path,
      assetId: params.id ?? params.rwa_id ?? params.symbol ?? params.address,
      observedAt,
      fetchedAt: new Date(fetchedAt).toISOString(),
      currency: "USD",
      freshness,
      coverage: freshness === "unavailable" ? "none" : "complete",
      isSimulated: false,
    });

    const fail = (code: VeydaraErrorCode, message: string, outcome: CacheOutcome, extra: Partial<NegativeEntry> = {}): GatewayResult<EndpointData<E>> => {
      this.ledger.record({ at: new Date(now).toISOString(), endpoint: def.path, mode: mode ?? "none", paramsKey: pk, feature: ro.feature, outcome, expectedCredits: 0, errorCode: code, httpStatus: extra.httpStatus });
      const cached = this.cache.get(key);
      return {
        ok: false,
        error: { code, message, httpStatus: extra.httpStatus, cmcErrorCode: extra.cmcErrorCode },
        provenance: baseProv("unavailable", now, null, mode === "pro" ? "cmc-pro" : "cmc-keyless"),
        stale: cached && now - cached.fetchedAt <= def.staleMs ? { data: cached.data as EndpointData<E>, fetchedAt: new Date(cached.fetchedAt).toISOString() } : undefined,
      };
    };

    if (!mode) {
      return fail("CMC_KEY_MISSING", `CMC_API_KEY is not configured; ${def.path} requires an API key (no keyless access).`, "blocked");
    }

    const neg = this.negative.get(key) ?? this.negative.get(`${endpoint}?*`);
    if (neg && neg.until > now) return fail(neg.code, neg.message, "negative", neg);

    const cached = this.cache.get(key);
    if (cached && !ro.revalidate && now - cached.fetchedAt <= def.ttlMs) {
      this.ledger.record({ at: new Date(now).toISOString(), endpoint: def.path, mode: cached.mode, paramsKey: pk, feature: ro.feature, outcome: "hit", expectedCredits: 0 });
      return { ok: true, data: cached.data as EndpointData<E>, provenance: baseProv("cached", cached.fetchedAt, cached.observedAt, cached.mode === "pro" ? "cmc-pro" : "cmc-keyless"), cache: "hit", creditCount: cached.creditCount };
    }

    const existing = this.inflight.get(key);
    if (existing) {
      this.ledger.record({ at: new Date(now).toISOString(), endpoint: def.path, mode, paramsKey: pk, feature: ro.feature, outcome: "dedup", expectedCredits: 0 });
      const r = (await existing) as GatewayResult<EndpointData<E>>;
      return r.ok ? { ...r, cache: "dedup" } : r;
    }

    if (this.circuitOpenUntil > now) return this.serveStaleOr(key, def, pk, ro, now, mode, fail("CIRCUIT_OPEN", "CMC circuit breaker open after repeated upstream failures; retry shortly.", "blocked"));
    if (this.backoffUntil[mode] > now) return this.serveStaleOr(key, def, pk, ro, now, mode, fail("CMC_RATE_LIMITED", `CMC ${mode} rate limit backoff active until ${new Date(this.backoffUntil[mode]).toISOString()}.`, "blocked"));

    const p = this.fetchUpstream(endpoint, params, ro, mode, key, pk, expected, baseProv);
    this.inflight.set(key, p as Promise<GatewayResult<unknown>>);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  private serveStaleOr<E extends EndpointId>(key: string, def: (typeof ENDPOINTS)[E], pk: string, ro: RequestOptions, now: number, mode: "pro" | "keyless", failure: GatewayResult<EndpointData<E>>): GatewayResult<EndpointData<E>> {
    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt <= def.staleMs) {
      this.ledger.record({ at: new Date(now).toISOString(), endpoint: def.path, mode, paramsKey: pk, feature: ro.feature, outcome: "stale", expectedCredits: 0 });
      return {
        ok: true,
        data: cached.data as EndpointData<E>,
        provenance: { ...failure.provenance, freshness: "stale", coverage: "complete", fetchedAt: new Date(cached.fetchedAt).toISOString(), observedAt: cached.observedAt },
        cache: "stale",
      };
    }
    return failure;
  }

  private async fetchUpstream<E extends EndpointId>(
    endpoint: E,
    params: Record<string, string>,
    ro: RequestOptions,
    mode: "pro" | "keyless",
    key: string,
    pk: string,
    expected: number,
    baseProv: (f: Provenance["freshness"], fetchedAt: number, observedAt: string | null, src: "cmc-pro" | "cmc-keyless") => Provenance,
  ): Promise<GatewayResult<EndpointData<E>>> {
    const def = ENDPOINTS[endpoint];
    const started = this.now();
    const url = new URL((mode === "pro" ? PRO_BASE : KEYLESS_BASE) + def.path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (mode === "pro") headers["X-CMC_PRO_API_KEY"] = this.opts.apiKey as string;
    const src = mode === "pro" ? "cmc-pro" : "cmc-keyless";

    const record = (outcome: CacheOutcome, extra: { httpStatus?: number; actual?: number; errorCode?: string }) =>
      this.ledger.record({
        at: new Date(started).toISOString(),
        endpoint: def.path,
        mode,
        paramsKey: pk,
        feature: ro.feature,
        outcome,
        expectedCredits: expected,
        actualCredits: extra.actual,
        httpStatus: extra.httpStatus,
        errorCode: extra.errorCode,
        latencyMs: this.now() - started,
      });

    const failWith = (code: VeydaraErrorCode, message: string, httpStatus?: number, cmcErrorCode?: string): GatewayResult<EndpointData<E>> => {
      const cached = this.cache.get(key);
      const now = this.now();
      return {
        ok: false,
        error: { code, message, httpStatus, cmcErrorCode },
        provenance: baseProv("unavailable", now, null, src),
        stale: cached && now - cached.fetchedAt <= def.staleMs ? { data: cached.data as EndpointData<E>, fetchedAt: new Date(cached.fetchedAt).toISOString() } : undefined,
      };
    };

    let res: Response;
    let body: unknown;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 12_000);
      try {
        res = await this.fetchImpl(url, { headers, signal: ctrl.signal, cache: "no-store" });
      } finally {
        clearTimeout(t);
      }
      body = await res.json().catch(() => null);
    } catch (e) {
      this.noteFailure();
      record("miss", { errorCode: "CMC_UPSTREAM" });
      return failWith("CMC_UPSTREAM", `Network error calling CMC: ${(e as Error).message}`);
    }

    const env = ErrorEnvelopeSchema.safeParse(body);
    const cmcCode = env.success ? String(env.data.status.error_code) : undefined;
    const cmcMsg = env.success ? (env.data.status.error_message ?? "") : "";
    const actual = env.success ? env.data.status.credit_count : undefined;

    if (!res.ok || (cmcCode && cmcCode !== "0")) {
      const status = res.status;
      let code: VeydaraErrorCode = "CMC_UPSTREAM";
      if (cmcCode === "1002" || cmcCode === "1001" || status === 401) code = "CMC_KEY_MISSING";
      else if (cmcCode === "1022" || cmcCode === "1008" || cmcCode === "1009" || status === 429) code = "CMC_RATE_LIMITED";
      else if (cmcCode === "1010" || cmcCode === "1011" || cmcCode === "1012") code = "CMC_CREDITS_EXHAUSTED";
      else if (status === 403 || cmcCode === "1005" || cmcCode === "1006" || cmcCode === "1007" || cmcCode === "1014") code = "CMC_PLAN_FORBIDDEN";
      else if (status === 400) code = "CMC_BAD_REQUEST";
      record("miss", { httpStatus: status, actual, errorCode: code });

      if (code === "CMC_RATE_LIMITED") {
        // Exponential-ish backoff; keyless pool is shared by IP so back off longer.
        this.backoffUntil[mode] = this.now() + (mode === "keyless" ? 60_000 : 20_000);
      } else if (code === "CMC_PLAN_FORBIDDEN" || code === "CMC_KEY_MISSING") {
        // Negative-cache plan gating so a 403 is not hammered (spec §3.3).
        this.negative.set(key, { until: this.now() + 60 * 60_000, code, message: cmcMsg || `HTTP ${status}`, httpStatus: status, cmcErrorCode: cmcCode });
      } else if (code === "CMC_CREDITS_EXHAUSTED") {
        this.negative.set(`${endpoint}?*`, { until: this.now() + 30 * 60_000, code, message: cmcMsg, httpStatus: status, cmcErrorCode: cmcCode });
      } else if (code === "CMC_BAD_REQUEST") {
        this.negative.set(key, { until: this.now() + 10 * 60_000, code, message: cmcMsg, httpStatus: status, cmcErrorCode: cmcCode });
      } else {
        this.noteFailure();
      }
      const failure = failWith(code, cmcMsg || `CMC HTTP ${status}`, status, cmcCode);
      if (failure.ok === false && failure.stale) {
        // stale-while-error is surfaced explicitly to the caller; never silently "live"
        return failure;
      }
      return failure;
    }

    const parsed = def.schema.safeParse(body);
    if (!parsed.success) {
      record("miss", { httpStatus: res.status, actual, errorCode: "CMC_SCHEMA_MISMATCH" });
      return failWith("CMC_SCHEMA_MISMATCH", `Response for ${def.path} did not match the expected schema: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.message).join("; ")}`, res.status);
    }

    this.failures = 0;
    const fetchedAt = this.now();
    const observedAt = env.success ? env.data.status.timestamp : null;
    this.cache.set(key, { data: parsed.data, fetchedAt, observedAt, mode, creditCount: actual });
    record("miss", { httpStatus: res.status, actual });
    return { ok: true, data: parsed.data as EndpointData<E>, provenance: baseProv("live", fetchedAt, observedAt, src), cache: "miss", creditCount: actual };
  }

  private noteFailure() {
    this.failures++;
    if (this.failures >= (this.opts.circuitThreshold ?? 5)) {
      this.circuitOpenUntil = this.now() + (this.opts.circuitCooldownMs ?? 30_000);
      this.failures = 0;
    }
  }
}

export function assertOk<T>(r: GatewayResult<T>): T {
  if (!r.ok) throw new VeydaraError(r.error.code, r.error.message);
  return r.data;
}
