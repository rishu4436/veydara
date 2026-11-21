import { z } from "zod";
import { PRESETS } from "@veydara/intent";
import { sessionWithWallets } from "@/lib/server/auth";
import { errorResponse, json, rateLimit, sameOrigin } from "@/lib/server/http";
import { runIntent } from "@/lib/server/intent";

export const dynamic = "force-dynamic";

const B = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), text: z.string().max(500).default(""), preset: z.string().max(32).optional() });

export async function GET() {
  return json({ presets: PRESETS });
}

/** Parse a goal deterministically into bounded constraints, then run the constrained Solver Arena. Read-only: nothing is signed. */
export async function POST(req: Request) {
  const bad = sameOrigin(req) ?? rateLimit(req, "intent", 20);
  if (bad) return bad;
  const b = B.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: { code: "BAD_REQUEST", message: b.error.issues.map((i) => i.message).join("; ") } }, { status: 400 });
  try {
    return json(await runIntent({ user: b.data.address, text: b.data.text, preset: b.data.preset }, (await sessionWithWallets(req))?.userId ?? null));
  } catch (e) {
    return errorResponse(e);
  }
}
