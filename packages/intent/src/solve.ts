/**
 * Wire typed constraints into the Solver Arena. An "Intent" solver targets the single effective HF
 * implied by all risk constraints (or the exact requested amount); the standard arena solvers run
 * alongside for comparison. Every plan still goes through the independent verifier, and then through
 * explicit constraint checks. Nothing here signs or sends.
 */
import { ARENA_SOLVERS, POLICY, planAt, verifyPlan, type AaveMarket, type Book, type Plan, type Verdict } from "@veydara/protocols";
import { effectiveTargetHf, type Constraints } from "./constraints";

export interface ConstraintCheck { name: string; pass: boolean; detail: string }
export interface IntentPlan {
  plan: Plan;
  verdict: Verdict;
  constraintChecks: ConstraintCheck[];
  satisfiesAll: boolean;
  interestOverHorizon: string;
}
export interface IntentSolution {
  constraints: Constraints;
  target: { hf: number; hfWad: string; binding: string };
  bookUsed: Book;
  notes: string[];
  plans: IntentPlan[];
  chosen: string | null;
  outcome: "solved" | "no-feasible-plan" | "protect-report" | "no-collateral";
  protect: ConstraintCheck[] | null;
  explanation: string[];
}

const toWad = (x: number) => BigInt(Math.round(x * 10_000)) * 10n ** 14n;
const hf4 = (wad: string | null) => (wad === null ? "∞" : (Number(BigInt(wad) / 10n ** 14n) / 10_000).toFixed(4));

export function solveIntent(input: { constraints: Constraints; book: Book; market: AaveMarket; wallet: Record<number, bigint>; borrowReserveId: number; currentHfWad: string | null }): IntentSolution {
  const { constraints: c, market: m } = input;
  const notes: string[] = [];
  const t = effectiveTargetHf(c);
  const targetWad = toWad(t.hf);
  const want = new Set<string>(c.collateral);
  // Existing supplied collateral always counts (it is already on-chain); what-if wallet supply is limited to the requested symbols.
  const book: Book = {
    debt: input.book.debt,
    collateral: input.book.collateral.filter((x) => x.supplied || want.size === 0 || want.has(m.reserves[x.reserveId]!.symbol ?? "")),
  };
  for (const s of want) {
    if (!book.collateral.some((x) => m.reserves[x.reserveId]!.symbol === s)) notes.push(`${s} was requested as collateral but is neither supplied nor held in the wallet at this block.`);
  }
  const base = { constraints: c, target: { hf: t.hf, hfWad: targetWad.toString(), binding: t.binding }, bookUsed: book, notes };

  if (c.goal === "protect") {
    const cur = input.currentHfWad;
    const checks: ConstraintCheck[] = [
      { name: `current HF ≥ effective target ${t.hf}`, pass: cur === null || BigInt(cur) >= targetWad, detail: `current HF ${hf4(cur)}; binding: ${t.binding}` },
      { name: "current HF ≥ policy floor 1.25", pass: cur === null || BigInt(cur) >= POLICY.minHealthFactorWad, detail: `current HF ${hf4(cur)}` },
    ];
    const ok = checks.every((x) => x.pass);
    return { ...base, plans: [], chosen: null, outcome: "protect-report", protect: checks, explanation: [ok ? `The position already meets every risk constraint (target HF ${t.hf}). No new debt is proposed.` : `The position is below the effective target HF ${t.hf}. Reduce debt or add collateral; Guardian alerts will track it (monitor-only).`] };
  }
  if (!book.collateral.length) return { ...base, plans: [], chosen: null, outcome: "no-collateral", protect: null, explanation: ["No eligible collateral (supplied or in the wallet) matches the intent, so no plan can be built."] };

  const br = m.reserves[input.borrowReserveId]!;
  const fixed = c.borrowAmountUsd !== null ? (BigInt(Math.round(c.borrowAmountUsd * 1e6)) * 10n ** BigInt(br.decimals + m.oracleDecimals)) / (BigInt(br.price) * 10n ** 6n) : undefined;
  const intentSolver = { id: "Intent", thesis: fixed !== undefined ? `Borrow exactly $${c.borrowAmountUsd} of ${br.symbol}; must stay ≥ HF ${t.hf} (${t.binding}).` : `Borrow the maximum that keeps HF ≥ ${t.hf} (${t.binding}).`, target: targetWad, amount: fixed };
  const plans: IntentPlan[] = [intentSolver, ...ARENA_SOLVERS].map((s) => {
    const plan = planAt(book, m, input.borrowReserveId, s);
    const verdict = verifyPlan(plan, book, m, POLICY.minHealthFactorWad, input.wallet);
    const hf = verdict.hfIndependent;
    const amt = BigInt(plan.borrowAmount);
    const checks: ConstraintCheck[] = [{ name: `HF after ≥ effective target ${t.hf}`, pass: hf !== null && BigInt(hf) >= targetWad, detail: `independent HF ${hf4(hf)}; ${t.binding}` }];
    if (fixed !== undefined) checks.push({ name: `borrows the requested $${c.borrowAmountUsd}`, pass: amt === fixed, detail: `plan borrows ${amt} base units, requested ${fixed}` });
    if (c.maxAprPct !== null) checks.push({ name: `APR ≤ ${c.maxAprPct}%`, pass: Number(plan.aprBps) <= c.maxAprPct * 100, detail: `APR ${(Number(plan.aprBps) / 100).toFixed(2)}%` });
    if (want.size) checks.push({ name: "only requested collateral is newly supplied", pass: plan.steps.filter((x) => x.action === "supply").every((x) => want.has(x.symbol ?? "")), detail: plan.steps.filter((x) => x.action === "supply").map((x) => x.symbol).join(", ") || "no new supply" });
    const interest = (amt * BigInt(plan.aprBps) * BigInt(c.horizonDays)) / (10_000n * 365n);
    return { plan, verdict, constraintChecks: checks, satisfiesAll: verdict.accepted && checks.every((x) => x.pass), interestOverHorizon: interest.toString() };
  });
  const feasible = plans.filter((p) => p.satisfiesAll);
  const chosen = feasible.find((p) => p.plan.solver === "Intent") ?? feasible.sort((a, b) => (BigInt(b.plan.borrowAmount) > BigInt(a.plan.borrowAmount) ? 1 : -1))[0] ?? null;
  const explanation = chosen
    ? [`${chosen.plan.solver} satisfies every constraint: borrow ${chosen.plan.borrowAmount} base units of ${br.symbol}, independent HF ${hf4(chosen.verdict.hfIndependent)} ≥ ${t.hf}.`, `Binding constraint: ${t.binding}.`, `Estimated simple interest over ${c.horizonDays} days: ${chosen.interestOverHorizon} base units at ${(Number(chosen.plan.aprBps) / 100).toFixed(2)}% APR.`]
    : [`No candidate satisfies every constraint. The intent plan fails: ${plans[0]!.constraintChecks.filter((x) => !x.pass).map((x) => x.name).concat(plans[0]!.verdict.checks.filter((x) => !x.pass).map((x) => x.name)).join("; ") || "verifier rejected"}.`];
  return { ...base, plans, chosen: chosen?.plan.solver ?? null, outcome: chosen ? "solved" : "no-feasible-plan", protect: null, explanation };
}
