import { CmcGateway, CreditLedger, type LedgerEntry } from "@veydara/cmc";
import { serverEnv } from "./env";
import { store } from "./store";

/** Persist ledger rows in small batches (no params/keys — LedgerEntry carries none). */
function persistentSink() {
  let buf: LedgerEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const rows = buf;
    buf = [];
    store()
      .appendLedger(rows.map((e) => ({ at: e.at, endpoint: e.endpoint, mode: e.mode, feature: e.feature, outcome: e.outcome, httpStatus: e.httpStatus ?? null, expectedCredits: e.expectedCredits, actualCredits: e.actualCredits ?? null, errorCode: e.errorCode ?? null, latencyMs: e.latencyMs ?? null })))
      .catch((err: unknown) => console.warn("credit ledger persistence failed:", (err as Error).message));
  };
  return (e: LedgerEntry) => {
    buf.push(e);
    timer ??= setTimeout(flush, 1000);
  };
}

const g = globalThis as unknown as { __veydaraCmc?: CmcGateway };

/** Process-wide singleton so cache, single-flight and the credit ledger are shared. */
export function cmc(): CmcGateway {
  if (!g.__veydaraCmc) {
    const env = serverEnv();
    g.__veydaraCmc = new CmcGateway({ apiKey: env.CMC_API_KEY, allowKeyless: env.CMC_ALLOW_KEYLESS === "true", ledger: new CreditLedger(2000, persistentSink()) });
  }
  return g.__veydaraCmc;
}
