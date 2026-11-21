import { PageHeader } from "@/components/page-header";
import { PillarStatus, Roadmap } from "@/components/pillar-status";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Positions" title="Open positions, read from protocols." sub="Protocol position reads (Aave V4 spoke positions, health factor) are not implemented yet, so no positions are displayed — none are invented. Wallet balances are on the Overview." />
      <PillarStatus pillar="execute" />
      <Roadmap items={[{ phase: "Phase 3", text: "Read Aave V4 MAG7 spoke positions for connected addresses" },{ phase: "Phase 3", text: "Borrowing Power Calculator with protocol-specific LTV / liquidation math" },]} />
    </div>
  );
}
