/**
 * Fork-only "what would happen if the owner sent this" simulation, used by the
 * Emergency Center to prepare revocations. Runs inside an anvil snapshot that is
 * always reverted; the owner is impersonated ONLY on the local fork. Nothing is
 * signed by the owner and nothing is broadcast to Base.
 */
import { getAddress, toHex, type Address, type Hex } from "viem";
import { forkClient, inspectFork, rpc, type ForkInfo } from "./fork";
import { decodeRevert, type DecodedRevert } from "./revert";
import { waitReceipt } from "./simulate";

export interface OwnerSimResult {
  label: "FORK";
  fork: ForkInfo;
  ok: boolean;
  gasUsed: string | null;
  forkTxHash: string | null;
  revert: DecodedRevert | null;
  check: { name: string; before: string; after: string; pass: boolean } | null;
  snapshotReverted: boolean;
}

export async function simulateAsOwner(rpcUrl: string, owner: string, to: Address, data: Hex, check?: { name: string; read: () => Promise<string>; expect: string }): Promise<OwnerSimResult> {
  const fork = await inspectFork(rpcUrl);
  const client = forkClient(rpcUrl);
  const who = getAddress(owner);
  const snap = (await rpc(client, "evm_snapshot")) as string;
  let res: Omit<OwnerSimResult, "snapshotReverted" | "fork" | "label"> = { ok: false, gasUsed: null, forkTxHash: null, revert: null, check: null };
  try {
    const before = check ? await check.read() : "";
    await rpc(client, "anvil_impersonateAccount", [who]);
    await rpc(client, "anvil_setBalance", [who, toHex(10n ** 17n)]);
    try {
      await client.call({ account: who, to, data });
      const hash = (await rpc(client, "eth_sendTransaction", [{ from: who, to, data }])) as Hex;
      const rc = await waitReceipt(client, hash);
      const after = check ? await check.read() : "";
      res = { ok: rc.status === "success", gasUsed: rc.gasUsed.toString(), forkTxHash: hash, revert: null, check: check ? { name: check.name, before, after, pass: after === check.expect } : null };
    } catch (e) {
      res = { ...res, revert: decodeRevert(e) };
    }
    await rpc(client, "anvil_stopImpersonatingAccount", [who]);
  } finally {
    const reverted = Boolean(await rpc(client, "evm_revert", [snap]));
    (res as OwnerSimResult).snapshotReverted = reverted;
  }
  return { label: "FORK", fork, ...res, snapshotReverted: (res as OwnerSimResult).snapshotReverted };
}
