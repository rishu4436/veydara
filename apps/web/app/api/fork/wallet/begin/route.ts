import { z } from "zod";
import { requireAuth, sessionWithWallets } from "@/lib/server/auth";
import { json, rateLimit } from "@/lib/server/http";
import { beginWallet } from "@/lib/server/fork";

export const dynamic = "force-dynamic";
const B = z.object({ previewId: z.uuid(), previewHash: z.string().regex(/^0x[0-9a-f]{64}$/) });

/** FORK ONLY · wallet signer: freshness re-check, then the exact previewed steps (chain 31337) for the user's wallet to sign. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "fork-wallet", 20);
  if (limited) return limited;
  const auth = await requireAuth(req, { csrf: true });
  if ("error" in auth) return auth.error;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: "previewId and previewHash required" } }, { status: 400 });
  try {
    return json(await beginWallet(p.data.previewId, p.data.previewHash, (await sessionWithWallets(req))!));
  } catch (e) {
    return json({ error: { code: "FORK_WALLET_REFUSED", message: (e as Error).message.slice(0, 240) } }, { status: 409 });
  }
}
