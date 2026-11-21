"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { POLICY_KINDS, type Alert, type Policy, type Radar, type RadarAxis, type RadarInput } from "@veydara/protocols";
import { getJson, shortAddr } from "@/lib/client/api";
import { guardian, useGuardian } from "@/lib/client/guardian-store";
import type { PositionAnalysis } from "@/lib/server/aave";
import { fmtHf, hfTone } from "@/lib/client/fmt";
import { CapabilityBadge } from "./badge";
import { Panel } from "./analysis";

type RadarOk = { status: "ok"; address: string; blockNumber: string; source: string; hasPosition: boolean; hfMatchesSpoke: boolean; session: { status: string; reason: string }; oracleNote: string; input: RadarInput; radar: Radar; alerts: Alert[] };
type RadarResp = { evaluatedAt: string; mode: string; results: (RadarOk | { status: "unavailable"; address: string; reason: string })[] };

const LEVEL: Record<RadarAxis["level"], string> = { none: "text-faint", low: "text-mint", elevated: "text-ice", high: "text-amber", critical: "text-danger" };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as T & { error?: { code: string; message: string } };
  if (!r.ok) throw new Error(j?.error ? `${j.error.code}: ${j.error.message}` : `HTTP ${r.status}`);
  return j;
}

/* ---------------------------------- Radar ---------------------------------- */
export function RadarChart({ radar, size = 240 }: { radar: Radar; size?: number }) {
  const n = radar.axes.length;
  const c = size / 2;
  const R = c - 34;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const;
  };
  const poly = radar.axes.map((ax, i) => pt(i, Math.max(0.04, ax.score / 100)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Risk radar, overall ${radar.overall} (${radar.score}/100)`}>
      {[0.25, 0.5, 0.75, 1].map((r) => <polygon key={r} points={radar.axes.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="currentColor" className="text-line" />)}
      {radar.axes.map((ax, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={ax.id}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="currentColor" className="text-line-soft" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-current text-[9px] text-faint">{ax.label.split(" ")[0]}</text>
          </g>
        );
      })}
      <polygon points={poly} className={radar.overall === "critical" ? "fill-danger/25 stroke-danger" : radar.overall === "high" ? "fill-amber/25 stroke-amber" : "fill-mint/20 stroke-mint"} strokeWidth={1.5} />
    </svg>
  );
}

export function RadarCard({ r }: { r: RadarOk }) {
  return (
    <Panel title={`Risk radar · ${shortAddr(r.address)}`} badge={<CapabilityBadge status={r.source === "fixture" ? "read-only" : "live-verified"} title={r.source === "fixture" ? "FIXTURE dataset" : `Base block ${r.blockNumber}`} />}>
      {!r.hasPosition ? (
        <p className="text-[13px] text-muted">No Aave V4 MAG7 position at block {r.blockNumber}. Nothing to monitor.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="flex flex-col items-center">
            <RadarChart radar={r.radar} />
            <p className={`mt-1 text-[13px] font-medium uppercase tracking-wider ${LEVEL[r.radar.overall]}`}>{r.radar.overall} · {r.radar.score}/100</p>
          </div>
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1 text-left font-medium">Axis</th><th className="text-right font-medium">Value</th><th className="text-right font-medium">Score</th><th className="pl-3 text-left font-medium">Why</th></tr></thead>
            <tbody>
              {r.radar.axes.map((a) => (
                <tr key={a.id} className="border-t border-line-soft align-top">
                  <td className="py-1.5">{a.label}</td>
                  <td className="num text-right">{a.value}</td>
                  <td className={`num text-right ${LEVEL[a.level]}`}>{a.score}</td>
                  <td className="pl-3 text-[11px] text-faint">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-faint">Block {r.blockNumber} · market {r.session.status} ({r.session.reason}) · {r.oracleNote} · VEYDARA HF {r.hfMatchesSpoke ? "matches" : "DOES NOT match"} the Spoke. Thresholds: docs/FINANCIAL-MODELS.md §Guardian.</p>
    </Panel>
  );
}

/* ------------------------------- Alert center ------------------------------- */
export function AlertCenter({ addresses }: { addresses: string[] }) {
  const g = useGuardian();
  const [auto, setAuto] = useState(false);
  const ev = useMutation({
    mutationFn: () => postJson<RadarResp>("/api/guardian/radar", { addresses, policies: g.policies }),
    onSuccess: (d) => guardian.ingest(d.results.filter((r): r is RadarOk => r.status === "ok").map((r) => r.address), d.results.flatMap((r) => (r.status === "ok" ? r.alerts : []))),
  });
  const { mutate } = ev;
  useEffect(() => {
    if (!auto || !addresses.length) return;
    const t = setInterval(() => mutate(), 60_000);
    return () => clearInterval(t);
  }, [auto, addresses, mutate]);
  const setP = (id: string, patch: Partial<Policy>) => guardian.setPolicies(g.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const active = g.inbox.filter((a) => a.active);
  return (
    <Panel title="Alert center" badge={<span className="rounded-full border border-ice/40 bg-ice/10 px-2 py-0.5 text-[11px] text-ice">Monitor-only</span>}>
      <p className="text-[12px] text-muted">Policies are evaluated in this browser against block-pinned reads. An alert never triggers an action: there is no automated mode, and execution is only possible on the local fork with explicit confirmation.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1 text-left font-medium">On</th><th className="text-left font-medium">Policy</th><th className="text-left font-medium">Threshold</th><th className="text-left font-medium">Mode</th></tr></thead>
          <tbody>
            {g.policies.map((p) => (
              <tr key={p.id} className="border-t border-line-soft">
                <td className="py-1.5"><input type="checkbox" aria-label={`Enable ${POLICY_KINDS[p.kind].label}`} checked={p.enabled} onChange={(e) => setP(p.id, { enabled: e.target.checked })} /></td>
                <td title={POLICY_KINDS[p.kind].help}>{POLICY_KINDS[p.kind].label}</td>
                <td><input aria-label={`Threshold for ${POLICY_KINDS[p.kind].label}`} type="number" step="0.01" value={p.threshold} onChange={(e) => setP(p.id, { threshold: Number(e.target.value) })} className="w-20 rounded border border-line bg-transparent px-1.5 py-0.5 text-right" /> <span className="text-faint">{POLICY_KINDS[p.kind].unit}</span></td>
                <td className="text-faint">monitor</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
        <button type="button" disabled={!addresses.length || ev.isPending} onClick={() => ev.mutate()} className="rounded-lg border border-ice/50 px-3 py-1.5 text-ice disabled:opacity-40">{ev.isPending ? "Evaluating…" : "Evaluate now"}</button>
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> re-evaluate every 60 s while this page is open</label>
        <button type="button" onClick={() => guardian.resetPolicies()} className="text-faint underline">reset policies</button>
        {ev.data && <span className="text-faint">evaluated {new Date(ev.data.evaluatedAt).toLocaleTimeString()}</span>}
        {ev.error && <span className="text-danger">{(ev.error as Error).message}</span>}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between"><p className="eyebrow">Inbox · {active.length} active</p>{g.inbox.some((a) => !a.active) && <button type="button" onClick={() => guardian.clearResolved()} className="text-[11px] text-faint underline">clear resolved</button>}</div>
        {g.inbox.length === 0 ? <p className="mt-2 text-[12px] text-faint">No alerts yet. Evaluate to check your watched positions.</p> : (
          <ul className="mt-2 space-y-2" aria-label="Alerts">
            {g.inbox.map((a) => (
              <li key={a.key} className={`rounded-xl border px-3 py-2 text-[12px] ${!a.active ? "border-line opacity-60" : a.severity === "critical" ? "border-danger/50 bg-danger/5" : "border-amber/40 bg-amber/5"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{a.title} <span className="font-mono text-[11px] text-faint">{shortAddr(a.address)}</span></p>
                  <span className="text-[10.5px] uppercase tracking-wider text-faint">{a.active ? a.severity : "resolved"} · {a.action}</span>
                </div>
                <p className="text-faint">{a.detail} Observed {a.observed} vs threshold {a.threshold} at block {a.blockNumber}. First seen {new Date(a.firstSeen).toLocaleString()}, last {new Date(a.lastSeen).toLocaleTimeString()}.</p>
                {!a.acked && a.active && <button type="button" onClick={() => guardian.ack(a.key)} className="mt-1 text-[11px] text-ice underline">acknowledge</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------ Emergency center ------------------------------ */
type Inspect = { status: "ok"; owner: string; blockNumber: string; allowances: { token: string; symbol: string; spender: string; spenderLabel: string; discoveredBy: string; raw: string; unlimited: boolean; formatted: string }[]; positionManagers: { name: string; address: string; approvedByUser: boolean | null; activeOnSpoke: boolean | null }[]; coverage: { tokens: string[]; knownSpenders: number; discoveredSpenders: number; approvalLogBlocks: string; scanError: string | null } } | { status: "unavailable"; reason: string };
type SimOk = { label: "FORK"; fork: { forkBlockNumber: string; upstreamHost: string; chainId: number }; ok: boolean; gasUsed: string | null; forkTxHash: string | null; revert: { message: string } | null; check: { name: string; before: string; after: string; pass: boolean } | null; snapshotReverted: boolean };
type Revoke = { tx: { from: string; to: string; data: string; value: string; chainIdForYourWallet: number }; preview: string; simulation: SimOk | { unavailable: string } };

function RevokeResult({ r }: { r: Revoke }) {
  const s = r.simulation;
  return (
    <div className="mt-2 rounded-xl border border-violet/40 bg-violet/5 p-3 text-[11.5px]">
      <p className="font-medium">{r.preview}</p>
      {"unavailable" in s ? (
        <p className="mt-1 text-muted">Fork simulation unavailable: {s.unavailable}</p>
      ) : (
        <p className="mt-1">
          <span className="rounded bg-violet/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet">FORK</span>{" "}
          {s.ok ? "Simulated successfully" : `Reverted: ${s.revert?.message}`} on anvil chain {s.fork.chainId} (Base block {s.fork.forkBlockNumber}){s.check ? ` · ${s.check.name}: ${s.check.before} → ${s.check.after} ${s.check.pass ? "✓" : "✗"}` : ""} · gas {s.gasUsed ?? "—"} · snapshot {s.snapshotReverted ? "reverted (no lasting change)" : "NOT reverted"}.
        </p>
      )}
      <details className="mt-1"><summary className="cursor-pointer text-faint">Unsigned transaction for your own wallet (Base, chain 8453)</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10.5px] text-muted">{JSON.stringify(r.tx, null, 2)}</pre></details>
      <p className="mt-1 text-faint">VEYDARA does not sign or send this. To revoke for real, review it in your own wallet.</p>
    </div>
  );
}

export function EmergencyCenter({ address }: { address: string }) {
  const pos = useQuery({ queryKey: ["aave-position", address], queryFn: () => getJson<PositionAnalysis>(`/api/aave/position?address=${address}`), staleTime: 30_000 });
  const al = useQuery({ queryKey: ["allowances", address], queryFn: () => getJson<Inspect>(`/api/guardian/allowances?address=${address}`), staleTime: 60_000 });
  const [res, setRes] = useState<Record<string, Revoke | string>>({});
  const prep = useMutation({
    mutationFn: async (v: { key: string; body: unknown }) => ({ key: v.key, r: await postJson<Revoke>("/api/guardian/revoke-prepare", v.body) }),
    onSuccess: ({ key, r }) => setRes((m) => ({ ...m, [key]: r })),
    onError: (e, v) => setRes((m) => ({ ...m, [v.key]: (e as Error).message })),
  });
  const p = pos.data;
  const d = al.data;
  const show = (key: string) => {
    const x = res[key];
    return x === undefined ? null : typeof x === "string" ? <p className="mt-1 text-[11px] text-danger">{x}</p> : <RevokeResult r={x} />;
  };
  return (
    <Panel title={`Emergency center · ${shortAddr(address)}`} badge={<span className="rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 text-[11px] text-violet">Revoke prep: fork only</span>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Position (Aave V4 MAG7)</p>
          {pos.isLoading ? <div className="h-20 animate-pulse rounded-xl bg-raised" /> : pos.error ? <p className="text-[12px] text-danger">{(pos.error as Error).message}</p> : p && (
            <div className="text-[12px]">
              <p>Health factor <span className={`num ${hfTone(p.position.account.healthFactorWad)}`}>{fmtHf(p.position.account.healthFactorWad)}</span> at block {p.market.blockNumber}</p>
              <ul className="mt-1 text-muted">
                {p.collateral.map((c) => <li key={c.reserveId}>Collateral: {c.formatted} {c.symbol} {c.liquidationPriceUsd ? `(liquidates ≤ $${c.liquidationPriceUsd})` : ""}</li>)}
                {p.debt.map((x) => <li key={x.reserveId}>Debt: {x.formatted} {x.symbol}</li>)}
                {!p.hasPosition && <li>No position.</li>}
              </ul>
            </div>
          )}
          <p className="eyebrow mb-2 mt-4">Position managers (can act on your Spoke position)</p>
          {d?.status === "ok" ? (
            <ul className="space-y-1 text-[12px]">
              {d.positionManagers.map((m) => (
                <li key={m.address}>
                  <span className={m.approvedByUser ? "text-amber" : "text-muted"}>{m.approvedByUser ? "● approved" : "○ not approved"}</span> {m.name} <span className="font-mono text-[10.5px] text-faint">{shortAddr(m.address)}</span>{m.activeOnSpoke === false ? <span className="text-faint"> (inactive on Spoke)</span> : null}
                  {m.approvedByUser && <button type="button" className="ml-2 text-[11px] text-violet underline" onClick={() => prep.mutate({ key: `pm:${m.address}`, body: { kind: "positionManager", owner: address, positionManager: m.address } })}>prepare removal (fork sim)</button>}
                  {show(`pm:${m.address}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <p className="eyebrow mb-2">Token allowances (MAG7 tokens + USDC)</p>
          {al.isLoading ? <div className="h-20 animate-pulse rounded-xl bg-raised" /> : d?.status === "unavailable" ? <p className="text-[12px] text-muted">Unavailable · {d.reason}</p> : d?.status === "ok" && (
            <>
              {d.allowances.length === 0 ? <p className="text-[12px] text-muted">No non-zero allowances to known Aave V4 spenders or spenders found in this owner&apos;s Approval logs.</p> : (
                <ul className="space-y-2 text-[12px]">
                  {d.allowances.map((a) => {
                    const key = `al:${a.token}:${a.spender}`;
                    return (
                      <li key={key} className="rounded-lg border border-line-soft px-2 py-1.5">
                        <p><span className={a.unlimited ? "text-amber" : ""}>{a.formatted}</span> {a.symbol} → {a.spenderLabel} <span className="font-mono text-[10.5px] text-faint">{shortAddr(a.spender)}</span></p>
                        <button type="button" className="text-[11px] text-violet underline" onClick={() => prep.mutate({ key, body: { kind: "allowance", owner: address, token: a.token, spender: a.spender } })}>prepare revoke (fork sim)</button>
                        {show(key)}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-faint">Coverage: {d.coverage.tokens.length} tokens × {d.coverage.knownSpenders} address-book spenders + {d.coverage.discoveredSpenders} discovered from Approval logs in blocks {d.coverage.approvalLogBlocks}{d.coverage.scanError ? ` (log scan failed: ${d.coverage.scanError})` : ""}. Allowances to other tokens are not shown.</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function useRadar(addresses: string[], policies: Policy[]) {
  const key = useMemo(() => addresses.join(","), [addresses]);
  return useQuery({ queryKey: ["radar", key, JSON.stringify(policies)], queryFn: () => postJson<RadarResp>("/api/guardian/radar", { addresses, policies }), enabled: addresses.length > 0, staleTime: 30_000 });
}
export type { RadarOk, RadarResp };
