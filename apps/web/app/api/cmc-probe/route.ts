import { readFile } from "node:fs/promises";
import path from "node:path";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The recorded endpoint-access probe (scripts/probe-cmc-plan.mjs). Contains no key material. */
export async function GET() {
  for (const p of [path.join(process.cwd(), "fixtures/cmc/plan-probe.live.json"), path.join(process.cwd(), "../../fixtures/cmc/plan-probe.live.json")]) {
    try {
      return json(JSON.parse(await readFile(p, "utf8")));
    } catch {
      /* try next */
    }
  }
  return json({ status: "unavailable", reason: "No probe recording found; run node scripts/probe-cmc-plan.mjs --save" });
}
