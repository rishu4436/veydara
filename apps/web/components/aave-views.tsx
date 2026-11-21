"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usEquitySession } from "@veydara/domain";
import type { AaveMarket } from "@veydara/protocols";
import type { ArenaResponse, PositionAnalysis } from "@/lib/server/aave";
import { getJson, shortAddr, fmtUsd } from "@/lib/client/api";
import { bpsPct, fmtHf, fmtNum, hfTone, rayPct, units } from "@/lib/client/fmt";
import { useVeydaraWallet } from "@/lib/client/wallet-context";
import { CapabilityBadge } from "./badge";
import { Panel } from "./analysis";
import { RiskClock } from "./risk-clock";

type ScenarioRow = PositionAnalysis["futures"][number];

/** Address source: ?address= → connected/watched Base wallet → user input. Recent on-chain borrowers offered as public examples. */
export function useAaveAddress(): [string | null, (a: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { active } = useVeydaraWallet();
  const fromUrl = sp.get("address");
  const addr = fromUrl ?? (active?.chain === "base" ? active.address : null);
  return [addr, (a: string) => router.replace(`${path}?address=${a}`)];
}

export function AddressBar({ value, onChange, note }: { value: string | null; onChange: (a: string) => void; note?: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const b = useQuery({ queryKey: ["aave-borrowers"], queryFn: () => getJson<{ status: string; borrowers?: { user: string; lastBorrowBlock: string; txHash: string }[]; reason?: string }>("/api/aave/borrowers"), staleTime: 10 * 60_000 });
  const valid = /^0x[0-9a-fA-F]{40}$/.test(v.trim());
  return (
    <section className="card p-5">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) onChange(v.trim()); }}>
        <label htmlFor="aave-addr" className="eyebrow mr-2">Base address</label>
        <input id="aave-addr" value={v} onChange={(e) => setV(e.target.value)} placeholder="0x…" spellCheck={false} className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 font-mono text-[12.5px]" />
        <button type="submit" disabled={!valid} className="rounded-lg border border-ice/50 px-3 py-1.5 text-[12.5px] text-ice disabled:opacity-40">Read</button>
      </form>
      {note && <p className="mt-2 text-[11.5px] text-faint">{note}</p>}
      {b.data?.status === "ok" && b.data.borrowers && b.data.borrowers.length > 0 && (
        <div className="mt-3 text-[11.5px]">
          <p className="text-faint">Public examples — recent borrowers from on-chain <code>Borrow</code> events on the MAG7 spoke (not affiliated, not endorsements):</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {b.data.borrowers.slice(0, 6).map((x) => (
              <button key={x.user} type="button" onClick={() => onChange(x.user)} className="rounded-md border border-line px-2 py-0.5 font-mono text-muted hover:text-fg" title={`last borrow block ${x.lastBorrowBlock}`}>{shortAddr(x.user)}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------- Positions ------------------------------- */
export function PositionView({ address }: { address: string }) {
  const q = useQuery({ queryKey: ["aave-position", address], queryFn: () => getJson<PositionAnalysis>(`/api/aave/position?address=${address}`), staleTime: 30_000 });
  if (q.isLoading) return <div className="card h-48 animate-pulse" aria-label="Reading position" />;
  if (q.error) return <p className="card p-5 text-sm text-danger">{(q.error as Error).message}</p>;
  const d = q.data!;
  if ("status" in d) return <p className="card p-5 text-sm text-muted">Unavailable: {(d as unknown as { reason: string }).reason}</p>;
  const acc = d.position.account;
  const session = usEquitySession(new Date());
  const gap = d.futures.filter((f) => ["gap10", "gap20"].includes(f.id)).map((f) => ({ label: f.label.replace("Monday ", ""), hf: fmtHf(f.healthFactorWad), tone: hfTone(f.healthFactorWad) }));
  if (!d.hasPosition) {
    return (
      <Panel title="Aave V4 position" badge={<CapabilityBadge status="live-verified" />}>
        <p className="text-[13px] text-muted">No supplied collateral and no debt on the Aave V4 MAG7 spoke for {shortAddr(d.position.user)} at block {d.position.blockNumber}. Nothing is shown because nothing exists — open the Solver Arena for what-if plans using eligible wallet holdings.</p>
      </Panel>
    );
  }
  return (
    <div className="space-y-6">
      <section className="card grid gap-5 p-5 md:grid-cols-4">
        <Kpi k="Health factor (Spoke)" v={<span className={hfTone(acc.healthFactorWad)}>{fmtHf(acc.healthFactorWad)}</span>} hint={d.veydara.matchesSpoke ? "VEYDARA bigint recomputation matches exactly ✓" : `VEYDARA: ${fmtHf(d.veydara.healthFactorWad)} (mismatch flagged)`} />
        <Kpi k="Drawdown to liquidation" v={d.veydara.drawdownToLiquidationBps ? bpsPct(d.veydara.drawdownToLiquidationBps) : "—"} hint="uniform fall of all collateral, debt fixed" />
        <Kpi k="Collateral (Spoke value)" v={fmtUsd(String(Number(BigInt(acc.totalCollateralValue) / 10n ** 20n) / 1e6))} hint={`avg CF ${(Number(BigInt(acc.avgCollateralFactorWad) / 10n ** 14n) / 100).toFixed(2)}%`} />
        <Kpi k="Borrow APR (USDC)" v={bpsPct(d.veydara.borrowAprBps.USDC ?? null)} hint={`risk premium ${bpsPct(acc.riskPremiumBps)}`} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Collateral & liquidation prices" badge={<CapabilityBadge status="live-verified" title={`block ${d.position.blockNumber}`} />}>
          <table className="w-full text-[12.5px]">
            <thead className="text-faint"><tr><th className="py-1 text-left">Asset</th><th className="text-right">Supplied</th><th className="text-right">Oracle</th><th className="text-right">Liquidation</th><th className="text-right">Distance</th></tr></thead>
            <tbody className="num">
              {d.collateral.map((c) => (
                <tr key={c.reserveId} className="border-t border-line-soft">
                  <td className="py-1.5">{c.symbol}</td><td className="text-right">{fmtNum(c.formatted.replace(/,/g, ""), 4)}</td><td className="text-right">{fmtUsd(c.priceUsd)}</td>
                  <td className="text-right">{c.liquidationPriceUsd ? fmtUsd(c.liquidationPriceUsd) : "—"}</td>
                  <td className={`text-right ${c.distancePct !== null && c.distancePct < 10 ? "text-amber" : ""}`}>{c.distancePct !== null ? `${c.distancePct.toFixed(2)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[12.5px]">
            {d.debt.map((x) => <p key={x.reserveId}>Debt: <span className="num">{fmtNum(x.formatted.replace(/,/g, ""), 2)} {x.symbol}</span></p>)}
            <p className="mt-1 text-muted">Extra USDC borrowable: {d.headroom.map((h) => `${fmtNum(h.formatted.replace(/,/g, ""), 2)} at HF ${h.atHf}`).join(" · ")}</p>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-faint">Single-asset liquidation price holds other collateral and debt prices constant; rounded up (conservative). Math mirrors Spoke._processUserAccountData (aave-v4@{d.sources.abi.commit.slice(0, 8)}).</p>
        </Panel>
        <Panel title="RWA Risk Clock" badge={<CapabilityBadge status="live-verified" title="Session calendar + live position" />}>
          <RiskClock session={session} oracleUpdatedAt={null} oracleAgeSec={null} gap={gap} />
        </Panel>
      </div>
      <FuturesTable rows={d.futures} />
    </div>
  );
}

function Kpi({ k, v, hint }: { k: string; v: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-faint">{k}</p>
      <p className="num mt-1 font-display text-[26px] leading-none">{v}</p>
      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

export function FuturesTable({ rows }: { rows: ScenarioRow[] }) {
  return (
    <Panel title="Parallel Futures" badge={<CapabilityBadge status="simulation" title="Deterministic scenarios on live state" />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[12.5px]">
          <thead className="text-faint"><tr><th className="py-1 text-left">Scenario</th><th className="text-left">Assumption</th><th className="text-right">Collateral</th><th className="text-right">Debt</th><th className="text-right">Health</th><th className="text-right">State</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line-soft align-top">
                <td className="py-1.5 pr-2">{r.label}</td>
                <td className="pr-2 text-[11.5px] text-muted">{r.assumption}</td>
                <td className="num text-right">{fmtUsd(r.collateralValueUsd, { compact: true })}</td>
                <td className="num text-right">{fmtUsd(r.debtValueUsd, { compact: true })}</td>
                <td className={`num text-right ${hfTone(r.healthFactorWad)}`}>{fmtHf(r.healthFactorWad)}</td>
                <td className="text-right text-[11.5px]">{r.status}{r.liquidationBonusBps ? ` · bonus ${bpsPct(Number(r.liquidationBonusBps) - 10_000)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-faint">Scenarios, not predictions. Shocks apply to Spoke oracle prices at the pinned block; liquidatable = HF &lt; 1.00, near-target = below the Spoke target HF 1.24.</p>
    </Panel>
  );
}

/* ------------------------------ Market table ------------------------------ */
export function MarketTable() {
  const q = useQuery({ queryKey: ["aave-market"], queryFn: () => getJson<{ market: AaveMarket; sources: PositionAnalysis["sources"] }>(`/api/aave/market`), staleTime: 30_000 });
  const m = q.data?.market;
  return (
    <Panel title="Aave V4 Equities Hub · MAG7 spoke reserves" badge={m ? <CapabilityBadge status="live-verified" title={`block ${m.blockNumber}`} /> : undefined}>
      {q.isLoading && <p className="text-[12.5px] text-muted">Reading reserves…</p>}
      {q.error && <p className="text-[12.5px] text-danger">{(q.error as Error).message}</p>}
      {m && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead className="text-faint"><tr><th className="py-1 text-left">Reserve</th><th className="text-right">Oracle</th><th className="text-right">CF</th><th className="text-right">Max bonus</th><th className="text-right">Supplied / cap</th><th className="text-right">Borrow</th><th className="text-right">State</th></tr></thead>
              <tbody className="num">
                {m.reserves.map((r) => (
                  <tr key={r.reserveId} className="border-t border-line-soft">
                    <td className="py-1.5 font-sans">{r.symbol ?? shortAddr(r.underlying)}</td>
                    <td className="text-right">{fmtUsd(units(r.price, m.oracleDecimals, 4).replace(/,/g, ""))}</td>
                    <td className="text-right">{r.collateralFactorBps ? bpsPct(r.collateralFactorBps, 0) : "—"}</td>
                    <td className="text-right">{r.collateralFactorBps ? bpsPct(r.maxLiquidationBonusBps - 10_000) : "—"}</td>
                    <td className="text-right">{units(r.suppliedAssets, r.decimals, 0)} / {r.addCapTokens === null ? "∞" : fmtNum(r.addCapTokens, 0)}</td>
                    <td className="text-right">{r.borrowable ? `${rayPct(r.drawnRateRay)} · liq ${units(r.hubLiquidity, r.decimals, 0)}` : "—"}</td>
                    <td className="text-right font-sans text-[11px]">{r.paused ? "paused" : r.frozen ? "frozen" : "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-faint">Spoke {shortAddr(m.spoke)} · Hub {shortAddr(m.hub)} · oracle {shortAddr(m.oracle)} at block {m.blockNumber}. Addresses: Aave address book @{q.data!.sources.addresses.commit.slice(0, 8)}; ABIs: aave/aave-v4 @{q.data!.sources.abi.commit.slice(0, 8)}.</p>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------ Solver Arena ------------------------------ */
export function ArenaView({ address, showFutures = true }: { address: string; showFutures?: boolean }) {
  const q = useQuery({ queryKey: ["arena", address], queryFn: () => getJson<ArenaResponse>(`/api/strategy?address=${address}`), staleTime: 30_000 });
  if (q.isLoading) return <div className="card h-48 animate-pulse" aria-label="Running solvers" />;
  if (q.error) return <p className="card p-5 text-sm text-danger">{(q.error as Error).message}</p>;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <section className="card p-5 text-[12.5px]">
        <p className="eyebrow">Book · {d.basis.replace(/-/g, " ")} · block {d.blockNumber}</p>
        <p className="mt-2">
          Collateral: {d.book.collateral.length ? d.book.collateral.map((c) => `${fmtNum(c.formatted.replace(/,/g, ""), 4)} ${c.symbol}${c.supplied ? "" : " (what-if supply from wallet)"}`).join(", ") : "none"}
          {d.book.debt.length > 0 && <> · Debt: {d.book.debt.map((x) => `${fmtNum(x.formatted.replace(/,/g, ""), 2)} ${x.symbol}`).join(", ")}</>}
        </p>
        <p className="mt-1 text-faint">{d.note} {d.policy.note}</p>
      </section>
      {d.plans.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {d.plans.map((p) => (
            <article key={p.solver} className={`card p-5 ${p.verdict.accepted ? "border-mint/30" : "border-danger/30"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[20px]">{p.solver}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${p.verdict.accepted ? "border-mint/40 text-mint" : "border-danger/40 text-danger"}`}>{p.verdict.accepted ? "Verified" : "Rejected by verifier"}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{p.thesis}</p>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[12.5px]">
                <dt className="text-faint">Borrow</dt><dd className="num text-right">{fmtNum(p.borrowFormatted.replace(/,/g, ""), 2)} USDC</dd>
                <dt className="text-faint">Resulting HF</dt><dd className={`num text-right ${hfTone(p.expectedHfWad)}`}>{fmtHf(p.expectedHfWad)}</dd>
                <dt className="text-faint">APR</dt><dd className="num text-right">{bpsPct(p.aprBps)}</dd>
                <dt className="text-faint">30-day interest</dt><dd className="num text-right">{fmtNum(Number(p.interest30d) / 1e6, 2)} USDC</dd>
              </dl>
              <ol className="mt-3 list-decimal pl-4 text-[11.5px] text-muted">
                {p.steps.map((s, i) => <li key={i}>{s.action} {s.symbol}</li>)}
              </ol>
              <details className="mt-3 text-[11.5px]">
                <summary className="cursor-pointer text-faint">Verifier checks ({p.verdict.checks.filter((c) => c.pass).length}/{p.verdict.checks.length} pass)</summary>
                <ul className="mt-1 space-y-0.5">
                  {p.verdict.checks.map((c) => (
                    <li key={c.name} className={c.pass ? "text-muted" : "text-danger"}>{c.pass ? "✓" : "✗"} {c.name} <span className="text-faint">— {c.detail}</span></li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
      )}
      {showFutures && d.futures.length > 0 && (<><p className="text-[12px] text-muted">Scenario basis: {d.futuresBasis}</p><FuturesTable rows={d.futures} /></>)}
      <p className="text-[11px] text-faint">Simulation only: no calldata is built, nothing is signed or broadcast. Execution (Phase 4) is planned for a clearly labeled Base fork.</p>
    </div>
  );
}
