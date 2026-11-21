/**
 * Stage 5 — simulation on the fork, inside an anvil snapshot that is ALWAYS reverted.
 * Each step is first eth_call'ed (to capture a decoded revert) and then applied with
 * the fork's own unlocked test account so later steps see earlier effects. Nothing
 * persists; the real run happens only after the human-readable preview is confirmed.
 */
import type { Address, Hex, PublicClient } from "viem";
import { readAaveV4Position } from "@veydara/protocols";
import { rpc } from "./fork";
import { decodeRevert, type DecodedRevert } from "./revert";
import type { RouteStep } from "./route";
import type { FreshState } from "./state";

export interface SimStep { index: number; kind: string; ok: boolean; gasUsed: string | null; revert: DecodedRevert | null }
export interface SimulationResult {
  ok: boolean;
  steps: SimStep[];
  firstRevert: (DecodedRevert & { stepIndex: number }) | null;
  /** Spoke-reported health after the full route (null if it reverted or no debt). */
  healthFactorWadAfter: string | null;
  suppliedAfter: Record<number, string>;
  debtAfter: Record<number, string>;
  snapshotReverted: boolean;
}

export async function waitReceipt(client: PublicClient, hash: Hex) {
  for (let i = 0; i < 80; i++) {
    const r = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 150));
  }
  throw new Error(`no receipt for ${hash}`);
}

export async function simulateOnFork(client: PublicClient, account: Address, route: RouteStep[], s: FreshState): Promise<SimulationResult> {
  const snap = (await rpc(client, "evm_snapshot")) as string;
  const steps: SimStep[] = [];
  let firstRevert: SimulationResult["firstRevert"] = null;
  let hfAfter: string | null = null;
  const suppliedAfter: Record<number, string> = {};
  const debtAfter: Record<number, string> = {};
  let reverted = false;
  try {
    for (const st of route) {
      try {
        await client.call({ account, to: st.to, data: st.data });
      } catch (e) {
        const rv = decodeRevert(e);
        steps.push({ index: st.index, kind: st.kind, ok: false, gasUsed: null, revert: rv });
        firstRevert = { ...rv, stepIndex: st.index };
        break;
      }
      const hash = (await rpc(client, "eth_sendTransaction", [{ from: account, to: st.to, data: st.data }])) as Hex;
      const rc = await waitReceipt(client, hash);
      steps.push({ index: st.index, kind: st.kind, ok: rc.status === "success", gasUsed: rc.gasUsed.toString(), revert: null });
      if (rc.status !== "success") {
        firstRevert = { name: "Reverted in simulation", args: [], selector: null, raw: null, message: "transaction reverted inside the snapshot", stepIndex: st.index };
        break;
      }
    }
    if (!firstRevert) {
      const bn = await client.getBlockNumber();
      const pos = await readAaveV4Position(client, account, { ...s.market, blockNumber: bn.toString() });
      hfAfter = pos.account.borrowCount === "0" ? null : pos.account.healthFactorWad;
      pos.reserves.forEach((r) => {
        suppliedAfter[r.reserveId] = r.supplied;
        debtAfter[r.reserveId] = r.debt;
      });
    }
  } finally {
    reverted = Boolean(await rpc(client, "evm_revert", [snap]));
  }
  return { ok: firstRevert === null, steps, firstRevert, healthFactorWadAfter: hfAfter, suppliedAfter, debtAfter, snapshotReverted: reverted };
}
