/**
 * Capital Intent Engine (server): deterministic parse → typed, bounded constraints → Solver Arena
 * with the independent verifier → constraint checks → Proof Center record. No LLM is called.
 */
import { randomUUID } from "node:crypto";
import { getAddress } from "viem";
import { parseIntent, solveIntent, type IntentSolution, type ParseResult } from "@veydara/intent";
import { formatUnitsSafe } from "@veydara/domain";
import { arenaInputs } from "./aave";
import { isFixtureMode } from "./dataset";
import { store } from "./store";

export interface IntentResponse {
  id: string;
  createdAt: string;
  label: "LIVE-READ" | "FIXTURE";
  user: string;
  blockNumber: string;
  parse: ParseResult;
  solution: (Omit<IntentSolution, "bookUsed" | "plans"> & { plans: (IntentSolution["plans"][number] & { borrowFormatted: string; interestFormatted: string })[]; book: { symbol: string | null; formatted: string; supplied: boolean }[] }) | null;
  explainer: { kind: "deterministic-template"; llm: "not configured (optional, explanatory only)" };
}

export async function runIntent(input: { user: string; text: string; preset?: string }, userId: string | null): Promise<IntentResponse> {
  const parse = parseIntent(input.text, { preset: input.preset });
  const base = { id: randomUUID(), createdAt: new Date().toISOString(), label: (isFixtureMode() ? "FIXTURE" : "LIVE-READ") as IntentResponse["label"], user: getAddress(input.user), explainer: { kind: "deterministic-template" as const, llm: "not configured (optional, explanatory only)" as const } };
  if (!parse.ok || !parse.constraints) return { ...base, blockNumber: "", parse, solution: null };
  const { market, position, book, wallet, usdc } = await arenaInputs(input.user);
  if (!usdc) throw new Error("USDC is not borrowable on the Spoke at this block.");
  const sol = solveIntent({ constraints: parse.constraints, book, market, wallet, borrowReserveId: usdc.reserveId, currentHfWad: position.account.borrowCount === "0" ? null : position.account.healthFactorWad });
  const { bookUsed, plans, ...rest } = sol;
  const res: IntentResponse = {
    ...base,
    blockNumber: market.blockNumber,
    parse,
    solution: {
      ...rest,
      book: bookUsed.collateral.map((c) => ({ symbol: market.reserves[c.reserveId]!.symbol, formatted: formatUnitsSafe(c.amount, market.reserves[c.reserveId]!.decimals), supplied: c.supplied })),
      plans: plans.map((p) => ({ ...p, borrowFormatted: formatUnitsSafe(BigInt(p.plan.borrowAmount), usdc.decimals), interestFormatted: formatUnitsSafe(BigInt(p.interestOverHorizon), usdc.decimals) })),
    },
  };
  await store().saveProof({ id: res.id, kind: "intent-solve", label: res.label, outcome: sol.outcome, account: res.user, userId, createdAt: res.createdAt, record: res }).catch(() => null);
  return res;
}
