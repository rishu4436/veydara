import Link from "next/link";
import { BASE_TOKENS } from "@veydara/chains";
import { PageHeader } from "@/components/page-header";
import { PillarStatus, Roadmap } from "@/components/pillar-status";

export default function AlphaPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Alpha" title="Analysis on demand, never in bulk." sub="Charts, indicators and support/resistance zones run only for an asset you hold or open. The engine (SMA/EMA, Wilder RSI, MACD, ATR, volatility, pivots, Fibonacci, clustered S/R bands) is deterministic and fixture-tested; it refuses to run on missing or invented candles." />
      <section className="card p-5">
        <p className="eyebrow mb-3">Open an asset to analyse</p>
        <div className="flex flex-wrap gap-2">
          {BASE_TOKENS.filter((t) => t.assetClass === "tokenized-equity").map((t) => (
            <Link key={t.address} href={`/asset/base/${t.address}`} className="rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-ice">{t.symbol}</Link>
          ))}
        </div>
      </section>
      <PillarStatus pillar="alpha" />
      <Roadmap items={[{ phase: "Phase 2", text: "Multi-horizon thesis tabs (short/swing/long) with bull/neutral/bear conditions and invalidation, built from the indicator engine." }, { phase: "Phase 2", text: "Underlying vs token vs oracle chart overlay once RWA historical quotes are available with the hackathon key." }, { phase: "Phase 5", text: "Thesis drift snapshots and grounded Capital Copilot (deterministic tools only)." }]} />
    </div>
  );
}
