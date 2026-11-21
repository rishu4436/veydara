import { z } from "zod";
import { buildPortfolio } from "@/lib/server/portfolio";
import { errorResponse, json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const Q = z.object({
  chain: z.enum(["base", "solana"]),
  address: z.string().min(32).max(64),
  tokens: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  const limited = rateLimit(req, "portfolio", 12);
  if (limited) return limited;
  const url = new URL(req.url);
  const parsed = Q.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return json({ error: { code: "BAD_REQUEST", message: "chain=base|solana and a valid address are required" } }, { status: 400 });
  try {
    const extra = parsed.data.tokens ? parsed.data.tokens.split(",").filter(Boolean) : [];
    return json(await buildPortfolio(parsed.data.chain, parsed.data.address, extra));
  } catch (e) {
    return errorResponse(e);
  }
}
