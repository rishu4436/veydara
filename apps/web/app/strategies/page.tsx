import { PageHeader } from "@/components/page-header";
import { PillarStatus, Roadmap } from "@/components/pillar-status";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Execute · Strategies" title="Intents, solvers and guarded execution." sub="No route is executable in this release. Capital intents, the three solvers and the independent verifier land in Phase 3; a single Aave V4 deposit/borrow/repay vertical slice follows in Phase 4 on a clearly labeled Base fork. Mainnet broadcast requires explicit owner approval." />
      <PillarStatus pillar="execute" />
      <Roadmap items={[{ phase: "Phase 3", text: "Capital Intent Engine with typed, bounded constraints" },{ phase: "Phase 3", text: "Solver Arena (cost, risk, flexibility) + deterministic verifier with rejection reasons" },{ phase: "Phase 4", text: "Aave V4 Equities Hub fork execution with genuine fork receipts" },]} />
    </div>
  );
}
