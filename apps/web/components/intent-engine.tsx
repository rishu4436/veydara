"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { IntentResponse } from "@/lib/server/intent";
import { authFetch } from "@/lib/client/auth-fetch";
import { Panel } from "./analysis";

const PRESET_IDS: { id: string; label: string }[] = [
  { id: "fortress", label: "Fortress" },
  { id: "gap-proof", label: "Gap-proof" },
  { id: "balanced", label: "Balanced" },
  { id: "policy-floor", label: "Policy floor" },
  { id: "protect", label: "Protect" },
];
const EXAMPLE = "Borrow max USDC against my NVDA, survive a 30% drop, APR under 12% for 3 months";
const FIELD_LABEL: Record<string, string> = { goal: "Goal", borrowAsset: "Borrow asset", borrowAmountUsd: "Borrow amount (USD)", collateral: "Collateral (new supply limited to)", minHealthFactor: "Min health factor", survivesDropPct: "Survive uniform drop", gapPct: "Monday gap", maxAprPct: "Max APR", horizonDays: "Horizon (days)" };

const fmt = (k: string, v: unknown) => (v === null ? (k === "borrowAmountUsd" ? "max allowed" : "—") : Array.isArray(v) ? (v.length ? v.join(", ") : "any eligible") : k.endsWith("Pct") ? `${v}%` : String(v));

export function IntentEngine({ address }: { address: string }) {
  const [text, setText] = useState(EXAMPLE);
  const [preset, setPreset] = useState<string | undefined>(undefined);
  const run = useMutation({ mutationFn: () => authFetch<IntentResponse>("/api/intent", { body: { address, text, preset } }) });
  const r = run.data;
  const sol = r?.solution;
  return (
    <Panel title="Capital Intent Engine" badge={<span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">deterministic parser · no LLM</span>}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Intent presets">
        {PRESET_IDS.map((p) => (
          <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(preset === p.id ? undefined : p.id)} className={`rounded-md border px-2 py-1 text-[11.5px] ${preset === p.id ? "border-ice/60 text-fg" : "border-line text-muted hover:text-fg"}`}>{p.label}</button>
        ))}
      </div>
      <textarea aria-label="Describe your goal" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} className="mt-3 w-full rounded-lg border border-line bg-transparent p-2 text-[13px]" />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className="rounded-lg border border-ice/50 px-3 py-1.5 text-[12.5px] text-ice disabled:opacity-40">{run.isPending ? "Parsing & solving…" : "Parse → constrain → solve"}</button>
        <span className="text-[11px] text-faint">Grammar-based parsing; out-of-range values are rejected, never clamped. Plans still pass the independent verifier.</span>
      </div>
      {run.error && <p role="alert" className="mt-2 text-[12px] text-danger">{(run.error as Error).message}</p>}
      {r && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Typed constraints {r.label === "FIXTURE" && <span className="text-amber">· fixture dataset</span>}</p>
            {r.parse.constraints ? (
              <table className="w-full text-[12px]" aria-label="Parsed constraints">
                <tbody>
                  {Object.entries(r.parse.constraints).map(([k, v]) => {
                    const t = r.parse.trace.find((x) => x.field === k);
                    return (
                      <tr key={k} className="border-b border-line/50">
                        <td className="py-1 pr-2 text-muted">{FIELD_LABEL[k] ?? k}</td>
                        <td className="num py-1 pr-2">{fmt(k, v)}</td>
                        <td className="py-1 text-[10.5px] text-faint">{t ? `“${t.span.trim()}”` : "default"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {r.parse.errors.length > 0 && <ul className="mt-2 space-y-0.5 text-[12px] text-danger" aria-label="Parse errors">{r.parse.errors.map((e) => <li key={e}>✗ {e}</li>)}</ul>}
            {r.parse.notes.map((n) => <p key={n} className="mt-2 text-[12px] text-amber">{n}</p>)}
            {r.parse.unrecognised.length > 0 && <p className="mt-2 text-[12px] text-amber">Not understood (ignored): {r.parse.unrecognised.map((u) => `“${u}”`).join(", ")}</p>}
            {sol && <p className="mt-3 text-[12.5px]">Effective target <span className="num font-medium">HF ≥ {sol.target.hf}</span> <span className="text-faint">— binding: {sol.target.binding}</span></p>}
            {sol?.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-amber">{n}</p>)}
          </div>
          <div>
            <p className="eyebrow mb-2">Outcome · block {r.blockNumber || "—"}</p>
            {sol ? (
              <>
                <p className={`text-[13px] font-medium ${sol.outcome === "solved" || sol.outcome === "protect-report" ? "text-mint" : "text-amber"}`} data-testid="intent-outcome">{sol.outcome}</p>
                <ul className="mt-1 space-y-1 text-[12.5px]">{sol.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
                {sol.protect && <ul className="mt-2 space-y-0.5 text-[12px]">{sol.protect.map((c) => <li key={c.name}><span className={c.pass ? "text-mint" : "text-danger"}>{c.pass ? "✓" : "✗"}</span> {c.name} <span className="text-faint">— {c.detail}</span></li>)}</ul>}
              </>
            ) : (
              <p className="text-[12.5px] text-amber">No solve: fix the parse errors first.</p>
            )}
            <p className="mt-2 text-[10.5px] text-faint">Explanation: deterministic template. An LLM is optional and explanatory only — {r.explainer.llm}.</p>
          </div>
          {sol && sol.plans.length > 0 && (
            <div className="lg:col-span-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12px]" aria-label="Constrained solver arena">
                <thead className="text-left text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1">Solver</th><th>Borrow USDC</th><th>HF after (independent)</th><th>APR</th><th>Interest / horizon</th><th>Verifier</th><th>Constraints</th></tr></thead>
                <tbody>
                  {sol.plans.map((p) => (
                    <tr key={p.plan.solver} className={`border-t border-line/50 align-top ${sol.chosen === p.plan.solver ? "bg-mint/5" : ""}`}>
                      <td className="py-1.5 pr-2"><span className="font-medium">{p.plan.solver}</span>{sol.chosen === p.plan.solver && <span className="ml-1 rounded border border-mint/40 px-1 text-[10px] text-mint">chosen</span>}<div className="text-[10.5px] text-faint">{p.plan.thesis}</div></td>
                      <td className="num">{p.borrowFormatted}</td>
                      <td className="num">{p.verdict.hfIndependent ? (Number(BigInt(p.verdict.hfIndependent) / 10n ** 14n) / 10_000).toFixed(4) : "∞"}</td>
                      <td className="num">{(Number(p.plan.aprBps) / 100).toFixed(2)}%</td>
                      <td className="num">{p.interestFormatted}</td>
                      <td className={p.verdict.accepted ? "text-mint" : "text-danger"}>{p.verdict.accepted ? "Verified" : "Rejected"}</td>
                      <td><ul>{p.constraintChecks.map((c) => <li key={c.name} title={c.detail}><span className={c.pass ? "text-mint" : "text-danger"}>{c.pass ? "✓" : "✗"}</span> {c.name}</li>)}</ul></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
