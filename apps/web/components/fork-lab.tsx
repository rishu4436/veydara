"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { ExecutionRecord, Prepared, FundingRecord } from "@veydara/execution";
import type { AaveMarket } from "@veydara/protocols";
import { getJson, shortAddr } from "@/lib/client/api";
import { Panel } from "./analysis";
import { ForkTag, PositionDiff, RecordCard, StageList } from "./fork-ui";
import { useForkWallet } from "./fork-wallet";
import { CapabilityBadge } from "./badge";
import { useSession } from "@/lib/client/session";
import { authFetch } from "@/lib/client/auth-fetch";

type Status =
  | { status: "ok"; fork: { chainId: number; forkBlockNumber: string; upstreamHost: string; currentBlock: string; rpcHost: string; network: string | null }; accounts: { address: string; eth: string; balances: Record<string, string> }[] }
  | { status: "unavailable"; code: string; reason: string; howTo: string };
type PreparedView = Pick<Prepared, "id" | "fork" | "intent" | "route" | "verdict" | "simulation" | "preview" | "stages" | "blockedReason">;
type ActionRow = { kind: "supply" | "enableCollateral" | "borrow" | "repay" | "withdraw"; symbol: string; amount: string };

const PRESETS: { label: string; actions: ActionRow[]; fund?: { symbol: string; amount: string } }[] = [
  { label: "1 · Supply 1 NVDAc, use as collateral, borrow 30 USDC", fund: { symbol: "NVDAc", amount: "1" }, actions: [{ kind: "supply", symbol: "NVDAc", amount: "1" }, { kind: "enableCollateral", symbol: "NVDAc", amount: "" }, { kind: "borrow", symbol: "USDC", amount: "30" }] },
  { label: "2 · Partial repay 10 USDC", actions: [{ kind: "repay", symbol: "USDC", amount: "10" }] },
  { label: "3 · Withdraw 0.2 NVDAc", actions: [{ kind: "withdraw", symbol: "NVDAc", amount: "0.2" }] },
  { label: "Policy test · borrow 45 USDC (HF would drop below 1.25)", actions: [{ kind: "borrow", symbol: "USDC", amount: "45" }] },
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  try {
    return await authFetch<T>(url, { body });
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new Error(code ? `${code}: ${(e as Error).message}` : (e as Error).message);
  }
}

function toBase(amount: string, decimals: number): string {
  const [w, f = ""] = amount.trim().split(".");
  if (!/^\d+$/.test(w || "0") || !/^\d*$/.test(f) || f.length > decimals) throw new Error(`invalid amount "${amount}" (max ${decimals} decimals)`);
  return (BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}

export function ForkBanner({ s }: { s: Status }) {
  if (s.status !== "ok") return null;
  return (
    <div role="note" className="flex flex-wrap items-center gap-2 rounded-xl border border-violet/50 bg-violet/10 px-4 py-2.5 text-[12.5px]">
      <ForkTag />
      <span>Local anvil fork · chain {s.fork.chainId} · Base state at block {s.fork.forkBlockNumber} (via {s.fork.upstreamHost}) · now at fork block {s.fork.currentBlock}. Test accounts and balances exist only on this fork. Nothing here touches Base mainnet.</span>
    </div>
  );
}

export function ForkLab() {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["fork-status"], queryFn: () => getJson<Status>("/api/fork/status"), refetchInterval: 15_000 });
  const mk = useQuery({ queryKey: ["aave-market"], queryFn: () => getJson<{ market: AaveMarket }>("/api/aave/market"), staleTime: 30_000 });
  const [account, setAccount] = useState<string | null>(null);
  const [signer, setSigner] = useState<"anvil-test-account" | "wallet">("anvil-test-account");
  const [walletStep, setWalletStep] = useState<string | null>(null);
  const wallet = useForkWallet();
  const session = useSession();
  const walletProven = Boolean(wallet.address && session.data?.wallets?.some((w) => w.address === wallet.address!.toLowerCase()));
  const [rows, setRows] = useState<ActionRow[]>(PRESETS[0]!.actions);
  const [label, setLabel] = useState(PRESETS[0]!.label);
  const [fundSym, setFundSym] = useState("NVDAc");
  const [fundAmt, setFundAmt] = useState("1");
  const [prepared, setPrepared] = useState<PreparedView | null>(null);
  const [ack, setAck] = useState(false);
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const s = st.data;
  const anvilAcct = account ?? (s?.status === "ok" ? s.accounts[0]?.address ?? null : null);
  const acct = signer === "wallet" ? (walletProven ? wallet.address ?? null : null) : anvilAcct;
  const reserves = mk.data?.market.reserves ?? [];
  const bySym = (sym: string) => reserves.find((r) => r.symbol === sym);

  const fund = useMutation({
    mutationFn: () => postJson<{ funding: FundingRecord }>("/api/fork/fund", { account: acct, symbol: fundSym, amount: fundAmt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fork-status"] }),
  });
  const prep = useMutation({
    mutationFn: () => {
      const actions = rows.map((r) => {
        const res = bySym(r.symbol);
        if (!res) throw new Error(`unknown reserve ${r.symbol}`);
        return r.kind === "enableCollateral" ? { kind: r.kind, reserveId: res.reserveId } : { kind: r.kind, reserveId: res.reserveId, amount: toBase(r.amount, res.decimals) };
      });
      return postJson<PreparedView>("/api/fork/prepare", { account: acct, actions, label, source: "manual", signer });
    },
    onMutate: () => { setErr(null); setRecord(null); setAck(false); setPrepared(null); },
    onSuccess: (p) => setPrepared(p),
    onError: (e) => setErr((e as Error).message),
  });
  const exec = useMutation({
    mutationFn: () =>
      prepared!.intent?.signer === "wallet"
        ? wallet.signPreview(prepared!.id, prepared!.preview!.previewHash, (i, n) => setWalletStep(`Wallet: confirm step ${i + 1} of ${n} on chain 31337…`))
        : postJson<ExecutionRecord>("/api/fork/execute", { previewId: prepared!.id, previewHash: prepared!.preview!.previewHash }),
    onSettled: () => setWalletStep(null),
    onSuccess: (r) => { setRecord(r); setPrepared(null); qc.invalidateQueries({ queryKey: ["fork-status"] }); qc.invalidateQueries({ queryKey: ["proof-records"] }); },
    onError: (e) => setErr((e as Error).message),
  });

  if (st.isLoading) return <div className="card h-40 animate-pulse" aria-label="Checking local fork" />;
  if (!s || s.status !== "ok") {
    return (
      <Panel title="Local fork" badge={<span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Unavailable</span>}>
        <p className="text-[13px] text-muted">{s?.status === "unavailable" ? s.reason : (st.error as Error | null)?.message ?? "unknown"}</p>
        <p className="mt-2 text-[12px] text-faint">{s?.status === "unavailable" ? s.howTo : ""}</p>
        <p className="mt-2 text-[12px] text-faint">Recorded fork runs remain visible in the <Link href="/proof" className="text-ice">Proof Center</Link>.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <ForkBanner s={s} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="1 · Signer" badge={<ForkTag />}>
          <div role="radiogroup" aria-label="Signer" className="mb-3 flex flex-wrap gap-2 text-[12px]">
            <label className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 ${signer === "anvil-test-account" ? "border-ice/60" : "border-line text-muted"}`}><input type="radio" name="signer" checked={signer === "anvil-test-account"} onChange={() => setSigner("anvil-test-account")} /> Anvil test account</label>
            <label className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 ${signer === "wallet" ? "border-ice/60" : "border-line text-muted"}`}><input type="radio" name="signer" checked={signer === "wallet"} onChange={() => setSigner("wallet")} /> My wallet (SIWE-proven)</label>
          </div>
          {signer === "anvil-test-account" ? (
            <>
              <ul className="space-y-1.5 text-[12px]">
                {s.accounts.map((a) => (
                  <li key={a.address}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="acct" checked={anvilAcct === a.address} onChange={() => setAccount(a.address)} />
                      <span className="font-mono">{shortAddr(a.address, 6)}</span>
                      <span className="text-faint">{Number(a.eth).toFixed(0)} ETH · {a.balances.NVDAc} NVDAc · {a.balances.USDC} USDC (fork)</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-faint">Generated by anvil from a fresh random mnemonic at fork start; keys stay in a 0600 file on this machine and are never sent to the browser.</p>
            </>
          ) : (
            <div className="space-y-2 text-[12px]" data-testid="wallet-signer">
              {!wallet.address ? (
                <p className="text-muted">Connect a wallet, then <Link href="/account" className="text-ice">sign in with Ethereum</Link>.</p>
              ) : !walletProven ? (
                <p className="text-amber">Wallet {shortAddr(wallet.address)} is connected but not proven. <Link href="/account" className="text-ice">Sign in / link it</Link> first — the fork pipeline only accepts SIWE-proven wallets.</p>
              ) : (
                <>
                  <p>Signing as <span className="font-mono">{wallet.address}</span> — proven with SIWE. VEYDARA never sees your key.</p>
                  <p className="flex flex-wrap items-center gap-2">
                    Wallet chain: <span className={`font-mono ${wallet.onFork ? "text-violet" : "text-amber"}`}>{wallet.chainId}</span>
                    {!wallet.onFork && <button type="button" onClick={() => wallet.ensureForkChain().catch((e) => setErr((e as Error).message))} className="rounded-md border border-violet/50 px-2 py-0.5 text-violet">Switch / add VEYDARA fork (31337)</button>}
                  </p>
                </>
              )}
              <p className="flex items-center gap-2 text-[11px] text-faint"><CapabilityBadge status="unavailable" /> Mainnet signing is disabled — the wallet is only ever asked to sign on chain 31337.</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="eyebrow">Fund on fork</span>
            <select aria-label="Asset to fund" value={fundSym} onChange={(e) => setFundSym(e.target.value)} className="rounded border border-line bg-surface px-2 py-1">{["NVDAc", "AAPLc", "GOOGLc", "MSFTc", "USDC"].map((x) => <option key={x}>{x}</option>)}</select>
            <input aria-label="Amount to fund" value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} className="w-20 rounded border border-line bg-transparent px-2 py-1 text-right" />
            <button type="button" disabled={!acct || fund.isPending} onClick={() => fund.mutate()} className="rounded-lg border border-violet/50 px-3 py-1 text-violet disabled:opacity-40">{fund.isPending ? "Funding…" : "Fund (impersonate holder)"}</button>
          </div>
          {fund.data && <p className="mt-2 text-[11.5px] text-muted"><ForkTag /> moved {fundAmt} {fundSym} from existing holder {shortAddr(fund.data.funding.donor)} ({fund.data.funding.donorKind}) · tx <span className="font-mono">{shortAddr(fund.data.funding.txHash, 8)}</span></p>}
          {fund.error && <p className="mt-2 text-[11.5px] text-danger">{(fund.error as Error).message}</p>}
        </Panel>

        <Panel title="2 · Intent (Aave V4 MAG7 Spoke)">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => { setRows(p.actions); setLabel(p.label); if (p.fund) { setFundSym(p.fund.symbol); setFundAmt(p.fund.amount); } }} className={`rounded-md border px-2 py-1 text-left text-[11.5px] ${label === p.label ? "border-ice/60 text-fg" : "border-line text-muted hover:text-fg"}`}>{p.label}</button>
            ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="w-4 text-faint">{i + 1}</span>
                <select aria-label={`Action ${i + 1} kind`} value={r.kind} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as ActionRow["kind"] } : x)))} className="rounded border border-line bg-surface px-2 py-1">{["supply", "enableCollateral", "borrow", "repay", "withdraw"].map((k) => <option key={k}>{k}</option>)}</select>
                <select aria-label={`Action ${i + 1} reserve`} value={r.symbol} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, symbol: e.target.value } : x)))} className="rounded border border-line bg-surface px-2 py-1">{reserves.map((x) => <option key={x.reserveId}>{x.symbol}</option>)}</select>
                {r.kind !== "enableCollateral" && <input aria-label={`Action ${i + 1} amount`} value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="w-24 rounded border border-line bg-transparent px-2 py-1 text-right" />}
                <button type="button" aria-label={`Remove action ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-faint hover:text-danger">×</button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setRows([...rows, { kind: "supply", symbol: "NVDAc", amount: "1" }])} className="mt-2 text-[11.5px] text-ice underline">add action</button>
          <div className="mt-4">
            <button type="button" disabled={!acct || !rows.length || prep.isPending} onClick={() => prep.mutate()} className="rounded-lg border border-ice/50 px-3 py-1.5 text-[12.5px] text-ice disabled:opacity-40">{prep.isPending ? "Validating, simulating…" : "Prepare: validate → verify → simulate → preview"}</button>
          </div>
          {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
        </Panel>
      </div>

      {prepared && (
        <Panel title="3 · Preview" badge={<ForkTag />}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              {prepared.preview && (
                <>
                  <p className="text-[12px] text-faint">{prepared.preview.chainLabel}</p>
                  <ol className="mt-3 space-y-1.5 text-[13px]">
                    {prepared.preview.lines.map((l) => <li key={l.index}><span className="text-faint">{l.index + 1}.</span> {l.text} <span className="text-[11px] text-faint">· {l.functionName} → {shortAddr(l.to)}{l.gasInSimulation ? ` · ${l.gasInSimulation} gas in simulation` : ""}</span></li>)}
                  </ol>
                  <p className="mt-3 text-[13px]">Health factor: <span className="num">{prepared.preview.healthFactor.before}</span> → <span className="num">{prepared.preview.healthFactor.afterVerifier}</span> (verifier) / <span className="num">{prepared.preview.healthFactor.afterSimulation}</span> (fork simulation)</p>
                  {prepared.preview.warnings.length > 0 && <ul className="mt-2 space-y-1 text-[12px] text-danger">{prepared.preview.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
                  <ul className="mt-2 space-y-0.5 text-[11px] text-faint">{prepared.preview.notes.map((n) => <li key={n}>· {n}</li>)}</ul>
                  <p className="mt-2 font-mono text-[10.5px] text-faint">preview hash {prepared.preview.previewHash}</p>
                </>
              )}
              {prepared.preview?.readyToSign ? (
                <div className="mt-4 space-y-2">
                  <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {prepared.intent?.signer === "wallet" ? "I reviewed this preview. My wallet will sign each step on the local fork (chain 31337) only." : "I reviewed this preview. Sign with the anvil test key and send to the local fork only."}</label>
                  <button type="button" disabled={!ack || exec.isPending} onClick={() => exec.mutate()} className="rounded-lg border border-violet/60 bg-violet/10 px-4 py-2 text-[13px] text-violet disabled:opacity-40">{exec.isPending ? walletStep ?? "Signing & sending on fork…" : prepared.intent?.signer === "wallet" ? "Sign with my wallet on fork" : "Sign & send on fork"}</button>
                </div>
              ) : (
                <p className="mt-4 rounded-lg border border-amber/40 bg-amber/5 p-3 text-[12.5px] text-amber">Not signable: {prepared.blockedReason}. This refusal was recorded in the Proof Center.</p>
              )}
            </div>
            <div className="space-y-4">
              <StageList stages={prepared.stages} />
              {prepared.verdict && (
                <details><summary className="cursor-pointer text-[12px] text-ice">Verifier checks ({prepared.verdict.checks.filter((c) => c.pass).length}/{prepared.verdict.checks.length} pass)</summary>
                  <ul className="mt-2 space-y-0.5 text-[11.5px]">{prepared.verdict.checks.map((c, i) => <li key={i}><span className={c.pass ? "text-mint" : "text-danger"}>{c.pass ? "✓" : "✗"}</span> {c.name} <span className="text-faint">— {c.detail}</span></li>)}</ul>
                </details>
              )}
              <details><summary className="cursor-pointer text-[12px] text-ice">Typed route calldata ({prepared.route.length} steps)</summary>
                <ul className="mt-2 space-y-1 font-mono text-[10.5px] text-muted">{prepared.route.map((r) => <li key={r.index} className="break-all">{r.index + 1}. {r.functionName}({r.args.join(", ")}) → {r.to}<br />{r.data}</li>)}</ul>
              </details>
            </div>
          </div>
        </Panel>
      )}

      {record && (
        <section className="space-y-3" aria-label="Execution result">
          <h2 className="eyebrow">4 · Result — recorded in the <Link href="/proof" className="text-ice">Proof Center</Link></h2>
          <RecordCard rec={record} open />
          <div className="card p-5"><p className="eyebrow mb-3">Before → after (on fork)</p><PositionDiff rec={record} /></div>
        </section>
      )}
    </div>
  );
}
