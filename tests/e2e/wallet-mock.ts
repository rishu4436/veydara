/**
 * A test-only injected EIP-1193 wallet. Keys are generated fresh per test run in the Node test
 * process (never written anywhere); the page sees only `window.ethereum`. It signs SIWE messages,
 * supports wallet_switchEthereumChain / wallet_addEthereumChain (4902 for unknown chains, like real
 * wallets), and signs + broadcasts transactions ONLY for chain 31337 to a loopback fork RPC.
 */
import type { Page } from "@playwright/test";
import { createPublicClient, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export interface MockWallet { accounts: PrivateKeyAccount[]; use(i: number): Promise<void>; state: { chainId: number; active: number; added: number[] } }

export async function installMockWallet(page: Page, opts: { count?: number; forkRpc?: string } = {}): Promise<MockWallet> {
  const accounts = Array.from({ length: opts.count ?? 2 }, () => privateKeyToAccount(generatePrivateKey()));
  const state = { chainId: 8453, active: 0, added: [8453] };
  const forkRpc = opts.forkRpc ?? "http://127.0.0.1:8545";
  const fork = createPublicClient({ transport: http(forkRpc) });
  const err = (code: number, message: string) => JSON.stringify({ __error: { code, message } });

  await page.exposeFunction("__mockWallet", async (method: string, params: unknown[] = []): Promise<string> => {
    const me = accounts[state.active]!;
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return JSON.stringify([me.address]);
      case "eth_chainId":
        return JSON.stringify(`0x${state.chainId.toString(16)}`);
      case "net_version":
        return JSON.stringify(String(state.chainId));
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return JSON.stringify([{ parentCapability: "eth_accounts" }]);
      case "wallet_revokePermissions":
        return JSON.stringify(null);
      case "wallet_switchEthereumChain": {
        const id = parseInt((params[0] as { chainId: string }).chainId, 16);
        if (!state.added.includes(id)) return err(4902, `Unrecognized chain ID ${id}. Try adding the chain using wallet_addEthereumChain first.`);
        state.chainId = id;
        return JSON.stringify(null);
      }
      case "wallet_addEthereumChain": {
        const p = params[0] as { chainId: string; rpcUrls: string[] };
        const id = parseInt(p.chainId, 16);
        if (id !== 31337 || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(p.rpcUrls[0] ?? "")) return err(4001, "mock wallet only adds the loopback VEYDARA fork");
        if (!state.added.includes(id)) state.added.push(id);
        state.chainId = id;
        return JSON.stringify(null);
      }
      case "personal_sign": {
        const [msgHex, addr] = params as [Hex, string];
        if (addr.toLowerCase() !== me.address.toLowerCase()) return err(4100, "not the active account");
        return JSON.stringify(await me.signMessage({ message: { raw: msgHex } }));
      }
      case "eth_sendTransaction": {
        if (state.chainId !== 31337) return err(4001, "mock wallet refuses to send on any chain but the local fork (31337)");
        const tx = params[0] as { to: Hex; data?: Hex; value?: Hex; gas?: Hex; from: string };
        if (tx.from.toLowerCase() !== me.address.toLowerCase()) return err(4100, "not the active account");
        const [nonce, fees, gas] = await Promise.all([
          fork.getTransactionCount({ address: me.address, blockTag: "pending" }),
          fork.estimateFeesPerGas(),
          tx.gas ? Promise.resolve(BigInt(tx.gas)) : fork.estimateGas({ account: me.address, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }),
        ]);
        const signed = await me.signTransaction({ chainId: 31337, type: "eip1559", to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, nonce, gas: (gas * 12n) / 10n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
        return JSON.stringify(await fork.sendRawTransaction({ serializedTransaction: signed }));
      }
      default: {
        if (state.chainId !== 31337) return err(4200, `mock wallet: ${method} unsupported off-fork`);
        const r = await fetch(forkRpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = (await r.json()) as { result?: unknown; error?: { code: number; message: string } };
        return j.error ? err(j.error.code, j.error.message) : JSON.stringify(j.result ?? null);
      }
    }
  });

  await page.addInitScript(() => {
    const listeners: Record<string, ((x: unknown) => void)[]> = {};
    const emit = (ev: string, x: unknown) => (listeners[ev] ?? []).forEach((f) => f(x));
    const call = (window as unknown as { __mockWallet: (m: string, p: unknown[]) => Promise<string> }).__mockWallet;
    const provider = {
      isVeydaraMock: true,
      async request({ method, params }: { method: string; params?: unknown[] }) {
        const before = method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain" ? JSON.parse(await call("eth_chainId", [])) : null;
        const out = JSON.parse(await call(method, params ?? []));
        if (out && typeof out === "object" && "__error" in out) throw Object.assign(new Error(out.__error.message), { code: out.__error.code });
        if (before !== null) {
          const after = JSON.parse(await call("eth_chainId", []));
          if (after !== before) emit("chainChanged", after);
        }
        return out;
      },
      on(ev: string, f: (x: unknown) => void) { (listeners[ev] ??= []).push(f); },
      removeListener(ev: string, f: (x: unknown) => void) { listeners[ev] = (listeners[ev] ?? []).filter((g) => g !== f); },
      __emit: emit,
    };
    (window as unknown as { ethereum: unknown }).ethereum = provider;
  });

  return {
    accounts,
    state,
    async use(i: number) {
      state.active = i;
      await page.evaluate((a) => (window as unknown as { ethereum: { __emit: (e: string, x: unknown) => void } }).ethereum.__emit("accountsChanged", [a]), accounts[i]!.address);
    },
  };
}
