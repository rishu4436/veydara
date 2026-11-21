import { cmc } from "@/lib/server/cmc";
import { json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** API Evidence inspector: credit ledger with expected vs actual credit_count. No secrets included. */
export async function GET() {
  const g = cmc();
  const ps = g.proStatus;
  return json({ mode: ps.usable ? "pro" : g.hasKey ? "keyless (pro key rejected by CMC)" : "keyless-or-unavailable", pro: { keyConfigured: g.hasKey, usable: ps.usable, httpStatus: ps.httpStatus, cmcErrorCode: ps.cmcErrorCode, reason: ps.suspendedReason }, summary: g.ledger.summary(), entries: g.ledger.list(200), persisted: { store: store().info(), recent: await store().listLedger(50).catch(() => []) } });
}
