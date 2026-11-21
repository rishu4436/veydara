"use client";

import { useEffect, useState } from "react";
import { useConnect } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useVeydaraWallet } from "@/lib/client/wallet-context";
import { shortAddr } from "@/lib/client/api";
import { I } from "./icons";

export function WalletButton() {
  const { active, disconnectAll, select, evmAddress, solAddress } = useVeydaraWallet();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:border-faint">
        <I.wallet />
        {active ? (
          <span className="flex items-center gap-2">
            <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">{active.chain}</span>
            <span className="font-mono text-[12px]">{shortAddr(active.address)}</span>
            {active.mode === "watch" && <span className="text-[10px] text-amber">watch</span>}
          </span>
        ) : (
          <span>Connect</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-line bg-raised p-3 shadow-2xl">
          <ConnectOptions onDone={() => setOpen(false)} />
          {(evmAddress || solAddress) && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="eyebrow mb-2">Active view</p>
              <div className="flex gap-2">
                {evmAddress && <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => select("base")}>Base {shortAddr(evmAddress)}</button>}
                {solAddress && <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => select("solana")}>Solana {shortAddr(solAddress)}</button>}
              </div>
            </div>
          )}
          {active && (
            <button type="button" onClick={() => { disconnectAll(); setOpen(false); }} className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-danger">
              Disconnect all &amp; forget watch address
            </button>
          )}
          <p className="mt-3 text-[11px] leading-4 text-faint">Sign-in uses a SIWE message (no transaction). Transactions are only ever requested on the local fork (chain 31337); mainnet signing is disabled.</p>
        </div>
      )}
    </div>
  );
}

export function ConnectOptions({ onDone }: { onDone?: () => void }) {
  const { connectors, connect, isPending, error } = useConnect();
  const sol = useWallet();
  const { select } = useVeydaraWallet();
  const injected = connectors[0];
  const [hasEvm, setHasEvm] = useState(false);
  useEffect(() => setHasEvm("ethereum" in window), []);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={!injected || isPending || !hasEvm}
        onClick={() => injected && connect({ connector: injected }, { onSuccess: () => { select("base"); onDone?.(); } })}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 text-sm disabled:opacity-50"
        title={hasEvm ? undefined : "No injected EVM wallet detected in this browser"}
      >
        <span>Browser wallet · Base</span>
        <span className="text-[11px] text-faint">{hasEvm ? (isPending ? "Confirm in wallet…" : "EVM") : "not detected"}</span>
      </button>
      <div className="rounded-xl border border-line bg-surface p-2">
        <p className="px-1 pb-1 text-[11px] text-faint">Solana (Wallet Standard)</p>
        {sol.wallets.length === 0 && <p className="px-1 text-xs text-muted">No Solana wallet detected in this browser.</p>}
        {sol.wallets.map((w) => (
          <button
            key={w.adapter.name}
            type="button"
            onClick={async () => {
              sol.select(w.adapter.name);
              try {
                await w.adapter.connect();
                select("solana");
                onDone?.();
              } catch {
                /* user rejected */
              }
            }}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-raised"
          >
            <span>{w.adapter.name}</span>
            <span className="text-[11px] text-faint">{w.readyState}</span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error.message.split("\n")[0]}</p>}
    </div>
  );
}
