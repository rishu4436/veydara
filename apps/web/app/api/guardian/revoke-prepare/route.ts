import { z } from "zod";
import { json, rateLimit, sameOrigin } from "@/lib/server/http";
import { prepareRevoke } from "@/lib/server/guardian";

export const dynamic = "force-dynamic";
const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const B = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allowance"), owner: Addr, token: Addr, spender: Addr }),
  z.object({ kind: z.literal("positionManager"), owner: Addr, positionManager: Addr }),
]);

/** Builds revoke calldata and simulates it ONLY on the local fork (reverted snapshot). VEYDARA never sends it to Base. */
export async function POST(req: Request) {
  const bad = sameOrigin(req) ?? rateLimit(req, "guardian-revoke", 10);
  if (bad) return bad;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: p.error.issues.map((i) => i.message).join("; ") } }, { status: 400 });
  try {
    return json(await prepareRevoke(p.data));
  } catch (e) {
    return json({ error: { code: "REVOKE_PREP_FAILED", message: (e as Error).message.slice(0, 200) } }, { status: 409 });
  }
}
