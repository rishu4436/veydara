"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { PortfolioResponse } from "@/lib/server/portfolio";
import type { PositionAnalysis } from "@/lib/server/aave";
import { fmtUsd, getJson } from "@/lib/client/api";
import { fmtHf, hfTone, bpsPct } from "@/lib/client/fmt";
import { CapabilityBadge } from "./badge";

type Node = { id: string; label: string; sub: string; kind: "wallet" | "holding" | "underlying" | "venue" | "position"; valueUsd: number | null; href?: string };
type Edge = { from: string; to: string; label: string };

/**
 * Capital Constellation: what you hold → what it represents → where it can be
 * used, plus live protocol positions. Every node comes from a real read;
 * the table below is the accessible equivalent of the graph.
 */
export function CapitalConstellation({ d, chain, address }: { d: PortfolioResponse; chain: "base" | "solana"; address: string }) {
  const [view, setView] = useState<"graph" | "table">("graph");
  const pos = useQuery({ queryKey: ["aave-position", address], queryFn: () => getJson<PositionAnalysis>(`/api/aave/position?address=${address}`), enabled: chain === "base", staleTime: 60_000, retry: false });
  const { nodes, edges } = useMemo(() => build(d, pos.data ?? null), [d, pos.data]);
  if (nodes.length <= 1) return null;
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="eyebrow">Capital Constellation</h2>
          <p className="mt-1 text-[12px] text-muted">Holdings → underlying exposure → venues and live positions. Nodes are real reads; nothing is inferred from tickers.</p>
        </div>
        <div className="flex items-center gap-2">
          {chain === "base" && <CapabilityBadge status={pos.data ? "live-verified" : pos.isLoading ? "read-only" : "unavailable"} title="Aave V4 position read" />}
          <div role="tablist" className="flex rounded-lg border border-line text-[12px]">
            {(["graph", "table"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? "bg-raised text-fg" : "text-muted"}`}>{v === "graph" ? "Graph" : "Table"}</button>
            ))}
          </div>
        </div>
      </div>
      {view === "graph" ? <Graph nodes={nodes} edges={edges} /> : <Table nodes={nodes} edges={edges} />}
      {pos.data?.hasPosition && (
        <p className="mt-3 text-[12px]">
          Aave V4 position: health factor <b className={hfTone(pos.data.position.account.healthFactorWad)}>{fmtHf(pos.data.position.account.healthFactorWad)}</b>
          {pos.data.veydara.drawdownToLiquidationBps && <span className="text-muted"> · collateral can fall {bpsPct(pos.data.veydara.drawdownToLiquidationBps)} before liquidation</span>}
          {" · "}<Link href={`/positions?address=${address}`} className="text-ice">Open position →</Link>
        </p>
      )}
    </section>
  );
}

function build(d: PortfolioResponse, p: PositionAnalysis | null): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [{ id: "wallet", label: "Wallet", sub: `${d.holdings.length} verified holdings`, kind: "wallet", valueUsd: Number(d.totals.pricedUsd) }];
  const edges: Edge[] = [];
  const add = (n: Node) => { if (!nodes.some((x) => x.id === n.id)) nodes.push(n); };
  for (const h of d.holdings) {
    const v = h.identity.verified;
    const sym = v?.symbol ?? h.identity.display.symbol;
    const hid = `h:${h.address}`;
    add({ id: hid, label: sym, sub: `${h.formatted}`, kind: "holding", valueUsd: h.valueUsd ? Number(h.valueUsd) : null, href: `/asset/${h.chain}/${h.address}` });
    edges.push({ from: "wallet", to: hid, label: h.valueUsd ? fmtUsd(h.valueUsd, { compact: true }) : "unpriced" });
    if (v?.underlying) {
      const uid = `u:${v.underlying.symbol}`;
      add({ id: uid, label: v.underlying.symbol, sub: v.underlying.kind, kind: "underlying", valueUsd: null });
      edges.push({ from: hid, to: uid, label: "represents" });
    }
    if (h.aaveListing && p) {
      const r = p.market.reserves.find((x) => x.underlying.toLowerCase() === h.address.toLowerCase());
      if (r) {
        add({ id: "v:aave", label: "Aave V4", sub: "Equities Hub · MAG7", kind: "venue", valueUsd: null });
        edges.push({ from: hid, to: "v:aave", label: r.collateralFactorBps > 0 ? `CF ${bpsPct(r.collateralFactorBps, 0)}` : r.borrowable ? "borrowable" : "listed" });
      }
    }
  }
  if (p?.hasPosition) {
    add({ id: "v:aave", label: "Aave V4", sub: "Equities Hub · MAG7", kind: "venue", valueUsd: null });
    for (const c of p.collateral) {
      add({ id: `p:c:${c.symbol}`, label: `${c.symbol} supplied`, sub: c.formatted, kind: "position", valueUsd: Number(c.formatted.replace(/,/g, "")) * Number(c.priceUsd) });
      edges.push({ from: "v:aave", to: `p:c:${c.symbol}`, label: c.liquidationPriceUsd ? `liq ${fmtUsd(c.liquidationPriceUsd)}` : "collateral" });
    }
    for (const x of p.debt) {
      add({ id: `p:d:${x.symbol}`, label: `${x.symbol} debt`, sub: x.formatted, kind: "position", valueUsd: null });
      edges.push({ from: "v:aave", to: `p:d:${x.symbol}`, label: "borrowed" });
    }
    edges.push({ from: "wallet", to: "v:aave", label: `HF ${fmtHf(p.position.account.healthFactorWad)}` });
  }
  return { nodes, edges };
}

const COLS: Record<Node["kind"], number> = { wallet: 0, holding: 1, underlying: 2, venue: 2, position: 3 };
const TONE: Record<Node["kind"], string> = { wallet: "var(--color-ice)", holding: "var(--color-mint)", underlying: "var(--color-violet)", venue: "var(--color-amber)", position: "var(--color-amber)" };

function Graph({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const cols = [0, 1, 2, 3].map((c) => nodes.filter((n) => COLS[n.kind] === c));
  const rowH = 46;
  const H = Math.max(180, Math.max(...cols.map((c) => c.length)) * rowH + 30);
  const W = 900;
  const colX = [70, 300, 560, 790];
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((c, ci) => c.forEach((n, i) => pos.set(n.id, { x: colX[ci]!, y: (H - c.length * rowH) / 2 + i * rowH + rowH / 2 })));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img" aria-label="Capital constellation graph; switch to Table for the same data as text">
        {edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          return (
            <g key={i}>
              <path d={`M${a.x + 60} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x - 60} ${b.y}`} fill="none" stroke="var(--color-line)" strokeWidth={1} />
              <text x={mx} y={(a.y + b.y) / 2 - 3} fontSize="9" textAnchor="middle" fill="var(--color-faint)">{e.label}</text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const body = (
            <g>
              <rect x={p.x - 60} y={p.y - 17} width={120} height={34} rx={9} fill="var(--color-raised)" stroke={TONE[n.kind]} strokeOpacity={0.7} />
              <text x={p.x} y={p.y - 2} fontSize="11.5" textAnchor="middle" className="fill-[var(--color-fg)]">{n.label.slice(0, 18)}</text>
              <text x={p.x} y={p.y + 11} fontSize="9" textAnchor="middle" fill="var(--color-muted)">{n.valueUsd !== null && Number.isFinite(n.valueUsd) ? fmtUsd(String(n.valueUsd), { compact: true }) : n.sub.slice(0, 22)}</text>
            </g>
          );
          return n.href ? <a key={n.id} href={n.href}>{body}</a> : <g key={n.id}>{body}</g>;
        })}
      </svg>
    </div>
  );
}

function Table({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const name = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <table className="w-full text-[12px]">
      <caption className="sr-only">Capital constellation relationships</caption>
      <thead className="text-faint"><tr><th className="py-1 text-left">From</th><th className="text-left">Relationship</th><th className="text-left">To</th></tr></thead>
      <tbody>
        {edges.map((e, i) => (
          <tr key={i} className="border-t border-line-soft"><td className="py-1">{name(e.from)}</td><td className="text-muted">{e.label}</td><td>{name(e.to)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
