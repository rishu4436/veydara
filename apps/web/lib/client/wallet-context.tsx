"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";

export type ActiveWallet = { chain: "base" | "solana"; address: string; mode: "connected" | "watch" } | null;

interface Ctx {
  active: ActiveWallet;
  watch: { chain: "base" | "solana"; address: string } | null;
  setWatch: (w: { chain: "base" | "solana"; address: string } | null, remember?: boolean) => void;
  select: (chain: "base" | "solana") => void;
  disconnectAll: () => void;
  evmAddress?: string;
  solAddress?: string;
}

const WalletCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "veydara.watch.v1";

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: evmAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const sol = useWallet();
  const solAddress = sol.publicKey?.toBase58();
  const [watch, setWatchState] = useState<Ctx["watch"]>(null);
  const [preferred, setPreferred] = useState<"base" | "solana" | "watch">("base");

  useEffect(() => {
    // Shareable watch-only links: /?watch=<address> (session only, never persisted).
    const w = new URLSearchParams(window.location.search).get("watch")?.trim();
    if (w && (/^0x[0-9a-fA-F]{40}$/.test(w) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w))) {
      setWatchState({ chain: w.startsWith("0x") ? "base" : "solana", address: w });
      setPreferred("watch");
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setWatchState(JSON.parse(raw));
    } catch {
      /* storage unavailable: watch-only stays session-scoped */
    }
  }, []);

  const setWatch = useCallback((w: Ctx["watch"], remember = false) => {
    setWatchState(w);
    if (w) setPreferred("watch");
    try {
      if (w && remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const active: ActiveWallet = useMemo(() => {
    if (preferred === "watch" && watch) return { ...watch, mode: "watch" };
    if (preferred === "solana" && solAddress) return { chain: "solana", address: solAddress, mode: "connected" };
    if (isConnected && evmAddress) return { chain: "base", address: evmAddress, mode: "connected" };
    if (solAddress) return { chain: "solana", address: solAddress, mode: "connected" };
    if (watch) return { ...watch, mode: "watch" };
    return null;
  }, [preferred, watch, solAddress, isConnected, evmAddress]);

  const disconnectAll = useCallback(() => {
    disconnect();
    void sol.disconnect().catch(() => undefined);
    setWatch(null);
  }, [disconnect, sol, setWatch]);

  return (
    <WalletCtx.Provider value={{ active, watch, setWatch, select: (c) => setPreferred(c), disconnectAll, evmAddress, solAddress }}>{children}</WalletCtx.Provider>
  );
}

export function useVeydaraWallet(): Ctx {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useVeydaraWallet outside WalletProvider");
  return c;
}
