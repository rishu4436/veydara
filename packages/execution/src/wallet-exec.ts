/**
 * User-wallet signing on the fork. The server never holds or sees the wallet's key:
 *   walletBegin  → freshness re-check, then hand the browser the exact previewed steps (chain 31337 only)
 *   (browser)    → wallet switches/adds the local fork chain and signs + sends each step to the fork RPC
 *   walletFinish → verify each submitted tx on the fork (from / to / calldata / chainId / value match the
 *                  preview), receipts with decoded reverts, after-state, reconcile → Proof Center record.
 */
import { getAddress, type Hex } from "viem";
import { AAVE_V4_BASE_SOURCE, AAVE_V4_SOURCE } from "@veydara/protocols";
import { FORK_CHAIN_ID, forkClient, inspectFork } from "./fork";
import { buildRoute } from "./route";
import { readFreshState, summarise } from "./state";
import { routeHash } from "./preview";
import { decodeRevert } from "./revert";
import { waitReceipt } from "./simulate";
import { finishWithTxs, timed, type ExecutionRecord, type PipelineContext, type Prepared, type Stage } from "./pipeline";
import type { TxRecord } from "./execute";
import type { FundingRecord } from "./fund";

export interface WalletStep { index: number; kind: string; summary: string; to: Hex; data: Hex; value: "0x0"; chainId: typeof FORK_CHAIN_ID }
export interface WalletSigningRequest { previewId: string; previewHash: string; account: Hex; chainId: typeof FORK_CHAIN_ID; steps: WalletStep[] }
export interface SubmittedTx { stepIndex: number; hash: Hex | null; error?: string }

function baseRecord(p: Prepared, stages: Stage[], funding: FundingRecord[]): ExecutionRecord {
  return {
    kind: "fork-execution", label: "FORK", signer: "wallet", id: p.id, createdAt: new Date().toISOString(), drill: false, fork: p.fork, account: p.intent?.account ?? null, intent: p.intent,
    route: p.route, verdict: p.verdict, simulation: p.simulation, preview: p.preview, funding, txs: [], before: p.before ? summarise(p.before) : null, after: null, reconciliation: null,
    outcome: "blocked", outcomeDetail: p.blockedReason ?? "", stages, sources: { abi: AAVE_V4_SOURCE, addresses: AAVE_V4_BASE_SOURCE },
  };
}

export async function walletBegin(ctx: PipelineContext, p: Prepared, funding: FundingRecord[] = []): Promise<{ ok: true; request: WalletSigningRequest; stages: Stage[] } | { ok: false; record: ExecutionRecord }> {
  const stages = [...p.stages];
  const rec = baseRecord(p, stages, funding);
  if (!p.preview?.readyToSign || !p.intent || !p.before || p.intent.signer !== "wallet") {
    stages.push({ id: "signing", status: "skipped", ms: 0, detail: `not signed: ${p.blockedReason ?? "preview not ready for a wallet signer"}` });
    return { ok: false, record: rec };
  }
  const client = forkClient(ctx.rpcUrl);
  const fresh = await timed(stages, "freshness-recheck", async () => {
    await inspectFork(ctx.rpcUrl);
    const s = await readFreshState(client, p.intent!.account);
    const same = routeHash(p.fork!.chainId, s.account, buildRoute(p.intent!, s)) === p.preview!.previewHash;
    return { value: s, ok: same, detail: same ? `route unchanged at block ${s.blockNumber}; handing ${p.route.length} step(s) to the wallet` : "state changed since preview (route differs) — re-preview required" };
  });
  if (!fresh) {
    rec.outcomeDetail = "State changed since the preview; nothing was handed to the wallet.";
    return { ok: false, record: rec };
  }
  return {
    ok: true,
    stages,
    request: { previewId: p.id, previewHash: p.preview.previewHash, account: p.intent.account, chainId: FORK_CHAIN_ID, steps: p.route.map((s) => ({ index: s.index, kind: s.kind, summary: s.summary, to: s.to, data: s.data, value: "0x0", chainId: FORK_CHAIN_ID })) },
  };
}

export async function walletFinish(ctx: PipelineContext, p: Prepared, stagesAfterBegin: Stage[], submitted: SubmittedTx[], funding: FundingRecord[] = []): Promise<ExecutionRecord> {
  const stages = [...stagesAfterBegin];
  const rec = baseRecord(p, stages, funding);
  const client = forkClient(ctx.rpcUrl);
  await inspectFork(ctx.rpcUrl); // still the fork
  const account = getAddress(p.intent!.account);
  const txs: TxRecord[] = [];
  const t = Date.now();
  let mismatch: string | null = null;
  for (const step of p.route) {
    const sub = submitted.find((x) => x.stepIndex === step.index);
    const base: TxRecord = { stepIndex: step.index, kind: step.kind, summary: step.summary, status: "not-sent", hash: null, blockNumber: null, gasUsed: null, nonce: null, signedChainId: null, from: account, to: step.to, revert: null };
    if (!sub?.hash) {
      if (sub) txs.push({ ...base, revert: { name: "WalletDidNotSend", args: [], selector: null, raw: null, message: (sub.error ?? "the wallet did not submit this step").slice(0, 200) } });
      break;
    }
    const tx = await client.getTransaction({ hash: sub.hash }).catch(() => null);
    if (!tx) {
      mismatch = `step ${step.index + 1}: transaction ${sub.hash} is not on the fork`;
      break;
    }
    const problems = [
      getAddress(tx.from) !== account && `from ${tx.from} ≠ ${account}`,
      (!tx.to || getAddress(tx.to) !== getAddress(step.to)) && `to ${tx.to} ≠ ${step.to}`,
      tx.input.toLowerCase() !== step.data.toLowerCase() && "calldata differs from the preview",
      tx.chainId !== FORK_CHAIN_ID && `chainId ${tx.chainId} ≠ ${FORK_CHAIN_ID}`,
      tx.value !== 0n && `value ${tx.value} ≠ 0`,
    ].filter(Boolean);
    if (problems.length) {
      mismatch = `step ${step.index + 1}: ${problems.join("; ")}`;
      break;
    }
    const rc = await waitReceipt(client, sub.hash);
    const r: TxRecord = { ...base, status: rc.status === "success" ? "success" : "reverted", hash: sub.hash, blockNumber: rc.blockNumber.toString(), gasUsed: rc.gasUsed.toString(), nonce: tx.nonce, signedChainId: tx.chainId ?? null };
    if (rc.status !== "success") {
      try {
        await client.call({ account, to: step.to, data: step.data, blockNumber: rc.blockNumber - 1n });
        r.revert = { name: "Reverted (replay did not reproduce)", args: [], selector: null, raw: null, message: "Receipt status 0 but replaying at the parent block succeeded." };
      } catch (e) {
        r.revert = decodeRevert(e);
      }
      txs.push(r);
      break;
    }
    txs.push(r);
  }
  const signed = txs.filter((x) => x.hash).length;
  stages.push({ id: "signing", status: signed > 0 && !mismatch ? "pass" : "fail", ms: 0, detail: mismatch ? `refused: ${mismatch}` : `${signed} tx signed by the user's wallet on chain ${FORK_CHAIN_ID}; VEYDARA never saw a key` });
  stages.push({ id: "sending", status: signed > 0 && !mismatch ? "pass" : "fail", ms: Date.now() - t, detail: `${signed} tx sent by the wallet to the fork RPC; each verified against the preview (from/to/calldata/chainId/value)` });
  if (mismatch) {
    rec.txs = txs;
    rec.outcome = "incomplete";
    rec.outcomeDetail = `Submitted transaction did not match the reviewed preview (${mismatch}). Recorded, not reconciled.`;
    stages.push({ id: "receipts", status: "fail", ms: 0, detail: mismatch });
    return rec;
  }
  await finishWithTxs(client, p, rec, txs);
  return rec;
}
