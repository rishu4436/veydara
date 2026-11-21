import { json, rateLimit, sameOrigin } from "@/lib/server/http";
import { prepare } from "@/lib/server/fork";
import { requireAuth, sessionWithWallets } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** validate → fork guard → fresh state → typed route → verifier → fork simulation (reverted snapshot) → preview. Nothing is signed. */
export async function POST(req: Request) {
  const bad = sameOrigin(req) ?? rateLimit(req, "fork-prepare", 20);
  if (bad) return bad;
  const body = (await req.json().catch(() => null)) as { signer?: string } | null;
  if (body?.signer === "wallet") {
    const auth = await requireAuth(req, { csrf: true });
    if ("error" in auth) return auth.error;
  }
  try {
    return json(await prepare(body, await sessionWithWallets(req)));
  } catch (e) {
    return json({ error: { code: "FORK_PREPARE_FAILED", message: (e as Error).message.slice(0, 240) } }, { status: 409 });
  }
}
