import { PageHeader } from "@/components/page-header";
import { PillarStatus, Roadmap } from "@/components/pillar-status";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Parallel Futures" title="Portfolio Twin — scenarios, not predictions." sub="The scenario engine (hold / sell / borrow / repay under price shocks, re-open gaps and rate curves) is Phase 3. It will use deterministic, unit-tested formulas and label every assumption." />
      <PillarStatus pillar="alpha" />
      <Roadmap items={[{ phase: "Phase 3", text: "Deterministic capital engine + scenario sliders" },{ phase: "Phase 3", text: "Market re-open gap stress tied to the RWA Risk Clock" },]} />
    </div>
  );
}
