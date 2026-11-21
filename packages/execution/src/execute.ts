/** Stages 7–9 — signing (local key, chain 31337 only), sending (fork RPC only), receipts with decoded reverts. */
import { createWalletClient, http, parseTransaction, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertLoopback, FORK_CHAIN_ID, forkChain, NotAForkError } from "./fork";
import { decodeRevert, type DecodedRevert } from "./revert";
import { waitReceipt } from "./simulate";
import type { RouteStep } from "./route";

export interface TxRecord {
  stepIndex: number;
  kind: string;
  summary: string;
  status: "success" | "reverted" | "not-sent";
  hash: string | null;
  blockNumber: string | null;
  gasUsed: string | null;
  nonce: number | null;
  signedChainId: number | null;
  from: string;
  to: string;
  revert: DecodedRevert | null;
}

export async function signAndSend(opts: { rpcUrl: string; client: PublicClient; privateKey: Hex; route: RouteStep[]; fixedGas?: bigint }): Promise<{ txs: TxRecord[]; stoppedAt: number | null }> {
  assertLoopback(opts.rpcUrl);
  if ((await opts.client.getChainId()) !== FORK_CHAIN_ID) throw new NotAForkError("refusing to sign: RPC is not the fork");
  const account = privateKeyToAccount(opts.privateKey);
  const wallet = createWalletClient({ account, chain: forkChain, transport: http(opts.rpcUrl, { timeout: 30_000 }) });
  const txs: TxRecord[] = [];
  for (const st of opts.route) {
    const base: TxRecord = { stepIndex: st.index, kind: st.kind, summary: st.summary, status: "not-sent", hash: null, blockNumber: null, gasUsed: null, nonce: null, signedChainId: null, from: account.address, to: st.to, revert: null };
    let request;
    try {
      request = await wallet.prepareTransactionRequest({ to: st.to, data: st.data, chain: forkChain, ...(opts.fixedGas ? { gas: opts.fixedGas } : {}) });
    } catch (e) {
      txs.push({ ...base, revert: decodeRevert(e) });
      return { txs, stoppedAt: st.index };
    }
    const signed = await wallet.signTransaction(request as Parameters<typeof wallet.signTransaction>[0]);
    const parsed = parseTransaction(signed);
    if (parsed.chainId !== FORK_CHAIN_ID) throw new NotAForkError(`signed tx carries chain id ${parsed.chainId}; refusing to send`);
    const hash = await opts.client.sendRawTransaction({ serializedTransaction: signed });
    const rc = await waitReceipt(opts.client, hash);
    const rec: TxRecord = { ...base, status: rc.status === "success" ? "success" : "reverted", hash, blockNumber: rc.blockNumber.toString(), gasUsed: rc.gasUsed.toString(), nonce: parsed.nonce ?? null, signedChainId: parsed.chainId ?? null };
    if (rc.status !== "success") {
      try {
        await opts.client.call({ account: account.address, to: st.to, data: st.data, blockNumber: rc.blockNumber - 1n });
        rec.revert = { name: "Reverted (replay did not reproduce)", args: [], selector: null, raw: null, message: "The receipt status is 0 but replaying at the parent block succeeded (likely out-of-gas or same-block ordering)." };
      } catch (e) {
        rec.revert = decodeRevert(e);
      }
      txs.push(rec);
      return { txs, stoppedAt: st.index };
    }
    txs.push(rec);
  }
  return { txs, stoppedAt: null };
}
