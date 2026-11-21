"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { AddressBar, MarketTable, PositionView, useAaveAddress } from "@/components/aave-views";

function Inner() {
  const [addr, setAddr] = useAaveAddress();
  return (
    <>
      <AddressBar value={addr} onChange={setAddr} note="Read-only: positions are read from the Aave V4 MAG7 spoke on Base at one pinned block. Your connected or watched Base wallet is used by default." />
      {addr ? <PositionView address={addr} /> : <p className="card p-5 text-[13px] text-muted">Enter a Base address, connect a wallet, or pick a public example above.</p>}
      <MarketTable />
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Positions" title="Open positions, read from the protocol." sub="Aave V4 Equities Hub on Base: real reserve parameters, your supplied collateral and debt, the Spoke's own health factor (independently recomputed), liquidation prices, and deterministic stress scenarios." />
      <Suspense><Inner /></Suspense>
    </div>
  );
}
