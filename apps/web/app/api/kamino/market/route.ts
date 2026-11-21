import { json, rateLimit } from "@/lib/server/http";
import { kaminoMarket } from "@/lib/server/kamino";

export const dynamic = "force-dynamic";

/** Kamino xStocks market (Solana), read-only via the official SDK. */
export async function GET(req: Request) {
  const limited = rateLimit(req, "kamino-market", 30);
  if (limited) return limited;
  try {
    return json({ market: await kaminoMarket() });
  } catch (e) {
    return json({ error: { code: "KAMINO_UNAVAILABLE", message: `Kamino read failed: ${(e as Error).message.slice(0, 200)}` } }, { status: 503 });
  }
}
