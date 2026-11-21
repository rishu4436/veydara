import { z } from "zod";
import { isAddress } from "viem";
import { DEFAULT_POLICIES } from "@veydara/protocols";
import { json, rateLimit } from "@/lib/server/http";
import { radarFor } from "@/lib/server/guardian";

export const dynamic = "force-dynamic";
const PolicyZ = z.object({ id: z.string().max(40), kind: z.enum(["hf-below", "drawdown-below", "gap-hf-below", "oracle-stale-hours", "radar-at-least"]), threshold: z.number().finite(), enabled: z.boolean(), mode: z.literal("monitor") });
const B = z.object({ addresses: z.array(z.string().refine((a) => isAddress(a, { strict: false }))).min(1).max(5), policies: z.array(PolicyZ).max(20).optional() });

/** Risk radar + monitor-only alert evaluation. Policies can only be "monitor" — no action mode exists. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "guardian-radar", 12);
  if (limited) return limited;
  const p = B.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: { code: "BAD_REQUEST", message: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, { status: 400 });
  const policies = p.data.policies ?? DEFAULT_POLICIES;
  const results = await Promise.all(p.data.addresses.map((a) => radarFor(a, policies).then((r) => ({ status: "ok" as const, ...r })).catch((e) => ({ status: "unavailable" as const, address: a, reason: (e as Error).message.slice(0, 200) }))));
  return json({ evaluatedAt: new Date().toISOString(), mode: "monitor-only", results });
}
