/** Stage 3 — typed route: intent → exact calldata steps against the pinned Spoke ABI. Approvals are exact-amount, never infinite. */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { ERC20_ABI, SPOKE_WRITE_ABI } from "@veydara/protocols";
import { formatUnitsSafe } from "@veydara/domain";
import type { Intent } from "./intent";
import type { FreshState } from "./state";

export type StepKind = "approve" | "supply" | "enableCollateral" | "borrow" | "repay" | "withdraw";
export interface RouteStep {
  index: number;
  actionIndex: number;
  kind: StepKind;
  to: Address;
  functionName: string;
  args: string[];
  data: Hex;
  value: "0";
  reserveId: number;
  symbol: string;
  amount: string | null;
  summary: string;
}

export function buildRoute(intent: Intent, s: FreshState): RouteStep[] {
  const steps: RouteStep[] = [];
  const allowance: Record<number, bigint> = Object.fromEntries(Object.entries(s.allowance).map(([k, v]) => [Number(k), BigInt(v)]));
  const push = (st: Omit<RouteStep, "index" | "value">) => steps.push({ ...st, index: steps.length, value: "0" });
  const spoke = s.market.spoke;
  const who = intent.account;
  intent.actions.forEach((a, actionIndex) => {
    const r = s.market.reserves[a.reserveId]!;
    const sym = r.symbol ?? `reserve#${r.reserveId}`;
    const fmt = (v: bigint) => `${formatUnitsSafe(v, r.decimals)} ${sym}`;
    if (a.kind === "enableCollateral") {
      push({ actionIndex, kind: a.kind, to: spoke, functionName: "setUsingAsCollateral", args: [String(a.reserveId), "true", who], data: encodeFunctionData({ abi: SPOKE_WRITE_ABI, functionName: "setUsingAsCollateral", args: [BigInt(a.reserveId), true, who] }), reserveId: a.reserveId, symbol: sym, amount: null, summary: `Use ${sym} supplied on the MAG7 Spoke as collateral` });
      return;
    }
    const amt = BigInt(a.amount);
    if (a.kind === "supply" || a.kind === "repay") {
      const have = allowance[a.reserveId] ?? 0n;
      if (have < amt) {
        push({ actionIndex, kind: "approve", to: r.underlying, functionName: "approve", args: [spoke, amt.toString()], data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spoke, amt] }), reserveId: a.reserveId, symbol: sym, amount: amt.toString(), summary: `Approve the Aave V4 MAG7 Spoke to pull exactly ${fmt(amt)} (not unlimited)` });
        allowance[a.reserveId] = amt;
      }
      allowance[a.reserveId] = (allowance[a.reserveId] ?? 0n) - amt;
    }
    const verb = { supply: "Supply", borrow: "Borrow", repay: "Repay", withdraw: "Withdraw" }[a.kind];
    push({ actionIndex, kind: a.kind, to: spoke, functionName: a.kind, args: [String(a.reserveId), amt.toString(), who], data: encodeFunctionData({ abi: SPOKE_WRITE_ABI, functionName: a.kind, args: [BigInt(a.reserveId), amt, who] }), reserveId: a.reserveId, symbol: sym, amount: amt.toString(), summary: `${verb} ${fmt(amt)} ${a.kind === "supply" || a.kind === "repay" ? "to" : "from"} the MAG7 Spoke (reserve #${a.reserveId})` });
  });
  return steps;
}
