/**
 * Server glue for the Fork Lab. All writes are delegated to @veydara/execution,
 * which re-checks the fork guard (loopback, chain 31337, anvil fork of Base) at
 * every stage. Private keys never leave this process and are never serialized.
 */
import { join } from "node:path";
import { formatUnits, getAddress, parseUnits, type Address } from "viem";
import {
  executePrepared, forkClient, fundFromHolder, inspectFork, listRecords, loadForkAccounts, prepareIntent, saveRecord,
  type ExecutionRecord, type ForkAccounts, type ForkInfo, type FundingRecord, type Prepared,
} from "@veydara/execution";
import { AAVE_V4_BASE_FEEDS, ERC20_ABI, POLICY } from "@veydara/protocols";
import { serverEnv } from "./env";
import { repoRoot } from "./dataset";

const g = globalThis as unknown as { __forkPrepared?: Map<string, { at: number; p: Prepared; funding: FundingRecord[] }>; __forkFunding?: Map<string, FundingRecord[]> };
const prepared = (g.__forkPrepared ??= new Map());
const pendingFunding = (g.__forkFunding ??= new Map());

export type ForkStatus =
  | { status: "ok"; fork: ForkInfo; accounts: { address: Address; eth: string; balances: Record<string, string> }[] }
  | { status: "unavailable"; code: string; reason: string; howTo: string };

const HOWTO = "Start a local fork with `pnpm fork` (anvil, chain 31337, 127.0.0.1:8545). VEYDARA never writes anywhere else.";

function ctx(accounts: ForkAccounts) {
  return { rpcUrl: serverEnv().FORK_RPC_URL, accounts, policyMinHfWad: POLICY.minHealthFactorWad };
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

export async function fundAccount(account: string, symbol: string, amount: string): Promise<FundingRecord> {
  const acc = accounts();
  const who = getAddress(account);
  if (!acc.addresses.includes(who)) throw new Error("Only this fork's anvil-generated test accounts can be funded.");
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

export async function prepare(intent: unknown) {
  const p = await prepareIntent(ctx(accounts()), intent);
  const now = Date.now();
  for (const [k, v] of prepared) if (now - v.at > 15 * 60_000) prepared.delete(k);
  const funding = p.intent ? (pendingFunding.get(p.intent.account) ?? []) : [];
  prepared.set(p.id, { at: now, p, funding });
  if (!p.preview?.readyToSign) {
    // Blocked runs are evidence too: record them so the Proof Center shows what was refused and why.
    const rec = await executePrepared(ctx(accounts()), p, { funding });
    saveRecord(serverEnv().FORK_RECORDS_DIR, rec);
  }
  return publicPrepared(p);
}

export async function execute(previewId: string, previewHash: string): Promise<ExecutionRecord> {
  const hit = prepared.get(previewId);
  if (!hit) throw new Error("Preview expired or unknown — prepare again.");
  if (hit.p.preview?.previewHash !== previewHash) throw new Error("Preview hash mismatch — refusing to sign something you did not review.");
  prepared.delete(previewId);
  const rec = await executePrepared(ctx(accounts()), hit.p, { funding: hit.funding });
  if (hit.p.intent) pendingFunding.delete(hit.p.intent.account);
  saveRecord(serverEnv().FORK_RECORDS_DIR, rec);
  return rec;
}

export function proofRecords(): (ExecutionRecord & { origin: "local-run" | "committed-evidence" })[] {
  const local = listRecords(serverEnv().FORK_RECORDS_DIR).map((r) => ({ ...r, origin: "local-run" as const }));
  const committed = listRecords(join(repoRoot(), "fixtures/fork")).map((r) => ({ ...r, origin: "committed-evidence" as const }));
  return [...local, ...committed];
}
