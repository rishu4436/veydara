import { aaveMarket, sources } from "@/lib/server/aave";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = rateLimit(req, "aave-market", 30);
  if (limited) return limited;
  try {
    return json({ market: await aaveMarket(), sources });
  } catch (e) {
    return json({ status: "unavailable", code: "RPC_UNAVAILABLE", reason: (e as Error).message.slice(0, 200) }, { status: 503 });
  }
}
