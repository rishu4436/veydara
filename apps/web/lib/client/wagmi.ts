import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

/**
 * Local anvil fork of Base (chain 31337 — never 8453, so nothing signed for it can be replayed
 * on Base). The wallet adds/switches to it on demand; its RPC is the user's own loopback fork.
 */
export const FORK_CHAIN_ID = 31337 as const;
export const veydaraFork = defineChain({
  id: FORK_CHAIN_ID,
  name: "VEYDARA Local Base Fork (anvil)",
  nativeCurrency: { name: "Fork Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_FORK_RPC_URL ?? "http://127.0.0.1:8545"] } },
  testnet: true,
});

/**
 * Base for reads + SIWE, and the local fork for fork-only signing. Mainnet signing is disabled
 * in the app: no code path asks the wallet to send a transaction on chain 8453.
 * WalletConnect is intentionally not bundled until a project id is provisioned.
 */
export const wagmiConfig = createConfig({
  chains: [base, veydaraFork],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [base.id]: http(), [veydaraFork.id]: http(veydaraFork.rpcUrls.default.http[0]) },
  ssr: true,
});
