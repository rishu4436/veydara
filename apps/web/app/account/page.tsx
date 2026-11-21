import { PageHeader } from "@/components/page-header";
import { AccountPanel } from "@/components/account-panel";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Platform · Account" title="Prove your wallets. Keep your guardrails." sub="Sign-In with Ethereum creates a short-lived session. Link several wallets, each with its own ownership proof. Guardian policies, alerts and fork proofs persist to Postgres when DATABASE_URL is set, otherwise to a local JSON file." />
      <AccountPanel />
    </div>
  );
}
