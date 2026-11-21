"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import type { AssetIntel } from "@/lib/server/asset";
import type { PortfolioResponse } from "@/lib/server/portfolio";
import type { Provenance } from "@veydara/domain";
import { fmtUsd, getJson, shortAddr } from "@/lib/client/api";
import { useVeydaraWallet } from "@/lib/client/wallet-context";
import { IdentityBadge, CapabilityBadge } from "./badge";
import { ProvenanceChip } from "./provenance";
import { RiskClock } from "./risk-clock";
import { AaveReservePanel, ChartPanel, IssuerGraphPanel, ResearchPanel } from "./analysis";
import { I } from "./icons";

type Unavail = { status: "unavailable"; code: string; reason: string };

export function AssetStage({ chain, address }: { chain: string; address: string }) {
  const q = useQuery({ queryKey: ["asset", chain, address], queryFn: () => getJson<AssetIntel>(`/api/asset?chain=${chain}&address=${encodeURIComponent(address)}`), staleTime: 60_000 });
  const { active } = useVeydaraWallet();
  const pf = useQuery({ queryKey: ["portfolio", active?.chain, active?.address, ""], queryFn: () => getJson<PortfolioResponse>(`/api/portfolio?chain=${active!.chain}&address=${encodeURIComponent(active!.address)}`), enabled: Boolean(active), staleTime: 60_000 });

  if (q.isLoading) return <Loading />;
  if (q.error) return <div className="card mx-auto max-w-3xl p-6 text-sm text-danger">{(q.error as Error).message}</div>;
  const a = q.data!;
  const v = a.registry;
  const held = pf.data?.holdings.find((h) => h.chain === a.chain && h.address.toLowerCase() === a.address.toLowerCase());
  const symbol = v?.symbol ?? (a.onchain.status === "ok" ? a.onchain.symbol : a.identity.display.symbol);
  const quarantined = a.identity.status === "suspected-spam" || a.identity.status === "impersonation";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{v?.assetClass === "tokenized-equity" ? "Collateral Passport" : "Asset research"} · {a.chain}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[44px] leading-none">{symbol}</h1>
            <IdentityBadge status={a.identity.status} />
          </div>
          <p className="mt-2 text-muted">
            {v?.name ?? a.identity.display.name}
            {v?.issuer ? ` · issued by ${v.issuer}` : ""}
          </p>
          <p className="mt-1 break-all font-mono text-[12px] text-faint">
            {a.address}{" "}
            {a.chain === "base" && (
              <a className="ml-1 inline-flex items-center gap-1 text-ice" href={`https://basescan.org/token/${a.address}`} target="_blank" rel="noreferrer noopener">
                Basescan <I.ext width={12} height={12} />
              </a>
            )}
          </p>
        </div>
        <div className="card px-4 py-3 text-right text-[12.5px]">
          {!active && <span className="text-muted">No wallet connected</span>}
          {active && pf.isLoading && <span className="text-muted">Checking your wallet…</span>}
          {active && pf.data && (held ? <span><span className="text-mint">In your wallet</span> · <span className="num">{held.formatted} {symbol}</span></span> : <span className="text-amber">Not in connected wallet ({shortAddr(active.address)})</span>)}
        </div>
      </motion.header>

      {quarantined && (
        <div className="card border-danger/40 p-5 text-sm">
          <p className="eyebrow text-danger">Quarantined</p>
          <ul className="mt-2 space-y-1 text-muted">{a.identity.reasons.map((r) => <li key={r}>– {r}</li>)}</ul>
          <p className="mt-2 text-xs text-faint">No price, analysis or eligibility is produced for this contract.</p>
        </div>
      )}

      {!quarantined && (
        <>
          <PriceTriad a={a} />
          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Passport a={a} />
            <div className="space-y-6">
              {a.session && (
                <Panel title="RWA Risk Clock" badge={<CapabilityBadge status="read-only" title="Session calendar + live oracle age; gap stress arrives with the borrowing engine" />}>
                  <RiskClock session={a.session} oracleUpdatedAt={a.aave.listed && a.aave.oracle.status === "ok" ? a.aave.oracle.updatedAt : null} oracleAgeSec={a.aave.listed && a.aave.oracle.status === "ok" ? a.aave.oracle.ageSeconds : null} />
                </Panel>
              )}
              {a.aave.listed ? <AaveReservePanel underlying={a.address} /> : <Lending a={a} />}
              <Dex a={a} />
            </div>
          </div>
          <ChartPanel chain={a.chain} address={a.address} />
          <ResearchPanel chain={a.chain} address={a.address} />
          {v?.underlying && v.assetClass === "tokenized-equity" && <IssuerGraphPanel underlying={v.underlying.symbol} thisCmcId={a.cmcListing.status === "ok" ? a.cmcListing.cmcId : (v.cmcId ?? null)} />}
        </>
      )}
      <p className="text-[11px] leading-4 text-faint">Research, not advice. VEYDARA shows sourced facts and explicit unknowns; it does not recommend buying, selling or borrowing.</p>
    </div>
  );
}

function Panel({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Unavailable({ u }: { u: Unavail }) {
  return (
    <p className="text-[12px] text-muted">
      <span className="text-faint">Unavailable</span> · {u.reason}
      <span className="ml-1 font-mono text-[10.5px] text-faint">[{u.code}]</span>
    </p>
  );
}

function PriceTriad({ a }: { a: AssetIntel }) {
  const cells: { label: string; sub: string; value: string | null; prov?: Provenance; unavailable?: Unavail }[] = [
    a.cmcQuote.status === "ok"
      ? { label: "Issuer token market price", sub: "CMC quote for this exact contract", value: a.cmcQuote.priceUsd, prov: a.cmcQuote.provenance }
      : { label: "Issuer token market price", sub: "CMC quote for this exact contract", value: null, unavailable: a.cmcQuote },
    a.rwa.status === "ok"
      ? { label: "CMC aggregate tokenized price", sub: `All issuers of ${a.rwa.underlying} — not this token's price`, value: a.rwa.aggregatePriceUsd !== null ? String(a.rwa.aggregatePriceUsd) : null, prov: a.rwa.provenance }
      : { label: "CMC aggregate tokenized price", sub: "All issuers combined — never a specific token's price", value: null, unavailable: a.rwa },
    a.aave.listed && a.aave.oracle.status === "ok"
      ? { label: "Protocol oracle (Aave V4)", sub: a.aave.oracle.description, value: a.aave.oracle.answer, prov: a.aave.oracle.provenance }
      : { label: "Protocol oracle", sub: a.aave.listed ? "Aave V4 MAG7 spoke feed" : "No lending-protocol oracle for this contract", value: null, unavailable: a.aave.listed && a.aave.oracle.status !== "ok" ? (a.aave.oracle as Unavail) : { status: "unavailable", code: "NOT_LISTED", reason: "Not listed in a verified lending market." } },
  ];
  return (
    <section aria-label="Distinct price sources" className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-line md:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface p-5">
          <p className="eyebrow">{c.label}</p>
          <p className="num mt-2 font-display text-[30px] leading-none">{c.value ? fmtUsd(c.value) : "—"}</p>
          <p className="mt-2 text-[11.5px] text-faint">{c.sub}</p>
          <div className="mt-2">{c.prov ? <ProvenanceChip p={c.prov} /> : c.unavailable && <Unavailable u={c.unavailable} />}</div>
        </div>
      ))}
      {a.priceDisagreement && (
        <div className={`bg-surface p-4 text-[12px] md:col-span-3 ${a.priceDisagreement.flagged ? "text-amber" : "text-muted"}`}>
          CMC market vs Aave oracle: <span className="num">{a.priceDisagreement.cmcVsOracleBps !== null ? `${(a.priceDisagreement.cmcVsOracleBps / 100).toFixed(2)}%` : "n/a"}</span>
          {a.priceDisagreement.flagged ? " — disagreement above 1% flagged. " : " — within 1%. "}
          {a.priceDisagreement.note}
        </div>
      )}
    </section>
  );
}

function Passport({ a }: { a: AssetIntel }) {
  const v = a.registry;
  const unknown = "Unknown — not verified from issuer documents";
  const rows: [string, ReactNode][] = [
    ["Underlying instrument", v?.underlying ? `${v.underlying.name} (${v.underlying.symbol}) · ${v.underlying.kind}` : "Unknown"],
    ["Asset class", v?.assetClass ?? "Unknown"],
    ["Issuer", v?.issuer ?? "Unknown"],
    ["Exact contract", <span key="c" className="break-all font-mono text-[11.5px]">{a.chain}:{a.address}</span>],
    ["Decimals (on-chain)", a.onchain.status === "ok" ? String(a.onchain.decimals) : "—"],
    ["Total supply (on-chain)", a.onchain.status === "ok" ? <span key="s" className="num">{formatSupply(a.onchain.totalSupply, a.onchain.decimals)} @ block {a.onchain.blockNumber}</span> : "—"],
    ["CMC listing", a.cmcListing.status === "ok" ? `#${a.cmcListing.cmcId} · ${a.cmcListing.name}` : a.cmcListing.reason],
    ["Token-to-share ratio", unknown],
    ["Economic rights / dividends", unknown],
    ["Redemption & custody", unknown],
    ["Transfer restrictions & eligibility", unknown],
    ["Market hours (underlying)", v?.assetClass === "tokenized-equity" ? "NYSE/Nasdaq regular session 09:30–16:00 ET" : "Trades continuously on-chain"],
  ];
  return (
    <Panel title={v?.assetClass === "tokenized-equity" ? "Collateral Passport" : "Identity"} badge={<CapabilityBadge status="read-only" title="Registry + on-chain + CMC; issuer legal terms not yet ingested" />}>
      <dl className="divide-y divide-line-soft">
        {rows.map(([k, val]) => (
          <div key={k} className="grid grid-cols-1 gap-1 py-2.5 text-[12.5px] sm:grid-cols-[180px_1fr] sm:gap-3">
            <dt className="text-faint">{k}</dt>
            <dd className={`min-w-0 break-words ${val === unknown ? "text-amber/90" : ""}`}>{val}</dd>
          </div>
        ))}
      </dl>
      {v && (
        <div className="mt-4">
          <p className="eyebrow mb-2">Sources</p>
          <ul className="space-y-1 text-[11.5px]">
            {v.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-ice hover:underline">{s.label}</a> <span className="text-faint">· retrieved {s.retrievedAt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.rwa.status === "ok" && a.rwa.issuerTokens.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-2">Other issuer tokens on {a.rwa.underlying} (CMC) — not interchangeable</p>
          <ul className="space-y-1 text-[12px]">
            {a.rwa.issuerTokens.map((t) => (
              <li key={t.cmcId} className="flex justify-between">
                <span>{t.symbol} · {t.issuerName ?? "unknown issuer"}</span>
                <span className="num text-muted">{t.priceUsd !== null ? fmtUsd(String(t.priceUsd)) : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Lending({ a }: { a: AssetIntel }) {
  return (
    <Panel title="Lending venues" badge={<CapabilityBadge status={a.aave.listed ? "read-only" : "unavailable"} />}>
      {a.aave.listed ? (
        <div className="space-y-2 text-[12.5px]">
          <p>
            <span className="text-violet">Aave V4 · Equities Hub (Base)</span> lists <b>{a.aave.symbol}</b> in the MAG7 spoke.
          </p>
          <p className="text-muted">{a.aave.note}</p>
          <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 font-mono text-[11px] text-faint">
            <dt>Hub</dt><dd className="truncate">{a.aave.hub}</dd>
            <dt>Spoke</dt><dd className="truncate">{a.aave.spoke}</dd>
            <dt>Feed</dt><dd className="truncate">{a.aave.feed}</dd>
          </dl>
          <a href={a.aave.source.file} target="_blank" rel="noreferrer noopener" className="inline-block text-[11.5px] text-ice">Aave address book @ {a.aave.source.commit.slice(0, 8)} →</a>
          <p className="text-[11.5px] text-amber">Borrowing is not offered: caps, LTV, reserve state and your eligibility are unverified.</p>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">{a.aave.note}</p>
      )}
    </Panel>
  );
}

function Dex({ a }: { a: AssetIntel }) {
  return (
    <Panel title="On-chain DEX liquidity" badge={<CapabilityBadge status={a.dex.status === "ok" ? "live-verified" : "unavailable"} />}>
      {a.dex.status === "ok" ? (
        <div className="space-y-2 text-[12.5px]">
          <div className="flex justify-between"><span className="text-faint">DEX liquidity</span><span className="num">{fmtUsd(a.dex.liquidityUsd, { compact: true })}</span></div>
          <div className="flex justify-between"><span className="text-faint">DEX price</span><span className="num">{fmtUsd(a.dex.priceUsd)}</span></div>
          <ProvenanceChip p={a.dex.provenance} />
          <p className="text-[11px] text-faint">DEX pool liquidity is exit/swap context — it is not lending borrow liquidity.</p>
        </div>
      ) : (
        <Unavailable u={a.dex} />
      )}
    </Panel>
  );
}

function formatSupply(raw: string, decimals: number) {
  const n = BigInt(raw);
  const whole = n / 10n ** BigInt(decimals);
  return new Intl.NumberFormat("en-US").format(whole);
}

function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <p className="eyebrow">Resolving identity</p>
      <p className="mt-2 text-sm text-muted">Reading the contract on-chain, matching it to CMC by exact address, reading the protocol oracle…</p>
      <Link href="/" className="mt-4 inline-block text-xs text-ice">← Overview</Link>
    </div>
  );
}
