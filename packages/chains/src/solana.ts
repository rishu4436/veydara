import { VeydaraError, formatUnitsSafe, type Provenance } from "@veydara/domain";
import { classifyToken } from "./identity";
import { findVerified } from "./registry";
import type { Holding, ScanResult } from "./evm";

export const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(s: string): boolean {
  if (!B58.test(s.trim())) return false;
  return base58Decode(s.trim())?.length === 32;
}

function base58Decode(s: string): Uint8Array | null {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of s) {
    const i = alphabet.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c === "1") bytes.unshift(0);
    else break;
  }
  return Uint8Array.from(bytes);
}

type RpcFetch = (method: string, params: unknown[]) => Promise<unknown>;

export function solanaRpc(url = DEFAULT_SOLANA_RPC, fetchImpl: typeof fetch = fetch): RpcFetch {
  return async (method, params) => {
    const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = (await res.json().catch(() => null)) as { result?: unknown; error?: { message: string } } | null;
    if (!res.ok || !j || j.error) throw new VeydaraError("RPC_UNAVAILABLE", `Solana RPC ${method} failed: ${j?.error?.message ?? res.status}`);
    return j.result;
  };
}

interface ParsedTokenAccount {
  account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } };
}

export async function scanSolanaWallet(owner: string, opts: { rpc?: RpcFetch; rpcUrl?: string } = {}): Promise<ScanResult> {
  const o = owner.trim();
  if (!isSolanaAddress(o)) throw new VeydaraError("INVALID_ADDRESS", "Not a valid Solana address");
  const rpc = opts.rpc ?? solanaRpc(opts.rpcUrl);
  const fetchedAt = new Date().toISOString();
  const bal = (await rpc("getBalance", [o, { commitment: "confirmed" }])) as { context: { slot: number }; value: number };
  const slot = String(bal.context.slot);
  const prov = (src: string): Provenance => ({ source: "solana-rpc", endpointOrContract: src, chainId: "solana-mainnet", address: o, observedAt: fetchedAt, fetchedAt, blockNumber: slot, unit: "base-units", freshness: "live", coverage: "complete", isSimulated: false });
  const holdings: Holding[] = [];
  const lamports = BigInt(bal.value);
  if (lamports > 0n) holdings.push({ chain: "solana", address: "native", rawBalance: lamports.toString(), decimals: 9, formatted: formatUnitsSafe(lamports, 9, 9), identity: classifyToken({ chain: "solana", address: "native", symbol: "SOL", name: "Solana", decimals: 9 }), provenance: prov("getBalance") });

  const notes: string[] = [];
  for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    try {
      const r = (await rpc("getTokenAccountsByOwner", [o, { programId: program }, { encoding: "jsonParsed", commitment: "confirmed" }])) as { value: ParsedTokenAccount[] };
      const byMint = new Map<string, { amount: bigint; decimals: number }>();
      for (const acc of r.value) {
        const info = acc.account.data.parsed.info;
        const prev = byMint.get(info.mint);
        byMint.set(info.mint, { amount: (prev?.amount ?? 0n) + BigInt(info.tokenAmount.amount), decimals: info.tokenAmount.decimals });
      }
      for (const [mint, v] of byMint) {
        if (v.amount === 0n) continue;
        const known = findVerified("solana", mint);
        // SPL metadata (name/symbol) is not fetched: unverified mints are shown by address only.
        holdings.push({ chain: "solana", address: mint, rawBalance: v.amount.toString(), decimals: v.decimals, formatted: formatUnitsSafe(v.amount, v.decimals, 8), identity: classifyToken({ chain: "solana", address: mint, symbol: known?.symbol ?? null, name: known?.name ?? null, decimals: v.decimals }), provenance: prov(`getTokenAccountsByOwner(${program === TOKEN_PROGRAM ? "SPL Token" : "Token-2022"})`) });
      }
    } catch (e) {
      notes.push(`Token accounts for ${program === TOKEN_PROGRAM ? "SPL Token" : "Token-2022"} not scanned: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  notes.push("Scanned: native SOL + all SPL Token and Token-2022 accounts. Unregistered mints are quarantined as unverified (metadata not trusted). Kamino positions are not scanned yet.");
  return { chain: "solana", owner: o, slot, scannedAt: fetchedAt, holdings, coverage: { scope: "all-token-accounts", complete: notes.length === 1, notes } };
}
