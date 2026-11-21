import { json } from "@/lib/server/http";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ mode: serverEnv().VEYDARA_DATASET });
}
