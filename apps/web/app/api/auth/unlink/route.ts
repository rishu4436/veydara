import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { errorResponse, json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const Body = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req, { csrf: true });
    if ("error" in auth) return auth.error;
    const b = Body.safeParse(await req.json().catch(() => null));
    if (!b.success) return json({ error: { code: "BAD_REQUEST", message: "address required" } }, { status: 400 });
    const st = store();
    const list = await st.listWallets(auth.session.userId);
    if (list.length <= 1) return json({ error: { code: "LAST_WALLET", message: "Keep at least one proven wallet; sign out instead." } }, { status: 409 });
    const ok = await st.unlinkWallet(auth.session.userId, b.data.address);
    return json({ ok, wallets: (await st.listWallets(auth.session.userId)).map((w) => ({ address: w.address, chainId: w.chainId, verifiedVia: w.verifiedVia, linkedAt: w.linkedAt })) });
  } catch (e) {
    return errorResponse(e);
  }
}
