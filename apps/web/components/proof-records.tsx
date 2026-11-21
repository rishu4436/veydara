"use client";

import { useQuery } from "@tanstack/react-query";
import type { ExecutionRecord } from "@veydara/execution";
import { getJson } from "@/lib/client/api";
import { RecordCard } from "./fork-ui";

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
