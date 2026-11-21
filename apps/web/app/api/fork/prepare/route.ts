import { json, rateLimit, sameOrigin } from "@/lib/server/http";
import { prepare } from "@/lib/server/fork";

export const dynamic = "force-dynamic";

/** validate → fork guard → fresh state → typed route → verifier → fork simulation (reverted snapshot) → preview. Nothing is signed. */
export async function POST(req: Request) {
  const bad = sameOrigin(req) ?? rateLimit(req, "fork-prepare", 20);
  if (bad) return bad;
  const body = await req.json().catch(() => null);
  try {
    return json(await prepare(body));
  } catch (e) {
    return json({ error: { code: "FORK_PREPARE_FAILED", message: (e as Error).message.slice(0, 240) } }, { status: 409 });
  }
}
