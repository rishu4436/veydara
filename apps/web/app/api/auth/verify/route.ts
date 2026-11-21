import { z } from "zod";
import { linkWallet, signIn, SiweError, verifySiwe } from "@veydara/auth";
import { contractVerifier, currentSession, expectedOrigin, requireAuth, setSessionCookies, strictSameOrigin } from "@/lib/server/auth";
import { errorResponse, json, rateLimit } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().min(1).max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(20_000), link: z.boolean().default(false) });

/** Verify a SIWE signature. link=false → sign in (new session, rotates any old one); link=true → add this wallet to the signed-in account (CSRF required). */
export async function POST(req: Request) {
  const limited = rateLimit(req, "auth-verify", 15);
  if (limited) return limited;
  const so = strictSameOrigin(req);
  if (so) return so;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: { code: "BAD_REQUEST", message: "message and signature are required" } }, { status: 400 });
  try {
    const st = store();
    if (body.data.link) {
      const auth = await requireAuth(req, { csrf: true });
      if ("error" in auth) return auth.error;
      const v = await verifySiwe({ store: st, message: body.data.message, signature: body.data.signature, expectedOrigin: expectedOrigin(req), contractVerifier: contractVerifier() });
      await linkWallet(st, auth.session.userId, v);
      return json({ ok: true, linked: v.address, verifiedVia: v.verifiedVia, wallets: (await st.listWallets(auth.session.userId)).map((w) => ({ address: w.address, chainId: w.chainId, verifiedVia: w.verifiedVia, linkedAt: w.linkedAt })) });
    }
    const v = await verifySiwe({ store: st, message: body.data.message, signature: body.data.signature, expectedOrigin: expectedOrigin(req), contractVerifier: contractVerifier() });
    const old = await currentSession(req);
    if (old) await st.deleteSession(old.idHash); // session fixation: always rotate
    const s = await signIn(st, v);
    const res = json({ ok: true, address: v.address, verifiedVia: v.verifiedVia, newUser: s.newUser, expiresAt: s.row.expiresAt });
    setSessionCookies(res, req, s);
    return res;
  } catch (e) {
    if (e instanceof SiweError) return json({ error: { code: e.code, message: e.message } }, { status: e.code === "SIWE_WALLET_TAKEN" ? 409 : 401 });
    return errorResponse(e);
  }
}
