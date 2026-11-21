"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KaminoMarketSnapshot, KaminoPositionsSnapshot } from "@veydara/kamino";
import { getJson, shortAddr } from "@/lib/client/api";
import { Panel } from "./analysis";
import { CapabilityBadge } from "./badge";

const SAMPLE = "Fa7LNzj3SCV364hya9dx9evL29pC1awx24iHeCEwX6vU";
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const n = (s: string, d = 2) => Number(s).toLocaleString(undefined, { maximumFractionDigits: d });

export function KaminoView() {
  const mk = useQuery({ queryKey: ["kamino-market"], queryFn: () => getJson<{ market: KaminoMarketSnapshot & { dataset: string } }>("/api/kamino/market"), staleTime: 60_000 });
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const pos = useQuery({ queryKey: ["kamino-pos", query], enabled: Boolean(query), queryFn: () => getJson<{ positions: KaminoPositionsSnapshot & { dataset: string } }>(`/api/kamino/positions?owner=${query}`) });
  const m = mk.data?.market;
  return (
    <div className="space-y-6">
      <Panel title="Adapter capabilities" badge={<span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">@kamino-finance/klend-sdk 14.0.0</span>}>
        <ul className="grid gap-2 text-[12.5px] sm:grid-cols-2">
          <li className="flex items-center gap-2"><CapabilityBadge status={m?.dataset === "fixture" ? "read-only" : m ? "live-verified" : "unavailable"} /> Market discovery (reserves, LTV, liquidation threshold, caps, APYs, oracle prices)</li>
          <li className="flex items-center gap-2"><CapabilityBadge status="read-only" /> Wallet obligations (deposits, borrows, LTV, distance to liquidation)</li>
          <li className="flex items-center gap-2"><CapabilityBadge status="unavailable" /> Deposit / borrow / repay / withdraw — not built (no Solana fork pipeline)</li>
          <li className="flex items-center gap-2"><CapabilityBadge status="unavailable" /> Solver Arena / Intent Engine on Kamino — Aave V4 only for now</li>
        </ul>
        {m && <p className="mt-3 text-[11.5px] text-faint">{m.name} · market <span className="font-mono">{m.market}</span> · program <span className="font-mono">{m.programId}</span> · slot {m.slot} · {m.dataset === "fixture" ? "FIXTURE (recorded live read)" : `read ${new Date(m.readAt).toLocaleTimeString()}`} · address source: <a className="text-ice" href={m.source.markets.xStocks.source} target="_blank" rel="noreferrer">Kamino docs</a></p>}
      </Panel>

      <Panel title="xStocks Market reserves (Solana)">
        {mk.isLoading && <div className="h-40 animate-pulse rounded-xl bg-raised" />}
        {mk.error && <p className="text-[13px] text-danger">Unavailable — {(mk.error as Error).message}</p>}
        {m && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]" aria-label="Kamino reserves">
              <thead className="text-left text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1">Asset</th><th>Status</th><th>Oracle price</th><th>Max LTV</th><th>Liq. threshold</th><th>Supply APY</th><th>Borrow APY</th><th>Deposits / cap</th><th>Borrowed / cap</th><th>Mint</th></tr></thead>
              <tbody>
                {m.reserves.map((r) => (
                  <tr key={r.reserve} className="border-t border-line/50">
                    <td className="py-1.5 font-medium">{r.symbol} <span className="text-[10px] text-faint">{r.kind === "tokenized-equity" ? "equity" : r.kind}</span></td>
                    <td className={r.status === "Active" ? (r.depositCapUsed >= 0.999 ? "text-amber" : "text-mint") : "text-muted"}>{r.status}{r.status === "Active" && r.depositCapUsed >= 0.999 ? " · cap full" : ""}</td>
                    <td className="num">${n(r.priceUsd, 4)}{!r.oracleValid && <span className="text-danger"> stale</span>}</td>
                    <td className="num">{r.ltvPct}%</td>
                    <td className="num">{r.liquidationThresholdPct}%</td>
                    <td className="num">{pct(r.supplyApy)}</td>
                    <td className="num">{r.borrowable ? pct(r.borrowApy) : "—"}</td>
                    <td className="num">{n(r.totalSupply)} / {n(r.depositLimit, 0)}</td>
                    <td className="num">{r.borrowable ? `${n(r.borrowed)} / ${n(r.borrowLimit, 0)}` : "not borrowable"}</td>
                    <td className="font-mono text-[10.5px] text-faint">{shortAddr(r.mint, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Solana wallet obligations (read-only)">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(owner.trim()); }}>
          <input aria-label="Solana address" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Solana address" className="min-w-[320px] flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 font-mono text-[12px]" />
          <button type="submit" className="rounded-lg border border-ice/50 px-3 py-1.5 text-[12.5px] text-ice">Read</button>
          <button type="button" onClick={() => { setOwner(SAMPLE); setQuery(SAMPLE); }} className="text-[11.5px] text-muted underline">use a public sample borrower</button>
        </form>
        {pos.isFetching && <p className="mt-3 text-[12px] text-muted">Reading obligations…</p>}
        {pos.error && <p className="mt-3 text-[12px] text-danger">{(pos.error as Error).message}</p>}
        {pos.data && (
          <div className="mt-4 space-y-3">
            {pos.data.positions.obligations.length === 0 && <p className="text-[12.5px] text-muted">No obligations for this wallet on the xStocks market{pos.data.positions.dataset === "fixture" ? " in the fixture dataset" : ""}.</p>}
            {pos.data.positions.obligations.map((o) => (
              <div key={o.obligation} className="rounded-xl border border-line p-4 text-[12.5px]" aria-label={`Kamino obligation ${o.obligation}`}>
                <p className="text-[11px] text-faint">obligation <span className="font-mono">{o.obligation}</span> · slot {pos.data.positions.slot}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-4">
                  <p>Deposits <span className="num block text-[15px]">${o.totalDepositUsd}</span></p>
                  <p>Borrows <span className="num block text-[15px]">${o.totalBorrowUsd}</span></p>
                  <p>LTV / liquidation LTV <span className="num block text-[15px]">{pct(o.ltv)} / {pct(o.liquidationLtv)}</span></p>
                  <p>Collateral drop to liquidation <span className="num block text-[15px]" data-testid="kamino-distance">{o.distanceToLiquidationPct === null ? "no debt" : `${o.distanceToLiquidationPct}%`}</span></p>
                </div>
                <p className="mt-2 text-[11.5px] text-muted">{o.deposits.map((d) => `${d.amount} ${d.symbol} ($${d.valueUsd})`).join(" · ")}{o.borrows.length ? ` ‖ debt: ${o.borrows.map((b) => `${b.amount} ${b.symbol}`).join(" · ")}` : ""}</p>
              </div>
            ))}
            <p className="text-[11px] text-faint">Distance to liquidation assumes all deposits fall together and debt stays flat: d = 1 − LTV / liquidation LTV (Kamino UI definitions from the SDK).</p>
          </div>
        )}
      </Panel>
    </div>
  );
}
