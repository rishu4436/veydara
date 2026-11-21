import { PageHeader } from "@/components/page-header";
import { PillarStatus, Roadmap } from "@/components/pillar-status";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Guardian" title="Monitoring, off by default." sub="Guardian is monitor-only by design and currently has no active monitors, so no alerts can fire. Automated execution is disabled and will stay disabled until a real, constrained authorization mechanism exists." />
      <PillarStatus pillar="guardian" />
      <Roadmap items={[{ phase: "Phase 5", text: "Opt-in monitors, deduplicated alerts, quiet hours" },{ phase: "Phase 5", text: "Policies, kill switch and emergency center (allowance revocation)" },]} />
    </div>
  );
}
