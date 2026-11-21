import { store } from "./store";
import type { Capability, CapabilityStatus } from "@veydara/domain";
import { ADAPTERS } from "@veydara/protocols";
import { cmc } from "./cmc";
import { serverEnv } from "./env";
import { makeBaseClient, solanaRpc } from "@veydara/chains";
import { inspectFork } from "@veydara/execution";
import { isFixtureMode } from "./dataset";

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
  // With a key: one 0-credit plan probe (/v1/key/info) and one 0-credit access probe (/v5/real-world-assets/map, documented as free).
  // Both are cached by the gateway; a 402/1004 here suspends pro mode and switches keyless endpoints to the public API.
  let plan: { limit?: number | null; rpm?: number | null; used?: number | null; notice?: string | null } | null = null;
  if (g.hasKey) {
    const ki = await g.request("keyInfo", {}, { feature: "capabilities.plan" });
    if (ki.ok) plan = { limit: ki.data.data.plan.credit_limit_monthly, rpm: ki.data.data.plan.rate_limit_minute, used: ki.data.data.usage?.current_month?.credits_used, notice: (ki.data.status as { notice?: string | null }).notice ?? null };
    await g.request("rwaMap", {}, { feature: "capabilities.access-probe" });
  }
  const ps = g.proStatus;
  const ledger = g.ledger.list(2000);
  const lastOk = (path: string) => ledger.find((e) => e.endpoint === path && e.outcome === "miss" && !e.errorCode);
  const lastErr = (path: string) => ledger.find((e) => e.endpoint === path && e.errorCode);

  const cmcCap = (id: string, label: string, pillar: Capability["pillar"], endpoint: Parameters<typeof g.modeFor>[0], path: string): Capability => {
    const mode = g.modeFor(endpoint);
    const ok = lastOk(path);
    const err = lastErr(path);
    let status: CapabilityStatus = "unavailable";
    let reason = "";
    if (!mode) reason = g.hasKey ? `CMC rejected the configured key: HTTP ${ps.httpStatus ?? "?"} / error ${ps.cmcErrorCode ?? "?"} — ${ps.suspendedReason}` : "CMC_API_KEY not configured and this endpoint has no keyless access.";
    else if (ok) {
      status = "live-verified";
      reason = `Live ${mode} response at ${ok.at} (credit_count=${ok.actualCredits ?? "n/a"}).`;
    } else {
      status = "read-only";
      reason = err ? `Configured (${mode}); last attempt failed: ${err.errorCode}.` : `Configured (${mode}); not yet exercised in this server session.`;
    }
    if (mode === "keyless" && g.hasKey && !ps.usable) reason = `Pro plan rejected (${ps.httpStatus}/${ps.cmcErrorCode}); serving via keyless public API. ` + reason;
    return { id, label, pillar, status, reason, unlock: mode ? undefined : g.hasKey ? "Renew/activate the CMC API subscription for this key (CMC returns 402 'subscription plan has expired')." : "Set CMC_API_KEY in the server environment.", checkedAt: now };
  };

  const planCap: Capability = g.hasKey
    ? { id: "cmc.plan", label: "CMC API key / plan", pillar: "discover", status: ps.usable ? "live-verified" : "unavailable", evidence: plan ? `monthly credit limit ${plan.limit ?? "?"}, ${plan.rpm ?? "?"} req/min, ${plan.used ?? 0} used this month` : undefined, reason: ps.usable ? "Key accepted by CMC." : `Key present but CMC rejects data calls: HTTP ${ps.httpStatus} / error ${ps.cmcErrorCode} — "${ps.suspendedReason}". ${plan?.notice ?? ""}`.trim(), unlock: ps.usable ? undefined : "Renew or activate the subscription for this CMC key.", checkedAt: now }
    : { id: "cmc.plan", label: "CMC API key / plan", pillar: "discover", status: "unavailable", reason: "No CMC_API_KEY configured; keyless public API only.", checkedAt: now };
  const caps: Capability[] = [
    planCap,
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
    cmcCap("cmc.ohlcv", "CMC OHLCV candles (v5, CEX-aggregated)", "alpha", "cryptoOhlcvHistoricalV5", "/v5/cryptocurrency/ohlcv/historical"),
    cmcCap("cmc.kline", "CMC DEX K-line candles (exact token contract)", "alpha", "dexKlineCandles", "/v1/k-line/candles"),
    { id: "cmc.rwa.marketpairs", label: "CMC RWA market pairs", pillar: "discover", status: "unavailable", reason: g.hasKey && !ps.usable ? "Probed 2026-11-21: HTTP 402 / 1004 (subscription expired). Documented Growth+ only; not called again." : "Growth+ plan only; not called (no repeated 403s).", checkedAt: now },
    { id: "cmc.ai", label: "CMC AI (/v5/cmc-ai/*)", pillar: "alpha", status: "unavailable", reason: g.hasKey && !ps.usable ? "Probed 2026-11-21: HTTP 402 / 1004 (subscription expired). Docs list Basic+ with a separate AI credit allowance; VEYDARA explanations come from its own deterministic pipeline." : "Key required; VEYDARA explanations come from its own deterministic pipeline.", checkedAt: now },
    (() => {
      const k = lastOk("/v1/k-line/candles");
      return { id: "alpha.indicators", label: "Indicators, S/R zones, multi-horizon research", pillar: "alpha" as const, status: (k ? "live-verified" : g.modeFor("dexKlineCandles") ? "read-only" : "unavailable") as CapabilityStatus, reason: k ? `Computed on real CMC DEX candles (last fetch ${k.at}).` : "Engine is fixture-tested; runs on CMC DEX K-line candles (keyless) when a chart or research view is opened.", checkedAt: now };
    })(),
    { id: "aave.oracle", label: "Aave V4 Base equity oracle reads", pillar: "guardian", status: baseProbe.ok ? "live-verified" : "unavailable", reason: "Chainlink feeds from the official Aave address book, read live via Base RPC.", checkedAt: now },
    { id: "aave.reserves", label: "Aave V4 reserves (caps, CF, rates, liquidity)", pillar: "execute", status: baseProbe.ok ? "live-verified" : "unavailable", reason: "Block-pinned Spoke/Hub view calls; ABIs pinned to aave/aave-v4@4885a7ad.", checkedAt: now },
    { id: "aave.positions", label: "Aave V4 user positions + health factor", pillar: "guardian", status: baseProbe.ok ? "live-verified" : "unavailable", reason: "getUserAccountData + per-reserve reads; VEYDARA bigint HF matches the Spoke exactly on recorded live borrowers (tests).", checkedAt: now },
    { id: "strategy.futures", label: "Parallel Futures (scenario grid)", pillar: "execute", status: "simulation", reason: "Deterministic shocks on live Aave state; labeled simulation.", checkedAt: now },
    { id: "strategy.solver", label: "Solver Arena + independent verifier", pillar: "execute", status: "simulation", reason: "Candidate borrow plans checked by an independent rational-arithmetic verifier (caps, liquidity, policy HF). No transactions.", checkedAt: now },
  ];
  for (const a of ADAPTERS) {
    for (const [cap, v] of Object.entries(a.capabilities)) {
      if (cap === "oracleRead") continue;
      caps.push({ id: `adapter.${a.id}.${cap}`, label: `${a.name}: ${cap}`, pillar: "execute", status: v!.implemented ? (["deposit", "borrow", "repay", "withdraw"].includes(cap) ? "fork-testnet" : "read-only") : "unavailable", reason: v!.note, checkedAt: now });
    }
  }
  const fork = await inspectFork(env.FORK_RPC_URL).then((f) => ({ ok: true as const, f })).catch((e: Error) => ({ ok: false as const, reason: e.message.slice(0, 140) }));
  caps.push(
    fork.ok
      ? { id: "execute.fork", label: "Fork execution (Aave V4 MAG7: supply, collateral, borrow, repay, withdraw)", pillar: "execute", status: "fork-testnet", evidence: `anvil chain ${fork.f.chainId}, Base forked at ${fork.f.forkBlockNumber} via ${fork.f.upstreamHost}`, reason: "Full pipeline on a LOCAL anvil fork: validate → fresh state → typed route → verifier → simulation → preview → sign (anvil test key, chain 31337) → send → receipt → reconcile → proof record.", checkedAt: now }
      : { id: "execute.fork", label: "Fork execution (Aave V4 MAG7)", pillar: "execute", status: "unavailable", reason: `No local fork reachable: ${fork.reason}`, unlock: "Run `pnpm fork` (anvil, chain 31337, loopback only).", checkedAt: now },
    fork.ok
      ? { id: "execute.wallet-fork", label: "User-wallet signing on the fork (injected wallet, chain 31337)", pillar: "execute", status: "fork-testnet", evidence: "wallet adds/switches to chain 31337; server verifies from/to/calldata/chainId of every wallet-sent tx against the preview", reason: "SIWE-proven wallets only. The server never sees a key; each submitted tx is checked against the reviewed preview before receipts and reconciliation.", checkedAt: now }
      : { id: "execute.wallet-fork", label: "User-wallet signing on the fork", pillar: "execute", status: "unavailable", reason: `No local fork reachable: ${fork.reason}`, unlock: "Run `pnpm fork` locally and open VEYDARA on the same machine.", checkedAt: now },
    { id: "execute.mainnet", label: "Mainnet transaction execution / mainnet wallet signing", pillar: "execute", status: "unavailable", reason: "Deliberately disabled. No UI path asks a wallet to send on chain 8453; the server signer refuses any chain id other than 31337 and any non-loopback RPC.", checkedAt: now },
    { id: "execute.intent", label: "Capital Intent Engine (deterministic NL/preset → bounded constraints → Solver Arena)", pillar: "execute", status: isFixtureMode() ? "simulation" : baseProbe.ok ? "simulation" : "unavailable", reason: "Grammar-based parser (no LLM); constraints are bounded and rejected when out of range; plans pass the independent verifier. Analysis only — nothing is signed.", checkedAt: now },
    { id: "platform.siwe", label: "Sign-In with Ethereum (EIP-4361), multi-wallet proofs", pillar: "platform", status: "live-verified", reason: "Server nonces (single use, 5 min), strict domain/uri/chain/statement checks, ecrecover + ERC-1271/6492, HttpOnly SameSite=Strict 1-hour session, CSRF token bound to the session.", checkedAt: now },
    (() => {
      const info = store().info();
      return { id: "platform.persistence", label: "Persistence (sessions, policies, alerts, proofs, credit ledger)", pillar: "platform" as const, status: info.kind === "postgres" ? ("live-verified" as const) : ("read-only" as const), reason: info.detail, unlock: info.kind === "postgres" ? undefined : "Set DATABASE_URL (e.g. Neon) and run `pnpm db:migrate`.", checkedAt: now };
    })(),
    { id: "guardian.radar", label: "Risk radar (7 axes per position)", pillar: "guardian", status: isFixtureMode() ? "read-only" : baseProbe.ok ? "live-verified" : "unavailable", reason: "Deterministic scores from block-pinned Aave V4 reads, Chainlink feed ages and the NYSE session calendar.", checkedAt: now },
    { id: "guardian.alerts", label: "In-app alert center (policies)", pillar: "guardian", status: "read-only", reason: "Monitor-only policies evaluated on demand or every 60 s while open; inbox de-duplicated in this browser. No push/email channel and no actions.", checkedAt: now },
    { id: "guardian.emergency", label: "Emergency center (positions, allowances, position managers)", pillar: "guardian", status: baseProbe.ok && !isFixtureMode() ? "live-verified" : "unavailable", reason: `Live allowance + isPositionManager reads; revocations are prepared and simulated only on the local fork${fork.ok ? "" : " (fork currently unavailable)"}.`, checkedAt: now },
    { id: "guardian.automation", label: "Automated protection", pillar: "guardian", status: "unavailable", reason: "Disabled by design; no authorized automation mechanism exists.", checkedAt: now },
  );
  return caps;
}
