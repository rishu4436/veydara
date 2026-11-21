"use client";

import { useVeydaraWallet } from "@/lib/client/wallet-context";
import { Holdings } from "@/components/holdings";
import { ConnectOptions } from "@/components/wallet-button";
import { WatchForm } from "@/components/watch-form";
import { PageHeader } from "@/components/page-header";

export default function OverviewPage() {
  const { active } = useVeydaraWallet();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Overview" title={active ? "Capital overview" : "Start from what you own."} sub={active ? (active.mode === "watch" ? "Watch-only view — read from public chain state; nothing can be signed." : "Connected wallet — balances read server-side from one pinned block.") : "Connect a wallet or watch any address. VEYDARA reads holdings on the chains you choose, identifies each exact token contract, and only goes deep when you open an asset."} />
      {active ? (
        <Holdings wallet={active} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section className="card p-6">
            <p className="eyebrow mb-3">Connect</p>
            <ConnectOptions />
          </section>
          <section className="card p-6">
            <WatchForm />
            <div className="mt-6 border-t border-line pt-4 text-[12px] leading-5 text-muted">
              <p className="mb-1 text-fg">What happens on connect</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>One block is pinned; native + verified-registry balances are read.</li>
                <li>Each holding is matched by exact chain + contract — tickers are never trusted.</li>
                <li>Unknown or suspicious tokens are quarantined and never valued.</li>
                <li>One batched CMC quote prices verified holdings. No candles, no deep analysis until you ask.</li>
              </ol>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
