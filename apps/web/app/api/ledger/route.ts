import { cmc } from "@/lib/server/cmc";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** API Evidence inspector: credit ledger with expected vs actual credit_count. No secrets included. */
export async function GET() {
  const g = cmc();
  return json({ mode: g.hasKey ? "pro" : "keyless-or-unavailable", summary: g.ledger.summary(), entries: g.ledger.list(200) });
}
