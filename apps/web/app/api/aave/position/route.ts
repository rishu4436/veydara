import { z } from "zod";
import { isAddress } from "viem";
import { analysePosition } from "@/lib/server/aave";
import { json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const Q = z.object({ address: z.string().refine((a) => isAddress(a, { strict: false }), "invalid EVM address") });

export async function GET(req: Request) {
  const limited = rateLimit(req, "aave-position", 20);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "address must be a Base (EVM) address" } }, { status: 400 });
  try {
    return json(await analysePosition(p.data.address));
  } catch (e) {
    return json({ status: "unavailable", code: "RPC_UNAVAILABLE", reason: (e as Error).message.slice(0, 200) }, { status: 503 });
  }
}
