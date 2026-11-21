import { json } from "@/lib/server/http";
import { proofRecords } from "@/lib/server/fork";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const intents = (await store().listProofs(100)).filter((p) => p.kind === "intent-solve").slice(0, 20).map((p) => ({ id: p.id, label: p.label, outcome: p.outcome, account: p.account, createdAt: p.createdAt, record: p.record }));
  return json({ records: await proofRecords(), intents, store: store().info() });
}
