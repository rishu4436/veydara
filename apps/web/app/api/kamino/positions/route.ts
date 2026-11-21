import { json, rateLimit } from "@/lib/server/http";
import { kaminoPositions } from "@/lib/server/kamino";

export const dynamic = "force-dynamic";

/** A Solana wallet's Kamino obligations on the verified xStocks market (read-only). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "kamino-positions", 10);
  if (limited) return limited;
  const owner = new URL(req.url).searchParams.get("owner")?.trim() ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) return json({ error: { code: "INVALID_ADDRESS", message: "owner must be a base58 Solana address" } }, { status: 400 });
  try {
    return json({ positions: await kaminoPositions(owner) });
  } catch (e) {
    return json({ error: { code: "KAMINO_UNAVAILABLE", message: `Kamino read failed: ${(e as Error).message.slice(0, 200)}` } }, { status: 503 });
  }
}
