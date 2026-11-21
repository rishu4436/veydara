import { z } from "zod";
import { DEFAULT_POLICIES } from "@veydara/protocols";
import { requireAuth } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const Policies = z
  .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,32}$/), kind: z.enum(["hf-below", "drawdown-below", "gap-hf-below", "oracle-stale-hours", "radar-at-least"]), threshold: z.number().finite().min(0).max(1000), enabled: z.boolean(), mode: z.literal("monitor") }))
  .max(20);

/** Guardian policies persisted per signed-in user. Monitor-only is enforced by the schema. */
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: false });
    if ("error" in auth) return auth.error;
    const p = await store().getPolicies(auth.session.userId);
    return json({ policies: p ?? DEFAULT_POLICIES, stored: p !== null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: true });
    if ("error" in auth) return auth.error;
    const b = z.object({ policies: Policies }).safeParse(await req.json().catch(() => null));
    if (!b.success) return json({ error: { code: "BAD_REQUEST", message: b.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, { status: 400 });
    await store().setPolicies(auth.session.userId, b.data.policies);
    return json({ ok: true, policies: b.data.policies });
  } catch (e) {
    return errorResponse(e);
  }
}
