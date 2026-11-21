"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { AddressBar, ArenaView, useAaveAddress } from "@/components/aave-views";
import { IntentEngine } from "@/components/intent-engine";

function Inner() {
  const [addr, setAddr] = useAaveAddress();
  return (
    <>
      <AddressBar value={addr} onChange={setAddr} note="Solvers use your existing Aave V4 collateral plus eligible tokenized equities in the wallet (what-if supply), at block-pinned balances." />
      {addr ? <><IntentEngine address={addr} /><ArenaView address={addr} showFutures={false} /></> : <p className="card p-5 text-[13px] text-muted">Enter a Base address to run the arena.</p>}
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Execute · Solver Arena" title="Competing plans, one independent verifier." sub="Four solvers propose USDC borrow plans against your collateral on the Aave V4 Equities Hub. A separate verifier recomputes health with exact rational arithmetic and checks caps, liquidity, reserve state, wallet balances and VEYDARA's HF ≥ 1.25 policy. Nothing is executed." />
      <Suspense><Inner /></Suspense>
    </div>
  );
}
