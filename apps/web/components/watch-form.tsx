"use client";

import { useState } from "react";
import { useVeydaraWallet } from "@/lib/client/wallet-context";

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function WatchForm({ compact }: { compact?: boolean }) {
  const { setWatch } = useVeydaraWallet();
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (EVM.test(v)) setWatch({ chain: "base", address: v }, remember);
    else if (SOL.test(v)) setWatch({ chain: "solana", address: v }, remember);
    else return setErr("Enter a Base (0x…) or Solana address.");
    setErr(null);
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="eyebrow block" htmlFor="watch">Watch-only address</label>
      <div className="flex gap-2">
        <input id="watch" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x… on Base, or a Solana address" spellCheck={false} autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-line bg-base px-3 py-2.5 font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-faint focus:border-ice" />
        <button type="submit" className="rounded-xl bg-fg px-4 text-sm font-medium text-base hover:opacity-90">Watch</button>
      </div>
      {!compact && (
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[var(--color-mint)]" />
          Remember on this device (stored locally only; off by default)
        </label>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
      {!compact && (
        <p className="pt-1 text-[11.5px] text-faint">
          No wallet handy?{" "}
          <button type="button" className="text-ice underline-offset-2 hover:underline" onClick={() => setWatch({ chain: "base", address: "0xa4d5947Eb727A052bae69C593FfC84247EC9864E" })}>
            Watch the Aave V4 Equities Hub contract
          </button>{" "}
          — a real protocol contract on Base holding tokenized equities (not a personal wallet).
        </p>
      )}
    </form>
  );
}
