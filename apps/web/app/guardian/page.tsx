"use client";

import { Suspense, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { AddressBar, useAaveAddress } from "@/components/aave-views";
import { AlertCenter, EmergencyCenter, RadarCard, useRadar } from "@/components/guardian";
import { guardian, useGuardian } from "@/lib/client/guardian-store";

function Inner() {
  const [addr, setAddr] = useAaveAddress();
  const g = useGuardian();
  useEffect(() => {
    if (addr && !g.watch.some((w) => w.toLowerCase() === addr.toLowerCase())) guardian.setWatch([addr, ...g.watch]);
  }, [addr, g.watch]);
  const watch = g.watch;
  const radar = useRadar(watch, g.policies);
  return (
    <>
      <AddressBar value={addr} onChange={setAddr} note="Watched addresses are stored only in this browser (max 5). Guardian reads Aave V4 positions at a pinned block; it cannot move funds." />
      {watch.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="eyebrow">Watching</span>
          {watch.map((w) => (
            <span key={w} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 font-mono text-muted">
              <button type="button" onClick={() => setAddr(w)}>{w.slice(0, 6)}…{w.slice(-4)}</button>
              <button type="button" aria-label={`Stop watching ${w}`} onClick={() => guardian.setWatch(watch.filter((x) => x !== w))} className="text-faint hover:text-danger">×</button>
            </span>
          ))}
        </div>
      )}
      {radar.isLoading && <div className="card h-64 animate-pulse" aria-label="Computing risk radar" />}
      {radar.error && <p className="card p-5 text-sm text-danger">{(radar.error as Error).message}</p>}
      <div className="grid gap-6">
        {radar.data?.results.map((r) => (r.status === "ok" ? <RadarCard key={r.address} r={r} /> : <p key={r.address} className="card p-5 text-[12.5px] text-muted">{r.address}: unavailable · {r.reason}</p>))}
      </div>
      <AlertCenter addresses={watch} />
      {addr ? <EmergencyCenter address={addr} /> : <p className="card p-5 text-[13px] text-muted">Enter a Base address to open the emergency center.</p>}
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Guardian" title="Watch risk. Act only on purpose." sub="A risk radar for each watched Aave V4 position, an in-app alert center with monitor-only policies, and an emergency center to inspect positions, allowances and position managers. Revocations are prepared and simulated on the local fork only — VEYDARA never sends them." />
      <Suspense><Inner /></Suspense>
    </div>
  );
}
