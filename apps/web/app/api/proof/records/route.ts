import { json } from "@/lib/server/http";
import { proofRecords } from "@/lib/server/fork";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ records: proofRecords() });
}
