"use client";

import { useState } from "react";
import { fmtUsd } from "@/lib/client/api";
import { ProvenanceChip } from "./provenance";
import type { Provenance } from "@veydara/domain";

type Resp =
  | { status: "ok"; provenance: Provenance; assets: { rwaId: number; name: string; symbol: string; assetType: string; aggregate: { label: string; price: number | null }; issuerTokens: { symbol: string; issuerName: string | null; price: number | null; cmcId: number }[] }[] }
  | { status: "unavailable"; code: string; reason: string };

/** On-demand CMC RWA lookup (1 credit). Nothing is fetched until the user asks. */
export function RwaLookup() {
  const [sym, setSym] = useState("NVDA");
  const [res, setRes] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">CMC RWA catalogue</p>
          <p className="mt-1 text-[12.5px] text-muted">Aggregate tokenized price vs every issuer&apos;s token for one underlying (<code className="font-mono text-[11.5px]">/v5/real-world-assets/quotes/latest</code>).</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              const r = await fetch(`/api/rwa?symbol=${encodeURIComponent(sym)}`);
              setRes((await r.json()) as Resp);
            } finally {
              setLoading(false);
            }
          }}
        >
          <input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} aria-label="Underlying ticker" className="w-28 rounded-lg border border-line bg-base px-2 py-1.5 font-mono text-[12.5px] outline-none focus:border-ice" />
          <button type="submit" disabled={loading} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px]">{loading ? "Loading…" : "Look up"}</button>
        </form>
      </div>
      {res?.status === "unavailable" && <p className="mt-4 text-[12.5px] text-muted">Unavailable · {res.reason} <span className="font-mono text-[10.5px] text-faint">[{res.code}]</span></p>}
      {res?.status === "ok" && (
        <div className="mt-4 space-y-4">
          <ProvenanceChip p={res.provenance} />
          {res.assets.map((a) => (
            <div key={a.rwaId}>
              <p className="text-[13px]">{a.name} <span className="text-faint">· {a.assetType} · rwa_id {a.rwaId}</span></p>
              <p className="num mt-1 text-[12.5px] text-muted">{a.aggregate.label}: {a.aggregate.price !== null ? fmtUsd(String(a.aggregate.price)) : "—"}</p>
              <ul className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2">
                {a.issuerTokens.map((t) => (
                  <li key={t.cmcId} className="flex justify-between rounded-lg border border-line-soft px-3 py-1.5">
                    <span>{t.symbol} <span className="text-faint">· {t.issuerName ?? "unknown"}</span></span>
                    <span className="num">{t.price !== null ? fmtUsd(String(t.price)) : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
