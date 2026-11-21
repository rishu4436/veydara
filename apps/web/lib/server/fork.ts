/**
 * Server glue for the Fork Lab. All writes are delegated to @veydara/execution,
 * which re-checks the fork guard (loopback, chain 31337, anvil fork of Base) at
 * every stage. Private keys never leave this process and are never serialized.
 */
import { join } from "node:path";
import { formatUnits, getAddress, parseEther, parseUnits, toHex, type Address } from "viem";
import {
  executePrepared, forkClient, fundFromHolder, inspectFork, listRecords, loadForkAccounts, prepareIntent, rpc, walletBegin, walletFinish,
  type ExecutionRecord, type ForkAccounts, type ForkInfo, type FundingRecord, type Prepared, type Stage, type SubmittedTx, type WalletSigningRequest,
} from "@veydara/execution";
import { store } from "./store";
import { AAVE_V4_BASE_FEEDS, ERC20_ABI, POLICY } from "@veydara/protocols";
import { serverEnv } from "./env";
import { repoRoot } from "./dataset";

const g = globalThis as unknown as { __forkPrepared?: Map<string, { at: number; p: Prepared; funding: FundingRecord[]; userId: string | null; walletStages?: Stage[] }>; __forkFunding?: Map<string, FundingRecord[]> };
const prepared = (g.__forkPrepared ??= new Map());
const pendingFunding = (g.__forkFunding ??= new Map());

export type ForkStatus =
  | { status: "ok"; fork: ForkInfo; accounts: { address: Address; eth: string; balances: Record<string, string> }[] }
  | { status: "unavailable"; code: string; reason: string; howTo: string };

const HOWTO = "Start a local fork with `pnpm fork` (anvil, chain 31337, 127.0.0.1:8545). VEYDARA never writes anywhere else.";

function ctx(accounts: ForkAccounts, ownedWallets: readonly string[] = []) {
  return { rpcUrl: serverEnv().FORK_RPC_URL, accounts, policyMinHfWad: POLICY.minHealthFactorWad, ownedWallets };
}

/** Proof Center persistence (Postgres or JSON fallback). Adds the "proof" stage. */
export async function saveForkRecord(rec: ExecutionRecord, userId: string | null) {
  if (!rec.stages.some((s) => s.id === "proof")) rec.stages.push({ id: "proof", status: "pass", ms: 0, detail: `record ${rec.id.slice(0, 8)} persisted to the ${store().info().kind} store for the Proof Center (${rec.outcome})` });
  await store().saveProof({ id: rec.id, kind: rec.kind, label: rec.label, outcome: rec.outcome, account: rec.account, userId, createdAt: rec.createdAt, record: rec });
}

function accounts(): ForkAccounts {
  return loadForkAccounts(serverEnv().FORK_ACCOUNTS_FILE);
}

export async function forkStatus(): Promise<ForkStatus> {
  const env = serverEnv();
  let fork: ForkInfo;
  try {
    fork = await inspectFork(env.FORK_RPC_URL);
  } catch (e) {
    return { status: "unavailable", code: (e as { code?: string }).code ?? "FORK_UNREACHABLE", reason: (e as Error).message.slice(0, 200), howTo: HOWTO };
  }
  let acc: ForkAccounts;
  try {
    acc = accounts();
  } catch (e) {
    return { status: "unavailable", code: "FORK_ACCOUNTS_MISSING", reason: `Fork is up but its anvil accounts file is not readable: ${(e as Error).message.slice(0, 120)}`, howTo: HOWTO };
  }
  const c = forkClient(env.FORK_RPC_URL);
  const syms = ["NVDAc", "USDC"] as const;
  const rows = await Promise.all(
    acc.addresses.slice(0, 3).map(async (a) => {
      const [eth, ...bals] = await Promise.all([c.getBalance({ address: a }), ...syms.map((s) => c.readContract({ address: getAddress(AAVE_V4_BASE_FEEDS[s]!.asset), abi: ERC20_ABI, functionName: "balanceOf", args: [a] }))]);
      return { address: a, eth: formatUnits(eth, 18), balances: Object.fromEntries(syms.map((s, i) => [s, formatUnits(bals[i] as bigint, s === "USDC" ? 6 : 8)])) };
    }),
  );
  return { status: "ok", fork, accounts: rows };
}

export async function fundAccount(account: string, symbol: string, amount: string, ownedWallets: readonly string[] = []): Promise<FundingRecord> {
  const acc = accounts();
  const who = getAddress(account);
  const isWallet = ownedWallets.some((w) => getAddress(w) === who);
  if (!acc.addresses.includes(who) && !isWallet) throw new Error("Only this fork's anvil test accounts, or wallets you proved with Sign-In with Ethereum, can be funded on the fork.");
  if (isWallet) {
    // Gas money on the FORK only (anvil_setBalance); never touches Base.
    const c = forkClient(serverEnv().FORK_RPC_URL);
    if ((await c.getBalance({ address: who })) < parseEther("0.1")) await rpc(c, "anvil_setBalance", [who, toHex(parseEther("1"))]);
  }
  const feed = AAVE_V4_BASE_FEEDS[symbol];
  if (!feed) throw new Error(`Unknown MAG7 asset ${symbol}`);
  const dec = symbol === "USDC" ? 6 : 8;
  const raw = parseUnits(amount, dec);
  if (raw <= 0n) throw new Error("amount must be > 0");
  const rec = await fundFromHolder(serverEnv().FORK_RPC_URL, forkClient(serverEnv().FORK_RPC_URL), getAddress(feed.asset), who, raw);
  pendingFunding.set(who, [...(pendingFunding.get(who) ?? []), rec]);
  return rec;
}

/** Prepared view sent to the browser (no FreshState internals beyond the summary). */
export function publicPrepared(p: Prepared) {
  return { id: p.id, createdAt: p.createdAt, fork: p.fork, intent: p.intent, route: p.route, verdict: p.verdict, simulation: p.simulation, preview: p.preview, stages: p.stages, blockedReason: p.blockedReason, healthBefore: p.before?.position.account.healthFactorWad ?? null };
}

export async function prepare(intent: unknown, session: { userId: string; wallets: string[] } | null) {
  const owned = session?.wallets ?? [];
  const p = await prepareIntent(ctx(accounts(), owned), intent);
  const now = Date.now();
  for (const [k, v] of prepared) if (now - v.at > 15 * 60_000) prepared.delete(k);
  const funding = p.intent ? (pendingFunding.get(p.intent.account) ?? []) : [];
  prepared.set(p.id, { at: now, p, funding, userId: session?.userId ?? null });
  if (!p.preview?.readyToSign) {
    // Blocked runs are evidence too: record them so the Proof Center shows what was refused and why.
    const rec = await executePrepared(ctx(accounts(), owned), p, { funding });
    await saveForkRecord(rec, session?.userId ?? null);
  }
  return publicPrepared(p);
}

export async function execute(previewId: string, previewHash: string): Promise<ExecutionRecord> {
  const hit = prepared.get(previewId);
  if (!hit) throw new Error("Preview expired or unknown — prepare again.");
  if (hit.p.preview?.previewHash !== previewHash) throw new Error("Preview hash mismatch — refusing to sign something you did not review.");
  if (hit.p.intent?.signer === "wallet") throw new Error("This preview is for your wallet to sign — VEYDARA never signs for it.");
  prepared.delete(previewId);
  const rec = await executePrepared(ctx(accounts()), hit.p, { funding: hit.funding });
  if (hit.p.intent) pendingFunding.delete(hit.p.intent.account);
  await saveForkRecord(rec, hit.userId);
  return rec;
}

/** Wallet signer, step 1: freshness re-check, then return the exact previewed steps for the wallet (chain 31337). */
export async function beginWallet(previewId: string, previewHash: string, session: { userId: string; wallets: string[] }): Promise<{ request: WalletSigningRequest; stages: Stage[] } | { record: ExecutionRecord }> {
  const hit = prepared.get(previewId);
  if (!hit) throw new Error("Preview expired or unknown — prepare again.");
  if (hit.p.preview?.previewHash !== previewHash) throw new Error("Preview hash mismatch — refusing to hand the wallet something you did not review.");
  if (hit.userId !== session.userId || !hit.p.intent || !session.wallets.some((w) => getAddress(w) === hit.p.intent!.account)) throw new Error("This preview belongs to a different signed-in account.");
  const r = await walletBegin(ctx(accounts(), session.wallets), hit.p, hit.funding);
  if (!r.ok) {
    prepared.delete(previewId);
    await saveForkRecord(r.record, session.userId);
    return { record: r.record };
  }
  hit.walletStages = r.stages;
  hit.at = Date.now();
  return { request: r.request, stages: r.stages };
}

/** Wallet signer, step 2: verify what the wallet actually sent against the preview, then receipts → reconcile → proof. */
export async function finishWallet(previewId: string, submitted: SubmittedTx[], session: { userId: string; wallets: string[] }): Promise<ExecutionRecord> {
  const hit = prepared.get(previewId);
  if (!hit?.walletStages) throw new Error("No wallet signing session for this preview — begin again.");
  if (hit.userId !== session.userId) throw new Error("This preview belongs to a different signed-in account.");
  prepared.delete(previewId);
  const rec = await walletFinish(ctx(accounts(), session.wallets), hit.p, hit.walletStages, submitted, hit.funding);
  if (hit.p.intent) pendingFunding.delete(hit.p.intent.account);
  await saveForkRecord(rec, session.userId);
  return rec;
}

export async function proofRecords(): Promise<(ExecutionRecord & { origin: "local-run" | "committed-evidence" })[]> {
  const local = (await store().listProofs(200)).filter((p) => p.kind === "fork-execution").map((p) => ({ ...(p.record as ExecutionRecord), origin: "local-run" as const }));
  const committed = listRecords(join(repoRoot(), "fixtures/fork")).map((r) => ({ ...r, origin: "committed-evidence" as const }));
  return [...local, ...committed];
}
