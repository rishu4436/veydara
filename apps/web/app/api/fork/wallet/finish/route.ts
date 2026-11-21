import { z } from "zod";
import { requireAuth, sessionWithWallets } from "@/lib/server/auth";
import { json, rateLimit } from "@/lib/server/http";
import { finishWallet } from "@/lib/server/fork";

export const dynamic = "force-dynamic";
const B = z.object({
  previewId: z.uuid(),
  submitted: z.array(z.object({ stepIndex: z.number().int().min(0).max(16), hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).nullable(), error: z.string().max(300).optional() })).max(16),
});

/** FORK ONLY · wallet signer: verify each wallet-sent tx against the preview → receipts → reconcile → Proof Center record. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "fork-wallet", 20);
  if (limited) return limited;
  const auth = await requireAuth(req, { csrf: true });
  if ("error" in auth) return auth.error;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "previewId and submitted[] required" } }, { status: 400 });
  try {
    return json(await finishWallet(p.data.previewId, p.data.submitted.map((s) => ({ ...s, hash: s.hash as `0x${string}` | null })), (await sessionWithWallets(req))!));
  } catch (e) {
    return json({ error: { code: "FORK_WALLET_REFUSED", message: (e as Error).message.slice(0, 240) } }, { status: 409 });
  }
}
