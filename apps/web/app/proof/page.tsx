import { PageHeader } from "@/components/page-header";
import { ProofCenter } from "@/components/proof-center";

export default function ProofPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Proof Center" title="Every number, traced." sub="Live capability matrix computed by the backend, the CMC credit ledger (expected vs actual credit_count per call, cache hits, de-duplicated and blocked calls), and the pinned sources behind every verified contract." />
      <ProofCenter />
    </div>
  );
}
