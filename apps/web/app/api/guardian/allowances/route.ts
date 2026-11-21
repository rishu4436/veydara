import { z } from "zod";
import { isAddress } from "viem";
import { json, rateLimit } from "@/lib/server/http";
import { emergencyInspect } from "@/lib/server/guardian";

export const dynamic = "force-dynamic";
const Q = z.object({ address: z.string().refine((a) => isAddress(a, { strict: false }), "invalid EVM address") });

export async function GET(req: Request) {
  const limited = rateLimit(req, "guardian-allowances", 8);
  if (limited) return limited;
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "address must be a Base (EVM) address" } }, { status: 400 });
  try {
    return json(await emergencyInspect(p.data.address));
  } catch (e) {
    return json({ status: "unavailable", reason: (e as Error).message.slice(0, 200) }, { status: 503 });
  }
}
