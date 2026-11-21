import type { Capability, CapabilityStatus } from "@veydara/domain";
import { ADAPTERS } from "@veydara/protocols";
import { cmc } from "./cmc";
import { serverEnv } from "./env";
import { makeBaseClient, solanaRpc } from "@veydara/chains";

async function probe(fn: () => Promise<unknown>): Promise<{ ok: boolean; detail: string }> {
  try {
    const v = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))]);
    return { ok: true, detail: String(v) };
  } catch (e) {
    return { ok: false, detail: (e as Error).message.slice(0, 120) };
  }
}

/**
 * Capability resolver. Statuses are computed from configuration and the live
 * credit ledger (evidence of successful upstream reads), never from copy.
 */
export async function resolveCapabilities(): Promise<Capability[]> {
  const env = serverEnv();
  const [baseProbe, solProbe] = await Promise.all([
    probe(() => makeBaseClient(env.BASE_RPC_URL).getBlockNumber()),
    probe(() => solanaRpc(env.SOLANA_RPC_URL)("getSlot", [])),
  ]);
  const g = cmc();
  const now = new Date().toISOString();
  const ledger = g.ledger.list(2000);
  const lastOk = (path: string) => ledger.find((e) => e.endpoint === path && e.outcome === "miss" && !e.errorCode);
  const lastErr = (path: string) => ledger.find((e) => e.endpoint === path && e.errorCode);

  const cmcCap = (id: string, label: string, pillar: Capability["pillar"], endpoint: Parameters<typeof g.modeFor>[0], path: string): Capability => {
    const mode = g.modeFor(endpoint);
    const ok = lastOk(path);
    const err = lastErr(path);
    let status: CapabilityStatus = "unavailable";
    let reason = "";
    if (!mode) reason = "CMC_API_KEY not configured and this endpoint has no keyless access.";
    else if (ok) {
      status = "live-verified";
      reason = `Live ${mode} response at ${ok.at} (credit_count=${ok.actualCredits ?? "n/a"}).`;
    } else {
      status = "read-only";
      reason = err ? `Configured (${mode}); last attempt failed: ${err.errorCode}.` : `Configured (${mode}); not yet exercised in this server session.`;
    }
    return { id, label, pillar, status, reason, unlock: mode ? undefined : "Set CMC_API_KEY (hackathon Startup plan) in the server environment.", checkedAt: now };
  };

  const caps: Capability[] = [
    { id: "wallet.evm", label: "EVM wallet connect (Base)", pillar: "discover", status: "read-only", reason: "Injected-wallet connect via wagmi; VEYDARA reads addresses only and requests no signatures.", checkedAt: now },
    { id: "wallet.solana", label: "Solana wallet connect", pillar: "discover", status: "read-only", reason: "Wallet Standard adapter; read-only.", checkedAt: now },
    { id: "wallet.watch", label: "Watch-only addresses", pillar: "discover", status: "read-only", reason: "Paste any Base or Solana address; nothing is signed.", checkedAt: now },
    { id: "scan.base", label: "Base balance scan", pillar: "discover", status: baseProbe.ok ? "live-verified" : "unavailable", evidence: baseProbe.ok ? `eth_blockNumber=${baseProbe.detail}` : baseProbe.detail, reason: `${baseProbe.ok ? "" : "Base RPC probe failed. "}Block-pinned eth_getBalance + multicall balanceOf via ${env.BASE_RPC_URL ? "configured BASE_RPC_URL" : "public https://mainnet.base.org"}. Covers verified registry + user-added contracts only.`, unlock: "Indexer key needed for full unknown-token discovery.", checkedAt: now },
    { id: "scan.solana", label: "Solana balance scan", pillar: "discover", status: solProbe.ok ? "live-verified" : "unavailable", evidence: solProbe.ok ? `getSlot=${solProbe.detail}` : solProbe.detail, reason: `${solProbe.ok ? "" : "Solana RPC probe failed. "}getBalance + getTokenAccountsByOwner via ${env.SOLANA_RPC_URL ? "configured SOLANA_RPC_URL" : "public mainnet-beta RPC (rate-limited)"}.`, checkedAt: now },
    cmcCap("cmc.quotes", "CMC crypto quotes (v3)", "discover", "cryptoQuotesLatestV3", "/v3/cryptocurrency/quotes/latest"),
    cmcCap("cmc.identity", "CMC contract → listing identity (v2 info)", "discover", "cryptoInfoV2", "/v2/cryptocurrency/info"),
    cmcCap("cmc.dex", "CMC DEX token liquidity", "discover", "dexToken", "/v1/dex/token"),
    cmcCap("cmc.rwa.quotes", "CMC RWA quotes (aggregate vs issuer tokens)", "discover", "rwaQuotesLatest", "/v5/real-world-assets/quotes/latest"),
    cmcCap("cmc.rwa.map", "CMC RWA map / issuers", "discover", "rwaMap", "/v5/real-world-assets/map"),
    cmcCap("cmc.ohlcv", "CMC OHLCV candles (v5)", "alpha", "cryptoOhlcvHistoricalV5", "/v5/cryptocurrency/ohlcv/historical"),
    { id: "cmc.rwa.marketpairs", label: "CMC RWA market pairs", pillar: "discover", status: "unavailable", reason: "Growth+ plan only; intentionally not called on Startup (no repeated 403s).", checkedAt: now },
    { id: "cmc.ai", label: "CMC AI endpoints", pillar: "alpha", status: "unavailable", reason: "Documented as Enterprise-only (Phase 1); feature-gated off. VEYDARA explanations come from its own deterministic pipeline.", checkedAt: now },
    { id: "alpha.indicators", label: "Indicator + S/R zone engine", pillar: "alpha", status: g.modeFor("cryptoOhlcvHistoricalV5") ? "read-only" : "unavailable", reason: g.modeFor("cryptoOhlcvHistoricalV5") ? "Engine is fixture-tested; runs on CMC v5 candles when requested." : "Engine is fixture-tested, but no verified candle source is configured (CMC v5 OHLCV needs CMC_API_KEY).", checkedAt: now },
    { id: "aave.oracle", label: "Aave V4 Base equity oracle reads", pillar: "guardian", status: baseProbe.ok ? "live-verified" : "unavailable", reason: "Chainlink feeds from the official Aave address book, read live via Base RPC.", checkedAt: now },
  ];
  for (const a of ADAPTERS) {
    for (const [cap, v] of Object.entries(a.capabilities)) {
      if (cap === "oracleRead") continue;
      caps.push({ id: `adapter.${a.id}.${cap}`, label: `${a.name}: ${cap}`, pillar: "execute", status: v!.implemented ? "read-only" : "unavailable", reason: v!.note, checkedAt: now });
    }
  }
  caps.push(
    { id: "execute.any", label: "Transaction execution", pillar: "execute", status: "unavailable", reason: "No execution path is enabled. Phase 4 targets a clearly labeled Base fork; mainnet broadcast requires explicit owner approval.", checkedAt: now },
    { id: "guardian.automation", label: "Automated protection", pillar: "guardian", status: "unavailable", reason: "Disabled by default; no authorized automation mechanism exists.", checkedAt: now },
  );
  return caps;
}
