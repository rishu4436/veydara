import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Base-only EVM config. Injected connector covers browser wallets
 * (MetaMask, Coinbase Wallet extension, Rabby, Phantom EVM…). WalletConnect
 * is intentionally not bundled until a project id is provisioned.
 * Client RPC traffic goes to the public Base endpoint; VEYDARA reads
 * balances server-side, so no RPC key is exposed to the browser.
 */
export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [base.id]: http() },
  ssr: true,
});
