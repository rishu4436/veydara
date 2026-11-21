import { z } from "zod";
import { assetIntel } from "@/lib/server/asset";
import { errorResponse, json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({ chain: z.enum(["base", "solana"]), address: z.string().min(32).max(64) });

export async function GET(req: Request) {
  const limited = rateLimit(req, "asset", 20);
  if (limited) return limited;
  const parsed = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return json({ error: { code: "BAD_REQUEST", message: "chain and address required" } }, { status: 400 });
  try {
    return json(await assetIntel(parsed.data.chain, parsed.data.address));
  } catch (e) {
    return errorResponse(e);
  }
}
