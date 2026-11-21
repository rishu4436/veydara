"use client";

import { useAccount, useChainId } from "wagmi";
import { useSession, useSiwe } from "@/lib/client/session";
import { shortAddr } from "@/lib/client/api";
import { Panel } from "./analysis";
import { CapabilityBadge } from "./badge";
import { ConnectOptions } from "./wallet-button";

export function AccountPanel() {
  const session = useSession();
  const { signIn, logout, unlink } = useSiwe();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const s = session.data;
  const linked = s?.wallets?.some((w) => address && w.address === address.toLowerCase());
  const err = (signIn.error ?? logout.error ?? unlink.error) as Error | null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Sign-In with Ethereum (EIP-4361)" badge={s?.authenticated ? <span className="rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 text-[11px] text-mint">Signed in</span> : <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Signed out</span>}>
        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-[13px] text-muted">Connect an injected EVM wallet to sign in. Signing in proves wallet ownership with a one-time server nonce; it never authorizes a transaction.</p>
            <ConnectOptions />
          </div>
        ) : (
          <div className="space-y-3 text-[13px]">
            <p>Connected wallet <span className="font-mono" data-testid="connected-address">{address}</span> <span className="text-faint">(chain {chainId})</span></p>
            {!s?.authenticated && (
              <button type="button" onClick={() => signIn.mutate(false)} disabled={signIn.isPending} className="rounded-lg border border-ice/50 px-3 py-1.5 text-ice disabled:opacity-40">{signIn.isPending ? "Waiting for signature…" : "Sign in with Ethereum"}</button>
            )}
            {s?.authenticated && !linked && (
              <button type="button" onClick={() => signIn.mutate(true)} disabled={signIn.isPending} className="rounded-lg border border-ice/50 px-3 py-1.5 text-ice disabled:opacity-40">{signIn.isPending ? "Waiting for signature…" : "Prove & link this wallet"}</button>
            )}
            {s?.authenticated && linked && <p className="text-mint">This wallet is proven and linked to your account.</p>}
          </div>
        )}
        {err && <p role="alert" className="mt-3 text-[12px] text-danger">{err.message}</p>}
        <ul className="mt-4 space-y-1 text-[11.5px] text-faint">
          <li>· Nonces are issued by the server, single-use, and expire after 5 minutes.</li>
          <li>· Session cookie: HttpOnly, SameSite=Strict, Secure (`__Host-`) over HTTPS, 1-hour lifetime; only its SHA-256 is stored.</li>
          <li>· Every mutating request needs a CSRF token bound to the session plus a same-origin check.</li>
          <li>· Smart-contract wallets on Base verify via ERC-1271/ERC-6492.</li>
        </ul>
      </Panel>

      <Panel title="Proven wallets">
        {s?.authenticated ? (
          <>
            <ul className="space-y-2 text-[12.5px]" aria-label="Proven wallets">
              {s.wallets?.map((w) => (
                <li key={w.address} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="font-mono">{shortAddr(w.address, 8)}</span>
                  <span className="text-[11px] text-faint">SIWE on chain {w.chainId} · {w.verifiedVia} · {new Date(w.linkedAt).toLocaleString()}</span>
                  {(s.wallets?.length ?? 0) > 1 && <button type="button" onClick={() => unlink.mutate(w.address)} className="text-[11px] text-muted hover:text-danger">unlink</button>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-faint">To add another wallet, switch accounts in your wallet and choose “Prove &amp; link this wallet”. Each wallet signs its own SIWE message; a wallet can belong to only one account.</p>
            <p className="mt-2 text-[11.5px] text-faint">Session expires {s.expiresAt ? new Date(s.expiresAt).toLocaleTimeString() : "—"}.</p>
            <button type="button" onClick={() => logout.mutate()} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-danger">Sign out</button>
          </>
        ) : (
          <p className="text-[13px] text-muted">Sign in to persist Guardian policies and alerts and to sign fork plans with your own wallet.</p>
        )}
      </Panel>

      <Panel title="Signing capabilities" className="lg:col-span-2">
        <ul className="space-y-2 text-[12.5px]">
          <li className="flex items-center gap-2"><CapabilityBadge status="fork-testnet" /> Your wallet can sign verified plans on the local Base fork (chain 31337) in the <a href="/fork" className="text-ice">Fork Lab</a>.</li>
          <li className="flex items-center gap-2" data-testid="mainnet-signing"><CapabilityBadge status="unavailable" /> Mainnet signing (Base 8453) is disabled in this release. No screen asks your wallet to send a mainnet transaction.</li>
        </ul>
        {s && <p className="mt-3 text-[11.5px] text-faint">Persistence: {s.store.kind} — {s.store.detail}</p>}
      </Panel>
    </div>
  );
}
