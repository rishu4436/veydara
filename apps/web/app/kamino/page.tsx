import { PageHeader } from "@/components/page-header";
import { KaminoView } from "@/components/kamino-view";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Discover · Kamino Lend (Solana)" title="Tokenized equities on Solana, read straight from the program." sub="The verified Kamino xStocks market loaded with the official klend SDK: reserve risk parameters, caps, APYs and oracle prices, plus any wallet's obligations. Read-only — VEYDARA builds no Solana transactions." />
      <KaminoView />
    </div>
  );
}
