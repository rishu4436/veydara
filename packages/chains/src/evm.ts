import { createPublicClient, erc20Abi, getAddress, http, isAddress, type PublicClient } from "viem";
import { base } from "viem/chains";
import { VeydaraError, formatUnitsSafe, type Provenance } from "@veydara/domain";
import { BASE_NATIVE, BASE_TOKENS } from "./registry";
import { classifyToken, type IdentityVerdict } from "./identity";

export const DEFAULT_BASE_RPC = "https://mainnet.base.org";

export function makeBaseClient(rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: base, transport: http(rpcUrl || DEFAULT_BASE_RPC, { timeout: 12_000, retryCount: 1 }) }) as PublicClient;
}

export function normalizeEvmAddress(input: string): `0x${string}` {
  const s = input.trim();
  if (!isAddress(s, { strict: false })) throw new VeydaraError("INVALID_ADDRESS", `Not a valid EVM address: ${s.slice(0, 64)}`);
  return getAddress(s);
}

export interface Holding {
  chain: "base" | "solana";
  address: string; // token contract / mint / "native"
  rawBalance: string; // base units, string for JSON safety
  decimals: number;
  formatted: string;
  identity: IdentityVerdict;
  provenance: Provenance;
}

export interface ScanResult {
  chain: "base" | "solana";
  owner: string;
  blockNumber?: string;
  slot?: string;
  scannedAt: string;
  holdings: Holding[];
  /** Explicit statement of what was and wasn't scanned. */
  coverage: { scope: string; complete: boolean; notes: string[] };
}

/**
 * Lightweight holdings scan on Base (spec §1.1.1): native balance + the
 * verified registry + any user-supplied contracts, all pinned to one block.
 * Unknown-token discovery requires an indexer and is reported as not covered.
 */
export async function scanBaseWallet(ownerInput: string, opts: { client?: PublicClient; rpcUrl?: string; extraTokens?: string[] } = {}): Promise<ScanResult> {
  const owner = normalizeEvmAddress(ownerInput);
  const client = opts.client ?? makeBaseClient(opts.rpcUrl);
  const rpcLabel = opts.rpcUrl ? "configured BASE_RPC_URL" : DEFAULT_BASE_RPC;
  let blockNumber: bigint;
  try {
    blockNumber = await client.getBlockNumber();
  } catch (e) {
    throw new VeydaraError("RPC_UNAVAILABLE", `Base RPC unreachable (${rpcLabel}): ${(e as Error).message.slice(0, 160)}`);
  }
  const fetchedAt = new Date().toISOString();
  const prov = (contract: string): Provenance => ({
    source: "base-rpc",
    endpointOrContract: contract,
    chainId: 8453,
    address: owner,
    observedAt: fetchedAt,
    fetchedAt,
    blockNumber: blockNumber.toString(),
    unit: "base-units",
    freshness: "live",
    coverage: "complete",
    isSimulated: false,
  });

  const extra = [...new Set((opts.extraTokens ?? []).map((a) => normalizeEvmAddress(a).toLowerCase()))].filter((a) => !BASE_TOKENS.some((t) => t.address === a)).slice(0, 20);

  const nativeBal = await client.getBalance({ address: owner, blockNumber });
  const registryCalls = BASE_TOKENS.map((t) => ({ address: getAddress(t.address), abi: erc20Abi, functionName: "balanceOf" as const, args: [owner] as const }));
  const extraCalls = extra.flatMap((a) => {
    const address = getAddress(a);
    return [
      { address, abi: erc20Abi, functionName: "balanceOf" as const, args: [owner] as const },
      { address, abi: erc20Abi, functionName: "symbol" as const },
      { address, abi: erc20Abi, functionName: "name" as const },
      { address, abi: erc20Abi, functionName: "decimals" as const },
    ];
  });
  const results = await client.multicall({ contracts: [...registryCalls, ...extraCalls] as never[], blockNumber, allowFailure: true });

  const holdings: Holding[] = [];
  const notes: string[] = [];
  if (nativeBal > 0n) {
    holdings.push({ chain: "base", address: "native", rawBalance: nativeBal.toString(), decimals: 18, formatted: formatUnitsSafe(nativeBal, 18, 8), identity: classifyToken({ chain: "base", address: "native", symbol: "ETH", name: BASE_NATIVE.name, decimals: 18 }), provenance: prov("eth_getBalance") });
  }
  BASE_TOKENS.forEach((t, i) => {
    const r = results[i];
    if (!r || r.status !== "success") {
      notes.push(`balanceOf failed for ${t.symbol} (${t.address}); balance unknown.`);
      return;
    }
    const bal = r.result as bigint;
    if (bal > 0n) holdings.push({ chain: "base", address: t.address, rawBalance: bal.toString(), decimals: t.decimals, formatted: formatUnitsSafe(bal, t.decimals, 8), identity: classifyToken({ chain: "base", address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals }), provenance: prov(t.address) });
  });
  extra.forEach((a, j) => {
    const base = registryCalls.length + j * 4;
    const [b, s, n, d] = [results[base], results[base + 1], results[base + 2], results[base + 3]];
    if (!b || b.status !== "success") {
      notes.push(`${a} did not answer balanceOf; not an ERC-20 on Base or call reverted.`);
      return;
    }
    const decimals = d?.status === "success" ? Number(d.result) : null;
    const identity = classifyToken({ chain: "base", address: a, symbol: s?.status === "success" ? String(s.result) : null, name: n?.status === "success" ? String(n.result) : null, decimals });
    const bal = b.result as bigint;
    holdings.push({ chain: "base", address: a, rawBalance: bal.toString(), decimals: decimals ?? 0, formatted: decimals === null ? bal.toString() + " (raw units; decimals unknown)" : formatUnitsSafe(bal, decimals, 8), identity, provenance: prov(a) });
  });

  notes.push("Scanned: native ETH + VEYDARA verified registry (" + BASE_TOKENS.length + " contracts)" + (extra.length ? ` + ${extra.length} user-added contract(s)` : "") + ".");
  notes.push("Not scanned: arbitrary/unknown ERC-20s (needs an indexer API key) and existing DeFi positions (Aave V4 position read lands in Phase 3/4).");
  return { chain: "base", owner, blockNumber: blockNumber.toString(), scannedAt: fetchedAt, holdings, coverage: { scope: "registry", complete: false, notes } };
}
