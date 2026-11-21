"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/client/wagmi";
import { WalletProvider } from "@/lib/client/wallet-context";

const SOLANA_ENDPOINT = "https://api.mainnet-beta.solana.com";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        {/* Wallet Standard auto-detects installed Solana wallets; no adapters bundled. */}
        <ConnectionProvider endpoint={SOLANA_ENDPOINT}>
          <SolanaWalletProvider wallets={[]} autoConnect={false}>
            <WalletProvider>{children}</WalletProvider>
          </SolanaWalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
