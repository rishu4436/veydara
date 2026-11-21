/** Stage 6 — human-readable preview. Its hash binds exactly what will be signed (chain, account, every to+calldata). */
import { keccak256, toHex, type Address } from "viem";
import { formatUnitsSafe } from "@veydara/domain";
import { MAX_UINT256 } from "@veydara/protocols";
import type { ForkInfo } from "./fork";
import type { RouteStep } from "./route";
import type { RouteVerdict } from "./verify-route";
import type { SimulationResult } from "./simulate";
import type { FreshState } from "./state";

export interface Preview {
  previewHash: string;
  chainLabel: string;
  account: Address;
  lines: { index: number; text: string; to: string; functionName: string; gasInSimulation: string | null }[];
  healthFactor: { before: string; afterVerifier: string; afterSimulation: string };
  warnings: string[];
  notes: string[];
  readyToSign: boolean;
}

export function routeHash(chainId: number, account: string, route: RouteStep[]): string {
  return keccak256(toHex(JSON.stringify({ chainId, account: account.toLowerCase(), steps: route.map((s) => [s.to.toLowerCase(), s.data]) })));
}

export const hfText = (wad: string | null | undefined) => (wad == null || BigInt(wad) === MAX_UINT256 ? "∞ (no debt)" : Number(formatUnitsSafe(BigInt(wad), 18)).toFixed(4));

export function buildPreview(fork: ForkInfo, s: FreshState, route: RouteStep[], v: RouteVerdict, sim: SimulationResult | null): Preview {
  const warnings: string[] = [];
  if (!v.accepted) warnings.push(...v.checks.filter((c) => !c.pass).map((c) => `Verifier: ${c.name} — ${c.detail}`));
  if (sim && !sim.ok && sim.firstRevert) warnings.push(`Simulation reverted at step ${sim.firstRevert.stepIndex + 1}: ${sim.firstRevert.message}`);
  if (!sim) warnings.push("Simulation skipped because the verifier rejected the route.");
  return {
    previewHash: routeHash(fork.chainId, s.account, route),
    chainLabel: `FORK · anvil chain ${fork.chainId} · Base state forked at block ${fork.forkBlockNumber} from ${fork.upstreamHost}. Nothing is sent to Base mainnet.`,
    account: s.account,
    lines: route.map((st) => ({ index: st.index, text: st.summary, to: st.to, functionName: st.functionName, gasInSimulation: sim?.steps.find((x) => x.index === st.index)?.gasUsed ?? null })),
    healthFactor: { before: hfText(s.position.account.healthFactorWad), afterVerifier: hfText(v.predicted.healthFactorWad), afterSimulation: sim?.ok ? hfText(sim.healthFactorWadAfter) : "—" },
    warnings,
    notes: [
      "Signed locally with an anvil-generated test key; chain id 31337 makes the signature invalid on Base (EIP-155).",
      "Approvals are for the exact amount, never unlimited.",
      "Oracle prices are the Spoke's Chainlink-backed prices as of the fork block; equity markets may be closed.",
    ],
    readyToSign: v.accepted && Boolean(sim?.ok),
  };
}
