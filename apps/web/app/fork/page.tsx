import { PageHeader } from "@/components/page-header";
import { ForkLab } from "@/components/fork-lab";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Execute · Fork Lab" title="Run verified plans on a local fork." sub="Validate → fresh state → typed route → independent verifier → fork simulation → human-readable preview → signing → sending → receipts → reconciliation → Proof Center record, against the real Aave V4 MAG7 Spoke state forked from Base. Only anvil-generated test accounts sign, on chain 31337. Nothing is ever sent to Base mainnet." />
      <ForkLab />
    </div>
  );
}
