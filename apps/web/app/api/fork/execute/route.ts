import { z } from "zod";
import { json, rateLimit, sameOrigin } from "@/lib/server/http";
import { execute } from "@/lib/server/fork";

export const dynamic = "force-dynamic";
const B = z.object({ previewId: z.uuid(), previewHash: z.string().regex(/^0x[0-9a-f]{64}$/) });

/** After explicit confirmation of a preview: freshness re-check → sign (anvil test key, chain 31337) → send to the LOCAL fork → receipts → reconcile → proof record. */
export async function POST(req: Request) {
  const bad = sameOrigin(req) ?? rateLimit(req, "fork-execute", 10);
  if (bad) return bad;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "previewId and previewHash required" } }, { status: 400 });
  try {
    return json(await execute(p.data.previewId, p.data.previewHash));
  } catch (e) {
    return json({ error: { code: "FORK_EXECUTE_REFUSED", message: (e as Error).message.slice(0, 240) } }, { status: 409 });
  }
}
