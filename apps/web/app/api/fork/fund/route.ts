import { z } from "zod";
import { json, rateLimit, sameOrigin } from "@/lib/server/http";
import { fundAccount } from "@/lib/server/fork";

export const dynamic = "force-dynamic";
const B = z.object({ account: z.string().regex(/^0x[0-9a-fA-F]{40}$/), symbol: z.enum(["AAPLc", "AMZNc", "GOOGLc", "METAc", "MSFTc", "NVDAc", "TSLAc", "SPCXc", "USDC"]), amount: z.string().regex(/^[0-9]+(\.[0-9]+)?$/) });

/** FORK ONLY: move existing token balance to an anvil test account by impersonating a holder inside the fork. */
export async function POST(req: Request) {
  const bad = sameOrigin(req) ?? rateLimit(req, "fork-fund", 10);
  if (bad) return bad;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: p.error.issues.map((i) => i.message).join("; ") } }, { status: 400 });
  try {
    return json({ status: "ok", funding: await fundAccount(p.data.account, p.data.symbol, p.data.amount) });
  } catch (e) {
    return json({ error: { code: "FORK_FUNDING_FAILED", message: (e as Error).message.slice(0, 240) } }, { status: 409 });
  }
}
