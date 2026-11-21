"use client";
/**
 * User-wallet signing on the LOCAL fork only. The wallet switches to (or adds) chain 31337,
 * then signs and sends exactly the previewed steps. Every send is guarded: chain must be 31337.
 */
import { useConfig, useSwitchChain, useAccount, useChainId } from "wagmi";
import { getChainId, sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import type { ExecutionRecord, WalletSigningRequest } from "@veydara/execution";
import { authFetch } from "@/lib/client/auth-fetch";
import { FORK_CHAIN_ID } from "@/lib/client/wagmi";

export function useForkWallet() {
  const config = useConfig();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  async function ensureForkChain() {
    // wagmi's injected connector falls back to wallet_addEthereumChain (error 4902) using the chain definition.
    if (getChainId(config) !== FORK_CHAIN_ID) await switchChainAsync({ chainId: FORK_CHAIN_ID });
    if (getChainId(config) !== FORK_CHAIN_ID) throw new Error("Wallet is not on the VEYDARA fork chain (31337); refusing to sign.");
  }

  async function signPreview(previewId: string, previewHash: string, onStep?: (i: number, total: number) => void): Promise<ExecutionRecord> {
    const begun = await authFetch<{ request?: WalletSigningRequest; record?: ExecutionRecord }>("/api/fork/wallet/begin", { body: { previewId, previewHash } });
    if (begun.record) return begun.record;
    const req = begun.request!;
    if (req.chainId !== FORK_CHAIN_ID) throw new Error("Server asked for a non-fork chain; refusing.");
    if (!address || address.toLowerCase() !== req.account.toLowerCase()) throw new Error(`Switch your wallet to ${req.account} (the account this preview was built for).`);
    await ensureForkChain();
    const submitted: { stepIndex: number; hash: `0x${string}` | null; error?: string }[] = [];
    for (const step of req.steps) {
      onStep?.(step.index, req.steps.length);
      if (getChainId(config) !== FORK_CHAIN_ID) {
        submitted.push({ stepIndex: step.index, hash: null, error: "wallet left chain 31337 mid-route" });
        break;
      }
      try {
        const hash = await sendTransaction(config, { chainId: FORK_CHAIN_ID, account: req.account, to: step.to, data: step.data, value: 0n });
        submitted.push({ stepIndex: step.index, hash });
        const rc = await waitForTransactionReceipt(config, { chainId: FORK_CHAIN_ID, hash });
        if (rc.status !== "success") break;
      } catch (e) {
        submitted.push({ stepIndex: step.index, hash: null, error: ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).slice(0, 280) });
        break;
      }
    }
    return authFetch<ExecutionRecord>("/api/fork/wallet/finish", { body: { previewId, submitted } });
  }

  return { address, chainId, onFork: chainId === FORK_CHAIN_ID, ensureForkChain, signPreview };
}
