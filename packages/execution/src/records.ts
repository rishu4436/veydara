/** Proof Center records for fork executions — JSON on local disk (gitignored), plus committed evidence fixtures. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionRecord } from "./pipeline";

export function saveRecord(dir: string, rec: ExecutionRecord): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${rec.createdAt.replace(/[:.]/g, "-")}-${rec.id.slice(0, 10)}.fork.json`);
  if (!rec.stages.some((s) => s.id === "proof")) rec.stages.push({ id: "proof", status: "pass", ms: 0, detail: `record ${rec.id.slice(0, 8)} written for the Proof Center (${rec.outcome})` });
  writeFileSync(file, JSON.stringify(rec, null, 2));
  return file;
}

export function listRecords(...dirs: string[]): ExecutionRecord[] {
  const out: ExecutionRecord[] = [];
  for (const d of dirs) {
    let names: string[] = [];
    try {
      names = readdirSync(d).filter((n) => n.endsWith(".fork.json"));
    } catch {
      continue;
    }
    for (const n of names) {
      try {
        const r = JSON.parse(readFileSync(join(d, n), "utf8")) as ExecutionRecord;
        if (r.kind === "fork-execution") out.push(r);
      } catch {
        /* skip malformed */
      }
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
