/**
 * Fork guard. Every write path in VEYDARA goes through `inspectFork`, which
 * refuses anything that is not a loopback anvil node with chain id 31337 that
 * is itself forked from an upstream. Chain id 31337 ≠ 8453, so any signature
 * produced here is invalid on Base mainnet (EIP-155 replay protection).
 */
import { createPublicClient, defineChain, getAddress, http, type PublicClient } from "viem";
import { AAVE_V4_BASE } from "@veydara/protocols";

export const FORK_CHAIN_ID = 31337;
export const FORK_LABEL = "FORK";

export const forkChain = defineChain({
  id: FORK_CHAIN_ID,
  name: "VEYDARA Base fork (anvil, chain 31337)",
  nativeCurrency: { name: "Ether (fork)", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export class NotAForkError extends Error {
  readonly code = "NOT_A_FORK";
}

export interface ForkInfo {
  label: typeof FORK_LABEL;
  chainId: number;
  rpcHost: string;
  /** Upstream block the fork was taken at. */
  forkBlockNumber: string;
  /** Upstream host only (no path/query — never leaks RPC keys). */
  upstreamHost: string;
  network: string | null;
  currentBlock: string;
  currentTimestamp: number;
  inspectedAt: string;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function assertLoopback(rpcUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rpcUrl);
  } catch {
    throw new NotAForkError("Fork RPC URL is not a valid URL.");
  }
  if (!LOOPBACK.has(u.hostname)) throw new NotAForkError(`Fork RPC must be loopback (127.0.0.1/localhost); refusing host "${u.hostname}".`);
  return u;
}

export function forkClient(rpcUrl: string): PublicClient {
  assertLoopback(rpcUrl);
  return createPublicClient({ chain: forkChain, transport: http(rpcUrl, { timeout: 30_000, retryCount: 0 }) }) as PublicClient;
}

type RawRequest = (a: { method: string; params?: unknown[] }) => Promise<unknown>;
export const rpc = (client: PublicClient, method: string, params: unknown[] = []) => (client.request as unknown as RawRequest)({ method, params });

interface NodeInfo {
  currentBlockNumber: string;
  currentBlockTimestamp: number;
  environment?: { chainId?: number };
  forkConfig?: { forkUrl?: string | null; forkBlockNumber?: number | null };
  network?: string | null;
}

export async function inspectFork(rpcUrl: string): Promise<ForkInfo> {
  const u = assertLoopback(rpcUrl);
  const client = forkClient(rpcUrl);
  const chainId = await client.getChainId();
  if (chainId !== FORK_CHAIN_ID) throw new NotAForkError(`RPC reports chain ${chainId}; VEYDARA only writes to chain ${FORK_CHAIN_ID} (local fork).`);
  let info: NodeInfo;
  try {
    info = (await rpc(client, "anvil_nodeInfo")) as NodeInfo;
  } catch {
    throw new NotAForkError("RPC is not an anvil node (anvil_nodeInfo unavailable).");
  }
  if (!info.forkConfig?.forkUrl || info.forkConfig.forkBlockNumber == null) throw new NotAForkError("anvil is not running in fork mode.");
  const code = await client.getCode({ address: getAddress(AAVE_V4_BASE.mag7Spoke) });
  if (!code || code === "0x") throw new NotAForkError("Aave V4 MAG7 Spoke has no code on this node — it is not a Base fork.");
  return {
    label: FORK_LABEL,
    chainId,
    rpcHost: u.host,
    forkBlockNumber: String(info.forkConfig.forkBlockNumber),
    upstreamHost: new URL(info.forkConfig.forkUrl).host,
    network: info.network ?? null,
    currentBlock: BigInt(info.currentBlockNumber).toString(),
    currentTimestamp: Number(info.currentBlockTimestamp),
    inspectedAt: new Date().toISOString(),
  };
}
