"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Candle, HorizonRead, ZoneResult } from "@veydara/quant";
import type { Provenance } from "@veydara/domain";
import type { AaveMarket, AaveReserve } from "@veydara/protocols";
import { fmtUsd, getJson } from "@/lib/client/api";
import { bpsPct, fmtNum, rayPct, units } from "@/lib/client/fmt";
import { CapabilityBadge } from "./badge";
import { ProvenanceChip } from "./provenance";
import { PriceChart } from "./price-chart";

type Unavail = { status: "unavailable"; code: string; reason: string };
type Source = { endpoint: string; platform: string; address: string; interval: string; note: string | null; basis: string };

export function Panel({ title, badge, children, className = "" }: { title: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function UnavailableLine({ u, extra }: { u: Unavail; extra?: string }) {
  return (
    <div className="text-[12.5px]">
      <p className="text-muted">Unavailable · {u.reason} <span className="font-mono text-[10.5px] text-faint">[{u.code}]</span></p>
      {extra && <p className="mt-1 text-[11.5px] text-faint">{extra}</p>}
    </div>
  );
}

/* --------------------------------- Chart --------------------------------- */
type OhlcvOk = {
  status: "ok";
  candles: Candle[];
  droppedForming: number;
  gaps: number;
  indicators: { ema20: (number | null)[]; ema50: (number | null)[]; ema200: (number | null)[]; rsi14: (number | null)[]; atr14: (number | null)[]; macd: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } };
  zones: ZoneResult;
  outliers: { index: number; openTime: number; side: "high" | "low"; price: number }[];
  provenance: Provenance;
  source: Source;
};
const lastOf = (a: (number | null)[]) => a[a.length - 1] ?? null;

export function ChartPanel({ chain, address }: { chain: string; address: string }) {
  const [interval, setIv] = useState<"1h" | "4h" | "1d" | "1w">("1d");
  const [zonesOn, setZonesOn] = useState(true);
  const [emaOn, setEmaOn] = useState(true);
  const [table, setTable] = useState(false);
  const q = useQuery({ queryKey: ["ohlcv", chain, address, interval], queryFn: () => getJson<OhlcvOk | Unavail>(`/api/ohlcv?chain=${chain}&address=${encodeURIComponent(address)}&interval=${interval}&limit=200`), staleTime: 5 * 60_000 });
  const d = q.data;
  return (
    <Panel title="Technical structure" badge={d?.status === "ok" ? <CapabilityBadge status="live-verified" title="Real CMC DEX candles" /> : d ? <CapabilityBadge status="unavailable" /> : undefined}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        {(["1h", "4h", "1d", "1w"] as const).map((iv) => (
          <button key={iv} type="button" onClick={() => setIv(iv)} aria-pressed={interval === iv} className={`rounded-md border px-2 py-1 ${interval === iv ? "border-ice text-ice" : "border-line text-muted"}`}>{iv}</button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-muted"><input type="checkbox" checked={emaOn} onChange={(e) => setEmaOn(e.target.checked)} /> EMA 20/50</label>
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={zonesOn} onChange={(e) => setZonesOn(e.target.checked)} /> S/R zones</label>
        <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={table} onChange={(e) => setTable(e.target.checked)} /> Table</label>
        {d?.status === "ok" && <span className="ml-auto"><ProvenanceChip p={d.provenance} /></span>}
      </div>
      {q.isLoading && <div className="h-[360px] animate-pulse rounded-lg bg-raised" aria-label="Loading candles" />}
      {q.error && <p className="text-[12.5px] text-danger">{(q.error as Error).message}</p>}
      {d?.status === "unavailable" && <UnavailableLine u={d} extra="The indicator and zone engine never runs on invented candles." />}
      {d?.status === "ok" && (
        <>
          <PriceChart candles={d.candles} ema20={emaOn ? d.indicators.ema20 : []} ema50={emaOn ? d.indicators.ema50 : []} zones={d.zones.status === "ok" ? d.zones.zones : []} showZones={zonesOn} outlierIdx={d.outliers.map((o) => o.index)} />
          {d.outliers.length > 0 && (
            <p className="mt-2 text-[11px] text-amber">
              {d.outliers.length} extreme DEX wick{d.outliers.length > 1 ? "s" : ""} excluded from the y-axis scale (data unchanged, see Table): {d.outliers.map((o) => `${new Date(o.openTime).toISOString().slice(0, 10)} ${o.side} ${fmtUsd(String(o.price))}`).join(", ")}.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-5">
            <Stat k="Last close" v={fmtUsd(String(d.candles.at(-1)!.close))} />
            <Stat k="RSI 14" v={fmtNum(lastOf(d.indicators.rsi14), 1)} />
            <Stat k="MACD hist" v={fmtNum(lastOf(d.indicators.macd.histogram), 3)} />
            <Stat k="ATR 14" v={fmtUsd(String(lastOf(d.indicators.atr14) ?? ""))} />
            <Stat k="Closed candles" v={`${d.candles.length}${d.droppedForming ? ` (+${d.droppedForming} forming, excluded)` : ""}`} />
          </div>
          {d.zones.status === "ok" ? (
            <ul className="mt-3 grid gap-1 text-[11.5px] sm:grid-cols-2">
              {d.zones.zones.map((z) => (
                <li key={`${z.kind}${z.low}`} className="flex justify-between gap-2 rounded-md border border-line-soft px-2 py-1">
                  <span className={z.kind === "support" ? "text-mint" : "text-amber"}>{z.kind} · {z.quality} · {z.touches} touches</span>
                  <span className="num text-muted">{fmtUsd(String(z.low))} – {fmtUsd(String(z.high))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11.5px] text-faint">Zones: {d.zones.reason}</p>
          )}
          {table && (
            <div className="mt-3 max-h-64 overflow-auto rounded-md border border-line-soft">
              <table className="w-full text-[11.5px]">
                <caption className="sr-only">Last 30 closed candles</caption>
                <thead className="sticky top-0 bg-raised text-faint"><tr><th className="px-2 py-1 text-left">Open (UTC)</th><th className="px-2 text-right">O</th><th className="px-2 text-right">H</th><th className="px-2 text-right">L</th><th className="px-2 text-right">C</th></tr></thead>
                <tbody className="num">
                  {d.candles.slice(-30).reverse().map((c) => (
                    <tr key={c.openTime} className="border-t border-line-soft"><td className="px-2 py-0.5">{new Date(c.openTime).toISOString().slice(0, 16).replace("T", " ")}</td><td className="px-2 text-right">{c.open.toFixed(2)}</td><td className="px-2 text-right">{c.high.toFixed(2)}</td><td className="px-2 text-right">{c.low.toFixed(2)}</td><td className="px-2 text-right">{c.close.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-4 text-faint">{d.source.basis} {d.source.note ?? ""} Source: CMC {d.source.endpoint} ({d.source.platform}, {d.source.interval}). {d.zones.status === "ok" ? `Zones: ${d.zones.method}.` : ""}</p>
        </>
      )}
    </Panel>
  );
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <p className="text-faint">{k}</p>
      <p className="num">{v}</p>
    </div>
  );
}

/* ----------------------------- Multi-horizon ----------------------------- */
type ResearchResp = {
  horizons: ({ status: "ok"; read: HorizonRead; source: Source; provenance: Provenance; gaps: number } | { status: "unavailable"; horizon: string; code: string; reason: string })[];
  consensus: { aligned: string; detail: string };
  disclaimer: string;
};
const trendTone: Record<string, string> = { up: "text-mint", down: "text-danger", range: "text-ice", mixed: "text-amber", "insufficient-data": "text-faint" };

export function ResearchPanel({ chain, address }: { chain: string; address: string }) {
  const q = useQuery({ queryKey: ["research", chain, address], queryFn: () => getJson<ResearchResp>(`/api/research?chain=${chain}&address=${encodeURIComponent(address)}`), staleTime: 5 * 60_000 });
  const d = q.data;
  return (
    <Panel title="Multi-horizon research" badge={d ? <CapabilityBadge status={d.horizons.some((h) => h.status === "ok") ? "live-verified" : "unavailable"} /> : undefined}>
      {q.isLoading && <p className="text-[12.5px] text-muted">Reading three horizons of real candles…</p>}
      {q.error && <p className="text-[12.5px] text-danger">{(q.error as Error).message}</p>}
      {d && (
        <>
          <p className="mb-3 text-[13px]">Consensus: <b className={trendTone[d.consensus.aligned]}>{d.consensus.aligned}</b> <span className="text-muted">— {d.consensus.detail}</span></p>
          <div className="grid gap-3 md:grid-cols-3">
            {d.horizons.map((h) =>
              h.status === "ok" ? (
                <div key={h.read.horizon} className="rounded-lg border border-line-soft p-3 text-[12px]">
                  <p className="eyebrow">{h.read.horizon}</p>
                  <p className={`mt-1 font-display text-[22px] ${trendTone[h.read.trend]}`}>{h.read.trend}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-y-1">
                    <dt className="text-faint">Change</dt><dd className="num text-right">{fmtNum(h.read.changePct, 2)}%</dd>
                    <dt className="text-faint">RSI 14</dt><dd className="num text-right">{fmtNum(h.read.rsi14, 1)} {h.read.rsiState && h.read.rsiState !== "neutral" ? `(${h.read.rsiState})` : ""}</dd>
                    <dt className="text-faint">ATR %</dt><dd className="num text-right">{fmtNum(h.read.atrPct, 2)}%</dd>
                    <dt className="text-faint">Support</dt><dd className="num text-right">{h.read.nearestSupport ? `${fmtUsd(String(h.read.nearestSupport.low))}–${fmtUsd(String(h.read.nearestSupport.high))}` : "none below"}</dd>
                    <dt className="text-faint">Resistance</dt><dd className="num text-right">{h.read.nearestResistance ? `${fmtUsd(String(h.read.nearestResistance.low))}–${fmtUsd(String(h.read.nearestResistance.high))}` : "none above"}</dd>
                  </dl>
                  {h.read.notes.map((n) => <p key={n} className="mt-2 text-[11px] text-muted">{n}</p>)}
                  <p className="mt-2 text-[10.5px] leading-4 text-faint">{h.read.candles} closed candles · {h.read.trendRule} · CMC {h.source.endpoint}</p>
                </div>
              ) : (
                <div key={h.horizon} className="rounded-lg border border-line-soft p-3"><p className="eyebrow">{h.horizon}</p><UnavailableLine u={{ status: "unavailable", code: h.code, reason: h.reason }} /></div>
              ),
            )}
          </div>
          <p className="mt-3 text-[11px] text-faint">{d.disclaimer}</p>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------ Issuer graph ------------------------------ */
type IssuerResp =
  | { status: "ok"; underlying: { symbol: string; name: string; aggregatePriceUsd: number | null; tokenizedMarketCap: number | null; lastUpdated: string | null }; issuers: { issuerId: string | null; issuerName: string; tokens: { symbol: string; name: string; cmcId: number; priceUsd: number | null; marketCap: number | null }[] }[]; provenance: Provenance }
  | Unavail;

export function IssuerGraphPanel({ underlying, thisCmcId }: { underlying: string; thisCmcId: number | null }) {
  const q = useQuery({ queryKey: ["issuers", underlying], queryFn: () => getJson<IssuerResp>(`/api/issuers?symbol=${encodeURIComponent(underlying)}`), staleTime: 10 * 60_000 });
  const d = q.data;
  return (
    <Panel title={`Issuer graph · ${underlying}`} badge={d ? <CapabilityBadge status={d.status === "ok" ? "live-verified" : "unavailable"} /> : undefined}>
      {q.isLoading && <p className="text-[12.5px] text-muted">Loading CMC RWA issuers…</p>}
      {d?.status === "unavailable" && <UnavailableLine u={d} extra="This view needs CMC /v5/real-world-assets/quotes/latest (API key with an active plan). No issuer relationships are inferred from tickers." />}
      {d?.status === "ok" && <IssuerGraph data={d} thisCmcId={thisCmcId} />}
    </Panel>
  );
}

function IssuerGraph({ data, thisCmcId }: { data: Extract<IssuerResp, { status: "ok" }>; thisCmcId: number | null }) {
  const W = 640;
  const tokens = data.issuers.flatMap((i) => i.tokens.map((t) => ({ ...t, issuer: i.issuerName })));
  const H = Math.max(160, tokens.length * 34 + 40);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${data.underlying.symbol} and ${tokens.length} tokenized representations`}>
        <g>
          <circle cx={90} cy={H / 2} r={42} fill="var(--color-raised)" stroke="var(--color-violet)" />
          <text x={90} y={H / 2 - 2} textAnchor="middle" fontSize="15" className="fill-[var(--color-fg)] font-display">{data.underlying.symbol}</text>
          <text x={90} y={H / 2 + 14} textAnchor="middle" fontSize="9" fill="var(--color-muted)">underlying</text>
        </g>
        {tokens.map((t, i) => {
          const y = 30 + i * 34;
          const mine = t.cmcId === thisCmcId;
          return (
            <g key={t.cmcId}>
              <path d={`M132 ${H / 2} C 260 ${H / 2}, 260 ${y}, 360 ${y}`} fill="none" stroke={mine ? "var(--color-mint)" : "var(--color-line)"} strokeWidth={mine ? 2 : 1} />
              <rect x={360} y={y - 12} width={270} height={24} rx={6} fill="var(--color-raised)" stroke={mine ? "var(--color-mint)" : "var(--color-line-soft)"} />
              <text x={370} y={y + 4} fontSize="11" className="fill-[var(--color-fg)]">{t.symbol}</text>
              <text x={440} y={y + 4} fontSize="10" fill="var(--color-muted)">{t.issuer.slice(0, 22)}</text>
              <text x={622} y={y + 4} fontSize="10.5" textAnchor="end" fill="var(--color-muted)">{t.priceUsd !== null ? `$${t.priceUsd.toFixed(2)}` : "—"}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[11px] text-faint">Different issuers' tokens are distinct instruments with their own rights, custody and liquidity — never interchangeable. Aggregate tokenized price (all issuers): {data.underlying.aggregatePriceUsd !== null ? fmtUsd(String(data.underlying.aggregatePriceUsd)) : "—"}.</p>
      <ProvenanceChip p={data.provenance} />
    </div>
  );
}

/* --------------------------- Live Aave reserve --------------------------- */
export function AaveReservePanel({ underlying }: { underlying: string }) {
  const q = useQuery({ queryKey: ["aave-market"], queryFn: () => getJson<{ market: AaveMarket }>(`/api/aave/market`), staleTime: 30_000 });
  const m = q.data?.market;
  const r = m?.reserves.find((x) => x.underlying.toLowerCase() === underlying.toLowerCase());
  return (
    <Panel title="Lending venue · Aave V4 Equities Hub" badge={r ? <CapabilityBadge status="live-verified" title={`Block ${m!.blockNumber}`} /> : q.isLoading ? undefined : <CapabilityBadge status="unavailable" />}>
      {q.isLoading && <p className="text-[12.5px] text-muted">Reading the Spoke and Hub at a pinned block…</p>}
      {q.error && <p className="text-[12.5px] text-danger">{(q.error as Error).message}</p>}
      {m && !r && <p className="text-[12.5px] text-muted">This token is not a reserve on the Aave V4 MAG7 spoke.</p>}
      {m && r && <ReserveFacts r={r} m={m} />}
    </Panel>
  );
}

export function ReserveFacts({ r, m }: { r: AaveReserve; m: AaveMarket }) {
  const cap = (c: string | null) => (c === null ? "uncapped" : `${fmtNum(c, 0)} ${r.symbol}`);
  const supplied = units(r.suppliedAssets, r.decimals);
  const pctOfCap = r.addCapTokens ? (Number(BigInt(r.suppliedAssets) / 10n ** BigInt(r.decimals)) / Number(r.addCapTokens)) * 100 : null;
  const rows: [string, string][] = [
    ["Collateral factor", bpsPct(r.collateralFactorBps, 0)],
    ["Max liquidation bonus", bpsPct(r.maxLiquidationBonusBps - 10_000, 2)],
    ["Liquidation fee (of bonus)", bpsPct(r.liquidationFeeBps, 0)],
    ["Collateral risk premium", bpsPct(r.collateralRiskBps, 0)],
    ["Supplied / add cap", `${supplied} / ${cap(r.addCapTokens)}${pctOfCap !== null ? ` (${pctOfCap.toFixed(1)}%)` : ""}`],
    ["Borrowable", r.borrowable ? `yes · draw cap ${cap(r.drawCapTokens)}` : "no (collateral only)"],
    ["Status", [r.paused && "paused", r.frozen && "frozen", r.spokeHalted && "spoke halted", !r.spokeActive && "spoke inactive"].filter(Boolean).join(", ") || "active"],
    ["Spoke oracle price", fmtUsd(units(r.price, m.oracleDecimals, 4).replace(/,/g, ""))],
  ];
  if (r.borrowable) rows.push(["Drawn rate (base APR)", rayPct(r.drawnRateRay)], ["Hub liquidity", `${units(r.hubLiquidity, r.decimals, 0)} ${r.symbol}`]);
  return (
    <div className="text-[12.5px]">
      <dl className="divide-y divide-line-soft">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-faint">{k}</dt><dd className="num text-right">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-4 text-faint">Live Spoke/Hub view calls at block {m.blockNumber}. Aave V4 health factor = Σ(collateral value × CF) ÷ debt value; liquidation below 1.00, restored toward {(Number(BigInt(m.liquidation.targetHealthFactor) / 10n ** 16n) / 100).toFixed(2)}. Your eligibility to use this hub is unverified.</p>
    </div>
  );
}
