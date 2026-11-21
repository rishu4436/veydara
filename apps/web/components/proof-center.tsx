"use client";

import { useQuery } from "@tanstack/react-query";
import type { LedgerEntry, LedgerSummary } from "@veydara/cmc";
import { getJson, type CapabilitiesResponse } from "@/lib/client/api";
import { CapabilityBadge } from "./badge";

type LedgerResp = { mode: string; summary: LedgerSummary; entries: LedgerEntry[] };
type Probe = { _fixture?: { recordedAt: string }; keyInfo?: { plan: { credit_limit_monthly: number; rate_limit_minute: number } | null; notice: string | null }; probes?: { name: string; path: string; http: number; error_code: string | number | null; error_message: string | null; credit_count: number | null; accessible: boolean }[] };

function ProbeTable() {
  const q = useQuery({ queryKey: ["cmc-probe"], queryFn: () => getJson<Probe>("/api/cmc-probe"), staleTime: 3_600_000 });
  const d = q.data;
  if (!d?.probes) return null;
  return (
    <section className="card overflow-x-auto">
      <div className="border-b border-line px-5 py-3">
        <p className="eyebrow">CMC key access probe — recorded {d._fixture?.recordedAt ? new Date(d._fixture.recordedAt).toLocaleString() : ""}</p>
        <p className="mt-1 text-[11.5px] text-faint">
          /v1/key/info: monthly credit limit {d.keyInfo?.plan?.credit_limit_monthly ?? "?"}, {d.keyInfo?.plan?.rate_limit_minute ?? "?"} req/min. {d.keyInfo?.notice ? `CMC notice: “${d.keyInfo.notice}”` : ""}
        </p>
      </div>
      <table className="w-full min-w-[640px] text-left text-[12px]">
        <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr>{["Endpoint", "HTTP", "CMC code", "Message", "Credits", "Access"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {d.probes.map((p) => (
            <tr key={p.name} className="border-t border-line-soft">
              <td className="px-4 py-1.5 font-mono text-[11px]">{p.path}</td><td className="px-4">{p.http}</td><td className="px-4">{String(p.error_code ?? "")}</td>
              <td className="px-4 text-muted">{p.error_message ?? ""}</td><td className="px-4">{p.credit_count ?? "—"}</td>
              <td className="px-4">{p.accessible ? <span className="text-mint">yes</span> : <span className="text-danger">no</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ProofCenter() {
  const caps = useQuery({ queryKey: ["capabilities"], queryFn: () => getJson<CapabilitiesResponse>("/api/capabilities"), staleTime: 60_000 });
  const ledger = useQuery({ queryKey: ["ledger"], queryFn: () => getJson<LedgerResp>("/api/ledger"), refetchInterval: 15_000 });
  const s = ledger.data?.summary;
  return (
    <div className="space-y-6">
      <section className="card grid grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-5" aria-label="CMC credit summary">
        {[
          ["Upstream calls", s?.upstreamCalls],
          ["Credits (expected)", s?.expectedCredits],
          ["Credits (CMC reported)", s?.actualCredits],
          ["Cache hits", s?.cacheHits],
          ["Deduped / blocked", s ? `${s.dedupedCalls} / ${s.blockedCalls}` : undefined],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-surface p-4">
            <p className="eyebrow">{k}</p>
            <p className="num mt-1 text-[22px]">{v ?? "—"}</p>
          </div>
        ))}
      </section>

      <ProbeTable />
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="eyebrow">CMC API evidence — credit ledger (this server process)</p>
          <span className="text-[11px] text-faint">mode: {ledger.data?.mode ?? "…"}</span>
        </div>
        <table className="w-full min-w-[820px] text-left text-[12px]">
          <thead className="text-[10.5px] uppercase tracking-wider text-faint">
            <tr>
              {["Time", "Endpoint", "Mode", "Feature", "Outcome", "HTTP", "Expected", "Actual", "Error", "ms"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft font-mono text-[11.5px]">
            {ledger.data?.entries.map((e, i) => (
              <tr key={i}>
                <td className="px-4 py-1.5 text-faint">{new Date(e.at).toLocaleTimeString()}</td>
                <td className="px-4 py-1.5">{e.endpoint}</td>
                <td className="px-4 py-1.5 text-muted">{e.mode}</td>
                <td className="px-4 py-1.5 text-muted">{e.feature}</td>
                <td className={`px-4 py-1.5 ${e.outcome === "miss" ? "text-ice" : e.outcome === "hit" ? "text-mint" : "text-amber"}`}>{e.outcome}</td>
                <td className="px-4 py-1.5">{e.httpStatus ?? ""}</td>
                <td className="px-4 py-1.5">{e.outcome === "miss" ? e.expectedCredits : ""}</td>
                <td className="px-4 py-1.5">{e.actualCredits ?? ""}</td>
                <td className="px-4 py-1.5 text-danger">{e.errorCode ?? ""}</td>
                <td className="px-4 py-1.5 text-faint">{e.latencyMs ?? ""}</td>
              </tr>
            ))}
            {ledger.data && ledger.data.entries.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-4 font-sans text-faint">No CMC calls yet in this server session. Connect or watch a wallet, or open an asset — the ledger fills as real calls happen.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3"><p className="eyebrow">Capability matrix (backend-computed)</p></div>
        <ul className="divide-y divide-line-soft">
          {caps.data?.capabilities.map((c) => (
            <li key={c.id} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[110px_1fr_auto] sm:items-center">
              <span className="font-mono text-[10.5px] uppercase text-faint">{c.pillar}</span>
              <div>
                <p className="text-[13px]">{c.label}</p>
                <p className="text-[11.5px] text-faint">{c.reason}{c.evidence ? ` · evidence: ${c.evidence}` : ""}</p>
              </div>
              <CapabilityBadge status={c.status} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5 text-[12.5px] text-muted">
        <p className="eyebrow mb-2">Sources & claims</p>
        <p>Contract addresses, CMC endpoint shapes and plan limits are documented with retrieval dates in <a className="text-ice" href="https://github.com/rishu4436/veydara/blob/main/docs/SOURCES-AND-CLAIMS.md" target="_blank" rel="noreferrer noopener">docs/SOURCES-AND-CLAIMS.md</a>.</p>
      </section>
    </div>
  );
}
