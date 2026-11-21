import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const AlertZ = z.object({
  key: z.string().max(80),
  policyId: z.string().max(32),
  kind: z.string().max(32),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().max(200),
  detail: z.string().max(600),
  observed: z.string().max(80),
  threshold: z.string().max(80),
  blockNumber: z.string().max(20),
  mode: z.literal("monitor"),
  action: z.literal("none (monitor-only)"),
});

/** Persisted alert inbox for the signed-in user (monitor-only; nothing is ever acted on). */
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: false });
    if ("error" in auth) return auth.error;
    return json({ alerts: await store().listAlerts(auth.session.userId) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: true });
    if ("error" in auth) return auth.error;
    const b = z.object({ alerts: z.array(AlertZ).max(100) }).safeParse(await req.json().catch(() => null));
    if (!b.success) return json({ error: { code: "BAD_REQUEST", message: "alerts[] invalid" } }, { status: 400 });
    const rows = await store().upsertAlerts(auth.session.userId, b.data.alerts.map((a) => ({ alertKey: a.key, payload: a })), new Date());
    return json({ ok: true, alerts: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: true });
    if ("error" in auth) return auth.error;
    const b = z.object({ key: z.string().max(80) }).safeParse(await req.json().catch(() => null));
    if (!b.success) return json({ error: { code: "BAD_REQUEST", message: "key required" } }, { status: 400 });
    return json({ ok: await store().ackAlert(auth.session.userId, b.data.key) });
  } catch (e) {
    return errorResponse(e);
  }
}
