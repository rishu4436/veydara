import { currentSession } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const st = store();
    const s = await currentSession(req);
    if (!s) return json({ authenticated: false, store: st.info() });
    const wallets = (await st.listWallets(s.userId)).map((w) => ({ address: w.address, chainId: w.chainId, verifiedVia: w.verifiedVia, linkedAt: w.linkedAt }));
    return json({ authenticated: true, userId: s.userId, expiresAt: s.expiresAt, wallets, store: st.info() });
  } catch (e) {
    return errorResponse(e);
  }
}
