"use client";

import { useQuery } from "@tanstack/react-query";
import type { Capability } from "@veydara/domain";
import { getJson, type CapabilitiesResponse } from "@/lib/client/api";
import { CapabilityBadge } from "./badge";

/** Capability list for a pillar, straight from the backend resolver. */
export function PillarStatus({ pillar, filter }: { pillar: Capability["pillar"]; filter?: (c: Capability) => boolean }) {
  const q = useQuery({ queryKey: ["capabilities"], queryFn: () => getJson<CapabilitiesResponse>("/api/capabilities"), staleTime: 60_000 });
  const rows = q.data?.capabilities.filter((c) => c.pillar === pillar && (!filter || filter(c))) ?? [];
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="eyebrow">Backend capability status</p>
        <span className="text-[11px] text-faint">{q.data ? `checked ${new Date(q.data.generatedAt).toLocaleTimeString()}` : q.isLoading ? "checking…" : ""}</span>
      </div>
      <ul className="divide-y divide-line-soft">
        {rows.map((c) => (
          <li key={c.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[13px]">{c.label}</p>
              <p className="text-[11.5px] leading-4 text-faint">{c.reason}{c.unlock ? ` Unlock: ${c.unlock}` : ""}</p>
            </div>
            <CapabilityBadge status={c.status} />
          </li>
        ))}
        {q.data && rows.length === 0 && <li className="px-5 py-3 text-xs text-faint">No capabilities registered.</li>}
      </ul>
    </section>
  );
}

export function Roadmap({ items }: { items: { phase: string; text: string }[] }) {
  return (
    <section className="card p-5">
      <p className="eyebrow mb-3">Build order (from docs/PRODUCT-FEATURE-MATRIX.md)</p>
      <ol className="space-y-2 text-[12.5px]">
        {items.map((i) => (
          <li key={i.text} className="flex gap-3">
            <span className="w-16 shrink-0 font-mono text-[11px] text-faint">{i.phase}</span>
            <span className="text-muted">{i.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
