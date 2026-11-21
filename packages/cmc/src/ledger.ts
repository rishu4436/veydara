/** Global credit ledger: one row per upstream call or cache decision. */
export type CacheOutcome = "miss" | "hit" | "stale" | "dedup" | "negative" | "blocked";

export interface LedgerEntry {
  at: string;
  endpoint: string;
  mode: "pro" | "keyless" | "none";
  paramsKey: string;
  feature: string;
  outcome: CacheOutcome;
  httpStatus?: number;
  expectedCredits: number;
  /** status.credit_count from the CMC response; undefined when no upstream call. */
  actualCredits?: number;
  errorCode?: string;
  latencyMs?: number;
}

export interface LedgerSummary {
  upstreamCalls: number;
  cacheHits: number;
  dedupedCalls: number;
  blockedCalls: number;
  expectedCredits: number;
  actualCredits: number;
  byEndpoint: Record<string, { calls: number; hits: number; expected: number; actual: number; errors: number }>;
}

export class CreditLedger {
  private entries: LedgerEntry[] = [];
  /** `sink` receives every entry (e.g. to persist the ledger to Postgres). It must never throw. */
  constructor(private readonly max = 2000, private readonly sink?: (e: LedgerEntry) => void) {}

  record(e: LedgerEntry): void {
    this.entries.push(e);
    try {
      this.sink?.(e);
    } catch {
      /* persistence is best-effort; the in-memory ledger stays authoritative for this process */
    }
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  }

  list(limit = 200): LedgerEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  summary(): LedgerSummary {
    const s: LedgerSummary = { upstreamCalls: 0, cacheHits: 0, dedupedCalls: 0, blockedCalls: 0, expectedCredits: 0, actualCredits: 0, byEndpoint: {} };
    for (const e of this.entries) {
      const b = (s.byEndpoint[e.endpoint] ??= { calls: 0, hits: 0, expected: 0, actual: 0, errors: 0 });
      if (e.outcome === "miss") {
        s.upstreamCalls++;
        b.calls++;
        s.expectedCredits += e.expectedCredits;
        b.expected += e.expectedCredits;
        s.actualCredits += e.actualCredits ?? 0;
        b.actual += e.actualCredits ?? 0;
      } else if (e.outcome === "hit" || e.outcome === "stale") {
        s.cacheHits++;
        b.hits++;
      } else if (e.outcome === "dedup") {
        s.dedupedCalls++;
      } else {
        s.blockedCalls++;
      }
      if (e.errorCode) b.errors++;
    }
    return s;
  }
}
