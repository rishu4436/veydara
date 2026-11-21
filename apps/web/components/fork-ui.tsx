"use client";

import type { ExecutionRecord, Stage } from "@veydara/execution";
import { AAVE_V4_BASE_FEEDS } from "@veydara/protocols";
import { shortAddr } from "@/lib/client/api";
import { fmtHf, units } from "@/lib/client/fmt";

export function ForkTag({ className = "" }: { className?: string }) {
  return <span className={`inline-flex items-center rounded bg-violet/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-violet ${className}`}>FORK</span>;
}

const STAGE_LABEL: Record<Stage["id"], string> = {
  "fork-guard": "Fork guard", validate: "Validate", "fresh-state": "Fresh state", route: "Typed route", verifier: "Verifier", simulation: "Simulation", preview: "Preview",
  "freshness-recheck": "Freshness re-check", signing: "Signing", sending: "Sending", receipts: "Receipts", reconcile: "Reconcile", proof: "Proof record",
};

export function StageList({ stages }: { stages: Stage[] }) {
  return (
    <ol className="space-y-1 text-[12px]" aria-label="Pipeline stages">
      {stages.map((s, i) => (
        <li key={`${s.id}-${i}`} className="grid grid-cols-[18px_130px_1fr] gap-2">
          <span aria-hidden className={s.status === "pass" ? "text-mint" : s.status === "fail" ? "text-danger" : "text-faint"}>{s.status === "pass" ? "✓" : s.status === "fail" ? "✗" : "–"}</span>
          <span className={s.status === "fail" ? "text-danger" : ""}>{STAGE_LABEL[s.id]}<span className="sr-only"> {s.status}</span></span>
          <span className="break-words text-faint">{s.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function PositionDiff({ rec }: { rec: Pick<ExecutionRecord, "before" | "after"> }) {
  const ids = [...new Set([...(rec.before?.reserves ?? []), ...(rec.after?.reserves ?? [])].map((r) => r.reserveId))];
  if (!rec.before) return null;
  const row = (id: number, which: "before" | "after") => rec[which]?.reserves.find((r) => r.reserveId === id);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[12px]">
        <thead className="text-[10.5px] uppercase tracking-wider text-faint">
          <tr><th className="py-1 text-left font-medium">Reserve</th><th className="text-right font-medium">Supplied before → after</th><th className="text-right font-medium">Debt before → after</th><th className="text-right font-medium">Wallet before → after</th><th className="text-right font-medium">Collateral</th></tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const b = row(id, "before");
            const a = row(id, "after");
            const d = (b ?? a)!.decimals;
            const f = (x: string | undefined) => (x === undefined ? "—" : units(x, d, 4));
            return (
              <tr key={id} className="border-t border-line-soft">
                <td className="py-1.5">{(b ?? a)!.symbol}</td>
                <td className="num text-right">{f(b?.supplied)} → {f(a?.supplied)}</td>
                <td className="num text-right">{f(b?.debt)} → {f(a?.debt)}</td>
                <td className="num text-right">{f(b?.wallet)} → {f(a?.wallet)}</td>
                <td className="text-right">{b?.collateralEnabled ? "on" : "off"} → {a ? (a.collateralEnabled ? "on" : "off") : "—"}</td>
              </tr>
            );
          })}
          <tr className="border-t border-line">
            <td className="py-1.5">Health factor (Spoke)</td>
            <td colSpan={4} className="num text-right">{fmtHf(rec.before.healthFactorWad)} → {rec.after ? fmtHf(rec.after.healthFactorWad) : "—"}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-faint">Read on the fork at blocks {rec.before.blockNumber} → {rec.after?.blockNumber ?? "—"}.</p>
    </div>
  );
}

export function TxTable({ txs }: { txs: ExecutionRecord["txs"] }) {
  if (!txs.length) return <p className="text-[12px] text-faint">No transactions were signed or sent.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[12px]">
        <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1 text-left font-medium">#</th><th className="text-left font-medium">Step</th><th className="text-left font-medium">Fork tx hash</th><th className="text-right font-medium">Block</th><th className="text-right font-medium">Gas</th><th className="text-left pl-3 font-medium">Status</th></tr></thead>
        <tbody>
          {txs.map((t) => (
            <tr key={t.stepIndex} className="border-t border-line-soft align-top">
              <td className="py-1.5">{t.stepIndex + 1}</td>
              <td>{t.kind}</td>
              <td className="font-mono text-[11px]"><ForkTag className="mr-1" />{t.hash ? <span title={t.hash} data-testid="fork-tx-hash">{t.hash}</span> : "not sent"}</td>
              <td className="num text-right">{t.blockNumber ?? "—"}</td>
              <td className="num text-right">{t.gasUsed ?? "—"}</td>
              <td className={`pl-3 ${t.status === "success" ? "text-mint" : "text-danger"}`}>{t.status}{t.revert ? ` — ${t.revert.message}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fundLabel(token: string, amount: string) {
  const sym = Object.entries(AAVE_V4_BASE_FEEDS).find(([, v]) => v.asset.toLowerCase() === token.toLowerCase())?.[0];
  return sym ? `${units(amount, sym === "USDC" ? 6 : 8, 8)} ${sym}` : `${amount} base units of ${shortAddr(token)}`;
}

const OUTCOME: Record<ExecutionRecord["outcome"], string> = { executed: "text-mint border-mint/40 bg-mint/10", reverted: "text-danger border-danger/40 bg-danger/10", blocked: "text-amber border-amber/40 bg-amber/10", incomplete: "text-amber border-amber/40 bg-amber/10" };

export function RecordCard({ rec, origin, open = false }: { rec: ExecutionRecord; origin?: string; open?: boolean }) {
  return (
    <article className="card p-5" aria-label={`Fork execution record ${rec.intent?.label ?? rec.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        <ForkTag />
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${OUTCOME[rec.outcome]}`}>{rec.outcome}</span>
        {rec.signer === "wallet" && <span className="rounded-full border border-ice/40 bg-ice/10 px-2 py-0.5 text-[11px] text-ice">signed by user wallet</span>}
        {rec.drill && <span className="rounded-full border border-danger/40 px-2 py-0.5 text-[11px] text-danger">intentional revert drill</span>}
        <h3 className="text-[13.5px] font-medium">{rec.intent?.label ?? "Fork execution"}</h3>
        {origin && <span className="ml-auto text-[11px] text-faint">{origin === "committed-evidence" ? "committed evidence (fixtures/fork)" : "local run"}</span>}
      </header>
      <p className="mt-1 text-[11.5px] text-faint">
        {new Date(rec.createdAt).toLocaleString()} · anvil chain {rec.fork?.chainId ?? "?"} · Base state forked at block {rec.fork?.forkBlockNumber ?? "?"} via {rec.fork?.upstreamHost ?? "?"} · {rec.signer === "wallet" ? "SIWE-proven user wallet" : "anvil test account"} {rec.account ? shortAddr(rec.account) : "—"} · {rec.outcomeDetail}
      </p>
      {rec.funding.length > 0 && (
        <p className="mt-1 text-[11.5px] text-faint">Fork funding: {rec.funding.map((f) => `${fundLabel(f.token, f.amount)} from existing holder ${shortAddr(f.donor)} (${f.donorKind}) by impersonation — tx ${shortAddr(f.txHash, 6)}`).join("; ")}</p>
      )}
      <div className="mt-3"><TxTable txs={rec.txs} /></div>
      <details className="mt-3" open={open}>
        <summary className="cursor-pointer text-[12px] text-ice">Pipeline, positions and reconciliation</summary>
        <div className="mt-3 grid gap-4">
          <StageList stages={rec.stages} />
          <PositionDiff rec={rec} />
          {rec.reconciliation && (
            <ul className="space-y-0.5 text-[11.5px]">
              {rec.reconciliation.checks.map((c) => <li key={c.name}><span className={c.pass ? "text-mint" : "text-danger"}>{c.pass ? "✓" : "✗"}</span> {c.name} <span className="text-faint">— {c.detail}</span></li>)}
            </ul>
          )}
          {rec.verdict && !rec.verdict.accepted && (
            <ul className="space-y-0.5 text-[11.5px]">
              {rec.verdict.checks.filter((c) => !c.pass).map((c) => <li key={c.name}><span className="text-danger">✗</span> {c.name} <span className="text-faint">— {c.detail}</span></li>)}
            </ul>
          )}
          <p className="text-[11px] text-faint">ABI: aave/aave-v4 @ {rec.sources.abi.commit.slice(0, 8)} · addresses: Aave address book · preview hash {rec.preview?.previewHash.slice(0, 18) ?? "—"}…</p>
        </div>
      </details>
    </article>
  );
}
