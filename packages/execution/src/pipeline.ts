/**
 * VEYDARA fork execution pipeline:
 *   validate → fork guard → fresh state → typed route → independent verifier → fork simulation
 *   → human-readable preview  ‖  (confirm)  → freshness re-check → signing → sending → receipts
 *   → reconcile → Proof Center record.
 * Every stage is recorded with its outcome. A failure stops the pipeline and is recorded honestly.
 */
import { randomUUID } from "node:crypto";
import type { PublicClient } from "viem";
import { AAVE_V4_BASE_SOURCE, AAVE_V4_SOURCE } from "@veydara/protocols";
import { forkClient, inspectFork, type ForkInfo } from "./fork";
import { validateIntent, type Intent } from "./intent";
import { readFreshState, summarise, type FreshState, type PositionSummary } from "./state";
import { buildRoute, type RouteStep } from "./route";
import { verifyRoute, type RouteVerdict } from "./verify-route";
import { simulateOnFork, type SimulationResult } from "./simulate";
import { buildPreview, hfText, routeHash, type Preview } from "./preview";
import { signAndSend, type TxRecord } from "./execute";
import { reconcile, type Reconciliation } from "./reconcile";
import type { ForkAccounts } from "./accounts";
import type { FundingRecord } from "./fund";

export type StageId = "validate" | "fork-guard" | "fresh-state" | "route" | "verifier" | "simulation" | "preview" | "freshness-recheck" | "signing" | "sending" | "receipts" | "reconcile" | "proof";
export interface Stage { id: StageId; status: "pass" | "fail" | "skipped"; ms: number; detail: string }

export interface PipelineContext {
  rpcUrl: string;
  accounts: ForkAccounts;
  policyMinHfWad: bigint;
  /** Wallets the signed-in user proved with SIWE (for signer "wallet"). */
  ownedWallets?: readonly string[];
}

export interface Prepared {
  id: string;
  createdAt: string;
  fork: ForkInfo | null;
  intent: Intent | null;
  before: FreshState | null;
  route: RouteStep[];
  verdict: RouteVerdict | null;
  simulation: SimulationResult | null;
  preview: Preview | null;
  stages: Stage[];
  blockedReason: string | null;
}

export interface ExecutionRecord {
  kind: "fork-execution";
  label: "FORK";
  /** Absent on records made before wallet signing existed (= anvil test account). */
  signer?: "anvil-test-account" | "wallet";
  id: string;
  createdAt: string;
  drill: boolean;
  fork: ForkInfo | null;
  account: string | null;
  intent: Intent | null;
  route: RouteStep[];
  verdict: RouteVerdict | null;
  simulation: SimulationResult | null;
  preview: Preview | null;
  funding: FundingRecord[];
  txs: TxRecord[];
  before: PositionSummary | null;
  after: PositionSummary | null;
  reconciliation: Reconciliation | null;
  outcome: "executed" | "reverted" | "blocked" | "incomplete";
  outcomeDetail: string;
  stages: Stage[];
  sources: { abi: typeof AAVE_V4_SOURCE; addresses: typeof AAVE_V4_BASE_SOURCE };
}

export async function timed<T>(stages: Stage[], id: StageId, fn: () => Promise<{ value: T; ok: boolean; detail: string }>): Promise<T | null> {
  const t = Date.now();
  try {
    const r = await fn();
    stages.push({ id, status: r.ok ? "pass" : "fail", ms: Date.now() - t, detail: r.detail });
    return r.ok ? r.value : (r.value ?? null);
  } catch (e) {
    stages.push({ id, status: "fail", ms: Date.now() - t, detail: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function prepareIntent(ctx: PipelineContext, raw: unknown): Promise<Prepared> {
  const p: Prepared = { id: randomUUID(), createdAt: new Date().toISOString(), fork: null, intent: null, before: null, route: [], verdict: null, simulation: null, preview: null, stages: [], blockedReason: null };
  const st = p.stages;
  const stop = (reason: string) => {
    p.blockedReason = reason;
    return p;
  };
  p.fork = await timed(st, "fork-guard", async () => {
    const f = await inspectFork(ctx.rpcUrl);
    return { value: f, ok: true, detail: `anvil chain ${f.chainId} @ block ${f.currentBlock}, forked from ${f.upstreamHost} at ${f.forkBlockNumber}` };
  });
  if (!p.fork) return stop("Fork guard failed — no local Base fork is reachable.");
  const client: PublicClient = forkClient(ctx.rpcUrl);
  const v = await timed(st, "validate", async () => {
    const r = validateIntent(raw, { testAccounts: ctx.accounts.addresses, ownedWallets: ctx.ownedWallets, reserveCount: 255 });
    return { value: r, ok: r.ok, detail: r.ok ? `${r.intent!.actions.length} action(s) for ${r.intent!.signer === "wallet" ? "SIWE-proven wallet" : "anvil test account"} ${r.intent!.account}` : r.errors.join("; ") };
  });
  if (!v?.ok || !v.intent) return stop(`Validation failed: ${v?.errors.join("; ") ?? "invalid intent"}`);
  p.intent = v.intent;
  p.before = await timed(st, "fresh-state", async () => {
    const s = await readFreshState(client, v.intent!.account);
    const bad = v.intent!.actions.find((a) => a.reserveId >= s.market.reserves.length);
    return { value: s, ok: !bad, detail: bad ? `reserve ${bad.reserveId} not listed (Spoke has ${s.market.reserves.length})` : `block ${s.blockNumber}; ${s.market.reserves.length} reserves; Spoke HF ${hfText(s.position.account.healthFactorWad)}` };
  });
  if (!p.before) return stop("Could not read fresh fork state.");
  const before = p.before;
  p.route = (await timed(st, "route", async () => {
    const r = buildRoute(v.intent!, before);
    return { value: r, ok: r.length > 0, detail: r.map((x) => `${x.index + 1}. ${x.functionName}`).join(", ") };
  })) ?? [];
  p.verdict = await timed(st, "verifier", async () => {
    const r = verifyRoute(v.intent!, before, ctx.policyMinHfWad);
    return { value: r, ok: r.accepted, detail: r.accepted ? `all ${r.checks.length} checks pass` : `${r.checks.filter((c) => !c.pass).length} check(s) failed: ${r.checks.filter((c) => !c.pass).map((c) => c.name).join("; ")}` };
  });
  if (p.verdict?.accepted) {
    p.simulation = await timed(st, "simulation", async () => {
      const r = await simulateOnFork(client, v.intent!.account, p.route, before);
      return { value: r, ok: r.ok && r.snapshotReverted, detail: r.ok ? `${r.steps.length} step(s) succeeded in a reverted snapshot; Spoke HF after = ${hfText(r.healthFactorWadAfter)}` : `reverted at step ${(r.firstRevert?.stepIndex ?? 0) + 1}: ${r.firstRevert?.message}` };
    });
  } else st.push({ id: "simulation", status: "skipped", ms: 0, detail: "verifier rejected the route" });
  p.preview = buildPreview(p.fork, before, p.route, p.verdict ?? { accepted: false, checks: [], hfAfter: [], predicted: { healthFactorWad: null, reserves: [] }, policyMinHfWad: ctx.policyMinHfWad.toString() }, p.simulation);
  st.push({ id: "preview", status: p.preview.readyToSign ? "pass" : "fail", ms: 0, detail: p.preview.readyToSign ? `preview ${p.preview.previewHash.slice(0, 18)}… ready to sign` : p.preview.warnings.join(" | ") });
  if (!p.preview.readyToSign) return stop(p.preview.warnings[0] ?? "Not ready to sign.");
  return p;
}


export async function executePrepared(ctx: PipelineContext, p: Prepared, opts: { drill?: boolean; fixedGas?: bigint; funding?: FundingRecord[] } = {}): Promise<ExecutionRecord> {
  const stages = [...p.stages];
  const rec: ExecutionRecord = {
    kind: "fork-execution", label: "FORK", signer: p.intent?.signer ?? "anvil-test-account", id: p.id, createdAt: new Date().toISOString(), drill: Boolean(opts.drill), fork: p.fork, account: p.intent?.account ?? null, intent: p.intent,
    route: p.route, verdict: p.verdict, simulation: p.simulation, preview: p.preview, funding: opts.funding ?? [], txs: [], before: p.before ? summarise(p.before) : null, after: null, reconciliation: null,
    outcome: "blocked", outcomeDetail: p.blockedReason ?? "", stages, sources: { abi: AAVE_V4_SOURCE, addresses: AAVE_V4_BASE_SOURCE },
  };
  const ready = p.preview?.readyToSign || (opts.drill && p.intent && p.before && p.route.length);
  if (!ready || !p.intent || !p.before) {
    stages.push({ id: "signing", status: "skipped", ms: 0, detail: `not signed: ${p.blockedReason ?? "preview not ready"}` });
    return rec;
  }
  const client = forkClient(ctx.rpcUrl);
  // Freshness re-check: rebuild the route from current fork state; it must hash to what was previewed.
  const fresh = await timed(stages, "freshness-recheck", async () => {
    await inspectFork(ctx.rpcUrl);
    const s = await readFreshState(client, p.intent!.account);
    const r = buildRoute(p.intent!, s);
    const same = routeHash(p.fork!.chainId, s.account, r) === p.preview!.previewHash;
    return { value: s, ok: same, detail: same ? `route unchanged at block ${s.blockNumber}` : "state changed since preview (route differs) — re-preview required" };
  });
  if (!fresh) {
    rec.outcomeDetail = "State changed since the preview; nothing was signed.";
    return rec;
  }
  if (p.intent.signer === "wallet") {
    stages.push({ id: "signing", status: "skipped", ms: 0, detail: "signer is the user's wallet — use walletBegin/walletFinish" });
    rec.outcomeDetail = "Wallet-signed intents are never signed by the server.";
    return rec;
  }
  const key = ctx.accounts.keyFor(p.intent.account);
  if (!key) {
    stages.push({ id: "signing", status: "fail", ms: 0, detail: "no anvil test key for this account" });
    rec.outcomeDetail = "No fork test key available.";
    return rec;
  }
  const t = Date.now();
  let sent: Awaited<ReturnType<typeof signAndSend>>;
  try {
    sent = await signAndSend({ rpcUrl: ctx.rpcUrl, client, privateKey: key, route: p.route, fixedGas: opts.fixedGas });
  } catch (e) {
    stages.push({ id: "signing", status: "fail", ms: Date.now() - t, detail: e instanceof Error ? e.message : String(e) });
    rec.outcomeDetail = "Signing/sending refused.";
    return rec;
  }
  stages.push({ id: "signing", status: sent.txs.some((x) => x.signedChainId !== null) ? "pass" : "fail", ms: 0, detail: `${sent.txs.filter((x) => x.signedChainId !== null).length} tx signed locally, chain id 31337` });
  stages.push({ id: "sending", status: sent.txs.some((x) => x.hash) ? "pass" : "fail", ms: Date.now() - t, detail: `${sent.txs.filter((x) => x.hash).length} tx sent to the fork RPC ${p.fork?.rpcHost}` });
  await finishWithTxs(client, p, rec, sent.txs);
  return rec;
}

/** Shared tail: receipts → after-state → reconcile, for both anvil-signed and wallet-signed runs. */
export async function finishWithTxs(client: PublicClient, p: Prepared, rec: ExecutionRecord, txs: TxRecord[]): Promise<void> {
  const stages = rec.stages;
  rec.txs = txs;
  const failed = txs.find((x) => x.status !== "success");
  const incomplete = txs.length < p.route.length && !failed;
  stages.push({ id: "receipts", status: failed || incomplete ? "fail" : "pass", ms: 0, detail: failed ? `step ${failed.stepIndex + 1} ${failed.status}: ${failed.revert?.message ?? ""}` : incomplete ? `${txs.length}/${p.route.length} receipts — route not completed` : `${txs.length} receipt(s), all status 1` });
  const after = await readFreshState(client, p.intent!.account).catch(() => null);
  rec.after = after ? summarise(after) : null;
  if (failed) {
    rec.outcome = failed.status === "reverted" ? "reverted" : "incomplete";
    rec.outcomeDetail = `${failed.status === "not-sent" ? "Not sent (rejected before broadcast)" : "Reverted on the fork"} at step ${failed.stepIndex + 1} (${failed.kind}): ${failed.revert?.message ?? "unknown"}. Later steps were not sent.`;
    stages.push({ id: "reconcile", status: "skipped", ms: 0, detail: "route did not complete" });
  } else if (incomplete) {
    rec.outcome = "incomplete";
    rec.outcomeDetail = `Only ${txs.length} of ${p.route.length} steps were submitted.`;
    stages.push({ id: "reconcile", status: "skipped", ms: 0, detail: "route did not complete" });
  } else if (after && p.verdict && p.before) {
    rec.reconciliation = reconcile(p.verdict, p.before, after);
    stages.push({ id: "reconcile", status: rec.reconciliation.ok ? "pass" : "fail", ms: 0, detail: `${rec.reconciliation.checks.filter((c) => c.pass).length}/${rec.reconciliation.checks.length} checks; Spoke HF ${hfText(rec.reconciliation.healthFactor.spoke)}` });
    rec.outcome = "executed";
    rec.outcomeDetail = `All ${txs.length} transaction(s) mined on the fork.`;
  }
}
