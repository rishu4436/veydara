import { clearSessionCookies, requireAuth } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: true });
    if ("error" in auth) return auth.error;
    await store().deleteSession(auth.session.idHash);
    const res = json({ ok: true });
    clearSessionCookies(res, req);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
