"use client";

import { useQuery } from "@tanstack/react-query";
import type { ExecutionRecord } from "@veydara/execution";
import { getJson } from "@/lib/client/api";
import { RecordCard } from "./fork-ui";

type IntentRow = { id: string; label: string; outcome: string; account: string | null; createdAt: string; record: { parse: { constraints: Record<string, unknown> | null }; solution: { chosen: string | null; target: { hf: number; binding: string } } | null; blockNumber: string } };

export function IntentRecords() {
  const q = useQuery({ queryKey: ["proof-records"], queryFn: () => getJson<{ records: unknown[]; intents: IntentRow[]; store: { kind: string; detail: string } }>("/api/proof/records"), staleTime: 15_000 });
  const rows = q.data?.intents ?? [];
  return (
    <section className="space-y-3" aria-label="Intent solves">
      <div>
        <h2 className="eyebrow">Intent solves</h2>
        <p className="mt-1 text-[12px] text-faint">Capital Intent Engine runs: the typed constraints, the effective target and the chosen plan. Read-only analysis; nothing was signed. Store: {q.data?.store.kind ?? "…"}.</p>
      </div>
      {q.data && rows.length === 0 && <p className="card p-5 text-[12.5px] text-muted">No intent solves recorded yet.</p>}
      {rows.length > 0 && (
        <ul className="card divide-y divide-line/50 text-[12px]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] text-muted">{r.label}</span>
              <span className={r.outcome === "solved" || r.outcome === "protect-report" ? "text-mint" : "text-amber"}>{r.outcome}</span>
              <span className="text-faint">{new Date(r.createdAt).toLocaleString()} · block {r.record.blockNumber || "—"}</span>
              {r.record.solution && <span>target HF ≥ {r.record.solution.target.hf} · chosen {r.record.solution.chosen ?? "none"}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ForkRecords() {
  const q = useQuery({ queryKey: ["proof-records"], queryFn: () => getJson<{ records: (ExecutionRecord & { origin: string })[] }>("/api/proof/records"), staleTime: 15_000 });
  const recs = q.data?.records ?? [];
  return (
    <section className="space-y-3" aria-label="Fork executions">
      <div>
        <h2 className="eyebrow">Fork executions</h2>
        <p className="mt-1 text-[12px] text-faint">Every run through the execution pipeline on a local anvil fork of Base (chain 31337) — executed, reverted or blocked. Hashes are fork transactions and do not exist on Base mainnet.</p>
      </div>
      {q.isLoading && <div className="card h-24 animate-pulse" />}
      {q.data && recs.length === 0 && <p className="card p-5 text-[12.5px] text-muted">No fork runs recorded yet.</p>}
      {recs.map((r) => <RecordCard key={`${r.origin}-${r.id}`} rec={r} origin={r.origin} />)}
    </section>
  );
}
