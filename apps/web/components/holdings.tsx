"use client";

import { CapitalConstellation } from "./constellation";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import type { PortfolioResponse, PricedHolding } from "@/lib/server/portfolio";
import { fmtUsd, getJson, shortAddr, timeAgo } from "@/lib/client/api";
import { IdentityBadge } from "./badge";
import { ProvenanceChip } from "./provenance";
import { I } from "./icons";
import type { ActiveWallet } from "@/lib/client/wallet-context";

export function Holdings({ wallet }: { wallet: NonNullable<ActiveWallet> }) {
  const [extra, setExtra] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ["portfolio", wallet.chain, wallet.address, extra.join(",")],
    queryFn: () => getJson<PortfolioResponse>(`/api/portfolio?chain=${wallet.chain}&address=${encodeURIComponent(wallet.address)}${extra.length ? `&tokens=${extra.join(",")}` : ""}`),
    staleTime: 60_000,
  });

  if (q.isLoading) return <ScanSkeleton chain={wallet.chain} />;
  if (q.error) return (
    <div className="card p-6">
      <p className="eyebrow mb-2 text-danger">Scan failed</p>
      <p className="text-sm text-muted">{(q.error as Error).message}</p>
      <p className="mt-2 text-xs text-faint">No balances are shown because none were read. Retry, or configure a dedicated RPC (BASE_RPC_URL / SOLANA_RPC_URL).</p>
      <button type="button" onClick={() => q.refetch()} className="mt-4 rounded-lg border border-line px-3 py-1.5 text-xs">Retry scan</button>
    </div>
  );
  const d = q.data!;
  return (
    <div className="space-y-6">
      <SummaryStrip d={d} wallet={wallet} onRefresh={() => q.refetch()} refreshing={q.isFetching} />
      {d.walletKind === "empty" && <EmptyWallet />}
      {d.walletKind === "quarantine-only" && <EmptyWallet note="Only unverified or suspicious tokens were found — they are quarantined below and not valued." />}
      {d.walletKind === "stablecoin-only" && <StablecoinOnly d={d} />}
      {d.walletKind === "has-assets" && (
        <>
          <ExposureBar holdings={d.holdings} />
          <CapitalConstellation d={d} chain={wallet.chain} address={wallet.address} />
          <div className="grid gap-3 lg:grid-cols-2">
            {d.holdings.map((h, i) => (
              <HoldingCard key={h.address} h={h} i={i} />
            ))}
          </div>
        </>
      )}
      {d.quarantined.length > 0 && <Quarantine items={d.quarantined} />}
      {wallet.chain === "base" && <AddToken onAdd={(a) => setExtra((x) => [...new Set([...x, a.toLowerCase()])])} />}
      <ul className="space-y-1 text-[11.5px] text-faint">
        {d.scan.coverage.notes.map((n) => (
          <li key={n}>· {n}</li>
        ))}
        {d.pricing.error && <li className="text-amber">· Pricing: {d.pricing.error}</li>}
      </ul>
    </div>
  );
}

function SummaryStrip({ d, wallet, onRefresh, refreshing }: { d: PortfolioResponse; wallet: NonNullable<ActiveWallet>; onRefresh: () => void; refreshing: boolean }) {
  return (
    <section className="card grid grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-4" aria-label="Portfolio summary">
      <Stat label="Priced value" value={fmtUsd(d.totals.pricedUsd)} hint={d.totals.unpricedCount ? `${d.totals.unpricedCount} verified holding(s) unpriced` : "All verified holdings priced"} big />
      <Stat label="Stablecoin cash" value={fmtUsd(d.totals.stableUsd)} hint="USDC/USDT at CMC market price" />
      <Stat label="Quarantined" value={String(d.quarantined.length)} hint="Unverified / spam — not valued" />
      <div className="bg-surface p-4">
        <p className="eyebrow">Scan</p>
        <p className="num mt-1 font-mono text-[13px]">{d.scan.blockNumber ? `block ${d.scan.blockNumber}` : `slot ${d.scan.slot}`}</p>
        <p className="mt-1 text-[11px] text-faint">
          {wallet.chain} · {shortAddr(d.scan.owner)} · {timeAgo(d.scan.scannedAt)}
        </p>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="mt-2 text-[11px] text-ice disabled:text-faint">{refreshing ? "Rescanning…" : "Rescan"}</button>
      </div>
    </section>
  );
}

function Stat({ label, value, hint, big }: { label: string; value: string; hint: string; big?: boolean }) {
  return (
    <div className="bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p className={`num mt-1 ${big ? "font-display text-[28px] leading-8" : "text-[20px]"}`}>{value}</p>
      <p className="mt-1 text-[11px] text-faint">{hint}</p>
    </div>
  );
}

function HoldingCard({ h, i }: { h: PricedHolding; i: number }) {
  const v = h.identity.verified;
  return (
    <motion.article initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.25 }} className="card group p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[22px] leading-7">{h.identity.display.symbol}</h3>
            <IdentityBadge status={h.identity.status} />
          </div>
          <p className="truncate text-[12.5px] text-muted">
            {h.identity.display.name}
            {v?.issuer ? ` · issued by ${v.issuer}` : ""}
          </p>
          {v?.underlying && v.assetClass === "tokenized-equity" && <p className="mt-1 text-[11.5px] text-faint">Underlying: {v.underlying.name} ({v.underlying.symbol}) — the token is a separate instrument.</p>}
        </div>
        <div className="text-right">
          <p className="num text-[18px]">{h.valueUsd ? fmtUsd(h.valueUsd) : "—"}</p>
          <p className="num font-mono text-[12px] text-muted">{h.formatted}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-2">
          {h.price ? (
            <>
              <span className="num text-muted">{fmtUsd(h.price.usd)}</span>
              <ProvenanceChip p={h.price.provenance} />
            </>
          ) : (
            <span className="text-amber" title={h.priceUnavailableReason ?? undefined}>Price unavailable</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {h.aaveListing && <span className="rounded-full border border-violet/40 px-2 py-0.5 text-[10.5px] text-violet" title="Listed in the official Aave V4 Base address book. Caps, LTV and your eligibility are not yet verified.">Aave V4 listed · eligibility unverified</span>}
          {h.address !== "native" && (
            <Link href={`/asset/${h.chain}/${h.address}`} className="inline-flex items-center gap-1 text-ice">
              {v?.assetClass === "tokenized-equity" ? "Collateral Passport" : "Research"} <I.chevron width={14} height={14} />
            </Link>
          )}
        </div>
      </div>
      {!h.price && h.priceUnavailableReason && <p className="mt-2 text-[11px] text-faint">{h.priceUnavailableReason}</p>}
    </motion.article>
  );
}

function ExposureBar({ holdings }: { holdings: PricedHolding[] }) {
  const priced = holdings.filter((h) => h.valueMicros);
  const total = priced.reduce((a, h) => a + BigInt(h.valueMicros!), 0n);
  if (total === 0n) return null;
  const groups = new Map<string, bigint>();
  for (const h of priced) {
    const k = h.identity.verified?.underlying?.symbol ?? h.identity.display.symbol;
    groups.set(k, (groups.get(k) ?? 0n) + BigInt(h.valueMicros!));
  }
  const rows = [...groups.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1));
  const palette = ["var(--color-mint)", "var(--color-ice)", "var(--color-violet)", "var(--color-amber)", "var(--color-muted)"];
  return (
    <section className="card p-5" aria-label="Exposure by underlying">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="eyebrow">Exposure by underlying</p>
        <p className="text-[11px] text-faint">Aggregated by canonical underlying; issuer tokens stay separate below</p>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={rows.map(([k, v]) => `${k} ${Number((v * 10000n) / total) / 100}%`).join(", ")}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ width: `${Number((v * 10000n) / total) / 100}%`, background: palette[i % palette.length] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
        {rows.map(([k, v], i) => (
          <li key={k} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
            <span>{k}</span>
            <span className="num text-muted">{(Number((v * 10000n) / total) / 100).toFixed(2)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StablecoinOnly({ d }: { d: PortfolioResponse }) {
  return (
    <section className="card relative overflow-hidden p-8 md:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-line-soft" aria-hidden />
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-line-soft" aria-hidden />
      <p className="eyebrow">Cash position</p>
      <p className="num mt-2 font-display text-[44px] leading-none">{fmtUsd(d.totals.stableUsd)}</p>
      <ul className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
        {d.holdings.map((h) => (
          <li key={h.address} className="num">
            {h.formatted} {h.identity.display.symbol}
          </li>
        ))}
      </ul>
      <h2 className="mt-10 max-w-lg font-display text-[28px] leading-9">Which token are you considering?</h2>
      <p className="mt-2 max-w-lg text-sm text-muted">Search to research it. VEYDARA doesn&apos;t push coins, pools or yields at a stablecoin wallet — research starts from what you ask about.</p>
      <button type="button" onClick={() => window.dispatchEvent(new Event("veydara:open-palette"))} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm hover:border-faint">
        <I.discover /> Search to research
      </button>
    </section>
  );
}

function EmptyWallet({ note }: { note?: string }) {
  return (
    <section className="card p-8 md:p-10">
      <p className="eyebrow">Nothing held here yet</p>
      <h2 className="mt-2 max-w-xl font-display text-[28px] leading-9">This address holds no verified assets on this chain.</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">{note ?? "No portfolio is invented for an empty wallet. You can still research any tokenized equity, issuer or contract."}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => window.dispatchEvent(new Event("veydara:open-palette"))} className="rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-base">Search assets</button>
        <Link href="/discover" className="rounded-xl border border-line px-4 py-2.5 text-sm">Browse verified tokenized equities</Link>
      </div>
    </section>
  );
}

function Quarantine({ items }: { items: PricedHolding[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card border-danger/30 p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="eyebrow text-danger">Quarantine</span>
          <span className="ml-3 text-sm text-muted">{items.length} token(s) isolated — no price, analysis or eligibility is assumed</span>
        </span>
        <I.chevron className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <ul className="mt-4 divide-y divide-line-soft">
          {items.map((h) => (
            <li key={h.address} className="py-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="font-mono">{h.identity.display.symbol}</span>
                  <IdentityBadge status={h.identity.status} />
                </span>
                <span className="num font-mono text-muted">{h.formatted}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-faint">{h.address}</p>
              <ul className="mt-1 text-[11.5px] text-muted">
                {h.identity.reasons.map((r) => (
                  <li key={r}>– {r}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddToken({ onAdd }: { onAdd: (a: string) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^0x[0-9a-fA-F]{40}$/.test(v.trim())) return setErr("Not a contract address");
        setErr(null);
        onAdd(v.trim());
        setV("");
      }}
    >
      <label htmlFor="addtoken" className="text-faint">Check a specific Base token contract:</label>
      <input id="addtoken" value={v} onChange={(e) => setV(e.target.value)} placeholder="0x…" className="w-72 rounded-lg border border-line bg-base px-2 py-1.5 font-mono outline-none focus:border-ice" />
      <button type="submit" className="rounded-lg border border-line px-3 py-1.5">Read balance</button>
      {err && <span className="text-danger">{err}</span>}
    </form>
  );
}

function ScanSkeleton({ chain }: { chain: string }) {
  return (
    <div className="card p-6" aria-busy="true">
      <p className="eyebrow">Reading {chain} balances…</p>
      <p className="mt-2 text-sm text-muted">Pinning one block, reading native + verified-registry balances, then requesting one batched CMC quote for verified holdings only.</p>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-raised">
        <motion.div className="h-full w-1/3 bg-ice/70" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} />
      </div>
    </div>
  );
}
