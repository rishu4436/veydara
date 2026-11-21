"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { AddressBar, FuturesTable, useAaveAddress } from "@/components/aave-views";
import type { ArenaResponse } from "@/lib/server/aave";
import { getJson } from "@/lib/client/api";

function Inner() {
  const [addr, setAddr] = useAaveAddress();
  const q = useQuery({ queryKey: ["arena", addr], queryFn: () => getJson<ArenaResponse>(`/api/strategy?address=${addr}`), enabled: Boolean(addr), staleTime: 30_000 });
  return (
    <>
      <AddressBar value={addr} onChange={setAddr} note="Scenarios run on your Aave V4 position plus eligible wallet holdings (what-if supply)." />
      {q.isLoading && <div className="card h-40 animate-pulse" />}
      {q.data && <p className="text-[12.5px] text-muted">Basis: {q.data.futuresBasis}</p>}
      {q.data && (q.data.futures.length ? <FuturesTable rows={q.data.futures} /> : <p className="card p-5 text-[13px] text-muted">{q.data.note}</p>)}
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Parallel Futures" title="Scenarios, not predictions." sub="Deterministic shocks — weekend gaps, crashes, a single-name collapse, a stablecoin wobble, doubled rates — applied to live, block-pinned Aave V4 state. Each assumption is written next to its result." />
      <Suspense><Inner /></Suspense>
    </div>
  );
}
