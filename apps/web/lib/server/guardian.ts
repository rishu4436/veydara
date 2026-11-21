/**
 * Guardian server logic: risk radar + monitor-only alert evaluation, and the
 * Emergency Center (positions, allowances, position managers, fork-only revoke prep).
 */
import { createPublicClient, encodeFunctionData, formatUnits, getAddress, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { makeBaseClient } from "@veydara/chains";
import { usEquitySession } from "@veydara/domain";
import { AAVE_V4_BASE, AAVE_V4_BASE_FEEDS, ERC20_ABI, MAX_UINT256, SPOKE_WRITE_ABI, evaluatePolicies, readAaveFeed, riskRadar, type Policy, type RadarInput } from "@veydara/protocols";
import { forkClient, simulateAsOwner } from "@veydara/execution";
import { analysePosition } from "./aave";
import { serverEnv } from "./env";
import { isFixtureMode } from "./dataset";

export async function radarFor(address: string, policies: Policy[]) {
  const a = await analysePosition(address);
  const m = a.market;
  const values = a.collateral.map((c) => {
    const r = m.reserves[c.reserveId]!;
    return Number(BigInt(c.amount) * BigInt(r.price) / 10n ** BigInt(r.decimals));
  });
  const total = values.reduce((x, y) => x + y, 0);
  let oracleMaxAgeSeconds: number | null = null;
  let oracleNote = "fixture dataset: oracle ages not read";
  if (!isFixtureMode() && a.collateral.length) {
    const client = makeBaseClient(serverEnv().BASE_RPC_URL);
    const ages = await Promise.all(a.collateral.map((c) => (c.symbol ? readAaveFeed(client, c.symbol).then((o) => o.ageSeconds).catch(() => null) : null)));
    const known = ages.filter((x): x is number => x !== null);
    oracleMaxAgeSeconds = known.length ? Math.max(...known) : null;
    oracleNote = `${known.length}/${ages.length} Chainlink feeds read`;
  }
  const debtRes = a.debt.map((d) => m.reserves[d.reserveId]!);
  const util = debtRes.filter((r) => r.drawCapTokens !== null).map((r) => Number(BigInt(r.totalDebt) * 10_000n / (BigInt(r.drawCapTokens!) * 10n ** BigInt(r.decimals))) / 10_000);
  const usdcApr = a.veydara.borrowAprBps.USDC;
  const session = usEquitySession(new Date());
  const input: RadarInput = {
    healthFactorWad: a.position.account.healthFactorWad,
    drawdownToLiquidationBps: a.veydara.drawdownToLiquidationBps,
    gap10HealthFactorWad: a.futures.find((f) => f.id === "gap10")?.healthFactorWad ?? null,
    oracleMaxAgeSeconds,
    marketOpen: session.status !== "closed",
    largestCollateralShare: total > 0 ? Math.max(...values) / total : null,
    drawCapUtilisation: util.length ? Math.max(...util) : null,
    borrowAprBps: a.debt.length && usdcApr ? Number(usdcApr) : null,
  };
  const radar = riskRadar(input);
  return {
    address: getAddress(address),
    blockNumber: m.blockNumber,
    source: m.provenance.source,
    hasPosition: a.hasPosition,
    hfMatchesSpoke: a.veydara.matchesSpoke,
    session: { status: session.status, reason: session.reason },
    oracleNote,
    input,
    radar,
    alerts: evaluatePolicies(getAddress(address), m.blockNumber, input, radar, policies),
  };
}

/* ------------------------------ Emergency Center ------------------------------ */
const APPROVAL = parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)");
const KNOWN_SPENDERS: Record<string, string> = {
  [AAVE_V4_BASE.mag7Spoke]: "Aave V4 MAG7 Spoke",
  [AAVE_V4_BASE.equitiesHub]: "Aave V4 Equities Hub",
  [AAVE_V4_BASE.treasurySpoke]: "Aave V4 Treasury Spoke",
  [AAVE_V4_BASE.equitiesUsdcTokenizationSpoke]: "Aave V4 Equities USDC Tokenization Spoke",
  ...Object.fromEntries(Object.entries(AAVE_V4_BASE.positionManagers).map(([k, v]) => [v, `Aave V4 position manager: ${k}`])),
};
const labelFor = (a: string) => Object.entries(KNOWN_SPENDERS).find(([k]) => k.toLowerCase() === a.toLowerCase())?.[1] ?? null;
const TOKENS = Object.entries(AAVE_V4_BASE_FEEDS).map(([symbol, v]) => ({ symbol, address: getAddress(v.asset), decimals: symbol === "USDC" ? 6 : 8 }));

export async function emergencyInspect(owner: string) {
  if (isFixtureMode()) return { status: "unavailable" as const, reason: "Allowance inspection needs live Base reads; the fixture dataset has none." };
  const who = getAddress(owner);
  const client = makeBaseClient(serverEnv().BASE_RPC_URL);
  const logsRpc = process.env.BASE_LOGS_RPC_URL || serverEnv().BASE_RPC_URL || "https://base-rpc.publicnode.com";
  const logs = createPublicClient({ chain: base, transport: http(logsRpc, { timeout: 12_000 }) });
  const head = await client.getBlockNumber();
  // Discover spenders from Approval events by this owner on the MAG7 tokens (bounded window, honest coverage).
  const discovered = new Set<string>();
  let scanned = "none";
  let scanError: string | null = null;
  try {
    const span = 50_000n;
    let lowest = head;
    for (let i = 0n; i < 4n; i++) {
      const to = head - i * span;
      const from = to - span + 1n;
      const l = await logs.getLogs({ address: TOKENS.map((t) => t.address), event: APPROVAL, args: { owner: who }, fromBlock: from, toBlock: to });
      l.forEach((x) => x.args.spender && discovered.add(getAddress(x.args.spender)));
      lowest = from;
    }
    scanned = `${lowest}–${head}`;
  } catch (e) {
    scanError = (e as Error).message.slice(0, 120);
  }
  const spenders = [...new Set([...Object.keys(KNOWN_SPENDERS).map((a) => getAddress(a)), ...discovered])] as Address[];
  const pairs = TOKENS.flatMap((t) => spenders.map((s) => ({ t, s })));
  const res = await client.multicall({ allowFailure: true, blockNumber: head, contracts: pairs.map(({ t, s }) => ({ address: t.address, abi: ERC20_ABI, functionName: "allowance", args: [who, s] }) as const) });
  const allowances = pairs
    .map(({ t, s }, i) => ({ token: t.address, symbol: t.symbol, spender: s, spenderLabel: labelFor(s) ?? "Unlabelled spender (from Approval logs)", discoveredBy: discovered.has(s) ? "approval-log" : "address-book", raw: res[i]!.status === "success" ? (res[i]!.result as bigint) : null }))
    .filter((x) => x.raw !== null && x.raw > 0n)
    .map((x) => ({ ...x, raw: x.raw!.toString(), unlimited: x.raw! >= MAX_UINT256 / 2n, formatted: x.raw! >= MAX_UINT256 / 2n ? "unlimited" : formatUnits(x.raw!, TOKENS.find((t) => t.symbol === x.symbol)!.decimals) }));
  const pms = Object.entries(AAVE_V4_BASE.positionManagers);
  const pmRes = await client.multicall({ allowFailure: true, blockNumber: head, contracts: pms.flatMap(([, a]) => [
    { address: getAddress(AAVE_V4_BASE.mag7Spoke), abi: SPOKE_WRITE_ABI, functionName: "isPositionManager", args: [who, getAddress(a)] } as const,
    { address: getAddress(AAVE_V4_BASE.mag7Spoke), abi: SPOKE_WRITE_ABI, functionName: "isPositionManagerActive", args: [getAddress(a)] } as const,
  ]) });
  const positionManagers = pms.map(([name, a], i) => ({ name, address: getAddress(a), approvedByUser: pmRes[i * 2]!.status === "success" ? (pmRes[i * 2]!.result as boolean) : null, activeOnSpoke: pmRes[i * 2 + 1]!.status === "success" ? (pmRes[i * 2 + 1]!.result as boolean) : null }));
  return { status: "ok" as const, owner: who, blockNumber: head.toString(), allowances, positionManagers, coverage: { tokens: TOKENS.map((t) => t.symbol), knownSpenders: Object.keys(KNOWN_SPENDERS).length, discoveredSpenders: discovered.size, approvalLogBlocks: scanned, scanError } };
}

export type RevokeRequest = { owner: string; kind: "allowance"; token: string; spender: string } | { owner: string; kind: "positionManager"; positionManager: string };

export async function prepareRevoke(r: RevokeRequest) {
  const owner = getAddress(r.owner);
  const spoke = getAddress(AAVE_V4_BASE.mag7Spoke);
  const rpcUrl = serverEnv().FORK_RPC_URL;
  if (r.kind === "allowance") {
    const token = getAddress(r.token);
    const spender = getAddress(r.spender);
    const t = TOKENS.find((x) => x.address === token);
    if (!t) throw new Error("Only MAG7 listed tokens are supported for revoke preparation.");
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, 0n] });
    const tx = { from: owner, to: token, data, value: "0", chainIdForYourWallet: 8453 };
    const preview = `Set ${t.symbol} allowance for ${labelFor(spender) ?? spender} to 0 (approve(${spender}, 0)).`;
    const fc = forkClient(rpcUrl);
    const sim = await simulateAsOwner(rpcUrl, owner, token, data, { name: `${t.symbol} allowance → spender`, read: async () => String(await fc.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender] })), expect: "0" }).catch((e) => ({ unavailable: (e as Error).message.slice(0, 200) }));
    return { tx, preview, simulation: sim };
  }
  const pm = getAddress(r.positionManager);
  const data = encodeFunctionData({ abi: SPOKE_WRITE_ABI, functionName: "setUserPositionManager", args: [pm, false] });
  const tx = { from: owner, to: spoke, data, value: "0", chainIdForYourWallet: 8453 };
  const preview = `Remove ${labelFor(pm) ?? pm} as a position manager for your MAG7 Spoke position (setUserPositionManager(${pm}, false)).`;
  const fc = forkClient(rpcUrl);
  const sim = await simulateAsOwner(rpcUrl, owner, spoke, data, { name: "isPositionManager(owner, pm)", read: async () => String(await fc.readContract({ address: spoke, abi: SPOKE_WRITE_ABI, functionName: "isPositionManager", args: [owner, pm] })), expect: "false" }).catch((e) => ({ unavailable: (e as Error).message.slice(0, 200) }));
  return { tx, preview, simulation: sim };
}
