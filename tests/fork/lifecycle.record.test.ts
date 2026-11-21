/**
 * Opt-in (VEYDARA_FORK_TESTS=1, needs `pnpm fork` running): runs the full Aave V4 MAG7
 * lifecycle on a LOCAL anvil fork of Base through the real pipeline and records every
 * run as Proof Center evidence in fixtures/fork/*.fork.json.
 *   1. supply 1 NVDAc → use as collateral → borrow 30 USDC
 *   2. partial repay 10 USDC
 *   3. withdraw 0.2 NVDAc
 *   4. a route the verifier rejects (borrow beyond policy) — blocked before signing
 *   5. revert drill: the same over-borrow force-sent with fixed gas — real reverted fork receipt, decoded
 * Accounts are anvil-generated; funding is fork-only impersonation of an existing holder.
 */
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { AAVE_V4_BASE_FEEDS, POLICY } from "@veydara/protocols";
import { executePrepared, forkClient, fundFromHolder, loadForkAccounts, prepareIntent, saveRecord, type ExecutionRecord } from "@veydara/execution";

const RPC = process.env.FORK_RPC_URL ?? "http://127.0.0.1:8545";
const FILE = process.env.FORK_ACCOUNTS_FILE ?? "/tmp/veydara-fork/anvil-accounts.json";
const OUT = "fixtures/fork";
const NVDAC = 5;
const USDC = 7;

describe("fork lifecycle (anvil, chain 31337)", () => {
  const accounts = loadForkAccounts(FILE);
  const ctx = { rpcUrl: RPC, accounts, policyMinHfWad: POLICY.minHealthFactorWad };
  const who = accounts.addresses[1]!;
  const client = forkClient(RPC);
  const records: ExecutionRecord[] = [];

  const run = async (label: string, actions: unknown[], opts: { drill?: boolean; fixedGas?: bigint; funding?: Awaited<ReturnType<typeof fundFromHolder>>[] } = {}) => {
    const p = await prepareIntent(ctx, { account: who, actions, label, source: opts.drill ? "revert-drill" : "lifecycle-preset" });
    const rec = await executePrepared(ctx, p, opts);
    saveRecord(OUT, rec);
    records.push(rec);
    return rec;
  };

  it("1. supply + collateral + borrow", { timeout: 120_000 }, async () => {
    const fund = await fundFromHolder(RPC, client, getAddress(AAVE_V4_BASE_FEEDS.NVDAc!.asset), who, 100_000_000n);
    const rec = await run("Lifecycle 1/3 — supply 1 NVDAc, enable collateral, borrow 30 USDC", [
      { kind: "supply", reserveId: NVDAC, amount: "100000000" },
      { kind: "enableCollateral", reserveId: NVDAC },
      { kind: "borrow", reserveId: USDC, amount: "30000000" },
    ], { funding: [fund] });
    expect(rec.outcome).toBe("executed");
    expect(rec.reconciliation?.ok).toBe(true);
  });

  it("2. partial repay", { timeout: 60_000 }, async () => {
    const rec = await run("Lifecycle 2/3 — partial repay 10 USDC", [{ kind: "repay", reserveId: USDC, amount: "10000000" }]);
    expect(rec.outcome).toBe("executed");
    expect(rec.reconciliation?.ok).toBe(true);
  });

  it("3. withdraw", { timeout: 60_000 }, async () => {
    const rec = await run("Lifecycle 3/3 — withdraw 0.2 NVDAc", [{ kind: "withdraw", reserveId: NVDAC, amount: "20000000" }]);
    expect(rec.outcome).toBe("executed");
    expect(rec.reconciliation?.ok).toBe(true);
  });

  it("4. verifier blocks an unsafe borrow before signing", { timeout: 60_000 }, async () => {
    const rec = await run("Blocked — borrow 45 USDC (protocol would allow HF≈1.12, VEYDARA policy floor is 1.25)", [{ kind: "borrow", reserveId: USDC, amount: "45000000" }]);
    expect(rec.outcome).toBe("blocked");
    expect(rec.txs).toHaveLength(0);
    const failed = rec.verdict!.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed.some((n) => n.includes("policy floor"))).toBe(true);
    expect(failed.some((n) => n.includes("(protocol)"))).toBe(false);
  });

  it("5. revert drill: force-send the over-borrow and decode the on-fork revert", { timeout: 60_000 }, async () => {
    const rec = await run("REVERT DRILL — force-send borrow 200 USDC with fixed gas (intentional)", [{ kind: "borrow", reserveId: USDC, amount: "200000000" }], { drill: true, fixedGas: 1_500_000n });
    expect(rec.outcome).toBe("reverted");
    expect(rec.txs[0]?.status).toBe("reverted");
    expect(rec.txs[0]?.revert?.name).toBe("HealthFactorBelowThreshold");
  });
});
