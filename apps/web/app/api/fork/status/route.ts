import { json } from "@/lib/server/http";
import { forkStatus } from "@/lib/server/fork";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await forkStatus());
}
