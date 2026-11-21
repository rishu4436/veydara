/**
 * Independent plan verifier. Deliberately does NOT import aave-v4-math: it
 * recomputes health from first principles with exact rationals over the raw
 * snapshot fields, then checks every protocol and policy constraint.
 * A plan is shown as "verified" only if every check passes.
 */
import type { AaveMarket } from "./aave-v4-reads";
import type { Book, Plan } from "./strategy";

interface Q { n: bigint; d: bigint }
const q = (n: bigint, d = 1n): Q => ({ n, d });
const add = (a: Q, b: Q): Q => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const mul = (a: Q, b: Q): Q => ({ n: a.n * b.n, d: a.d * b.d });
const geq = (a: Q, b: Q) => a.n * b.d >= b.n * a.d;

export interface Verdict { solver: string; accepted: boolean; status: "verified" | "rejected" | "no-room"; checks: { name: string; pass: boolean; detail: string }[]; hfIndependent: string | null }

export function verifyPlan(plan: Plan, book: Book, m: AaveMarket, policyMinHfWad: bigint, wallet: Record<number, bigint> = {}): Verdict {
  const checks: Verdict["checks"] = [];
  const c = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const usd = (reserveId: number, amount: bigint): Q => {
    const r = m.reserves[reserveId]!;
    return q(amount * BigInt(r.price), 10n ** BigInt(r.decimals + m.oracleDecimals));
  };
  // collateral after plan
  let weighted = q(0n);
  for (const x of book.collateral) {
    const r = m.reserves[x.reserveId]!;
    weighted = add(weighted, mul(usd(x.reserveId, x.amount), q(BigInt(r.collateralFactorBps), 10_000n)));
    if (!x.supplied) {
      c(`supply ${r.symbol}: reserve open`, !r.paused && !r.frozen && r.spokeActive && !r.spokeHalted, `paused=${r.paused} frozen=${r.frozen} active=${r.spokeActive} halted=${r.spokeHalted}`);
      c(`supply ${r.symbol}: collateral factor > 0`, r.collateralFactorBps > 0, `CF=${r.collateralFactorBps} bps`);
      const bal = wallet[x.reserveId];
      c(`supply ${r.symbol}: within wallet balance`, bal !== undefined && x.amount <= bal, `amount=${x.amount} balance=${bal ?? "unknown"}`);
      if (r.addCapTokens !== null) {
        const room = BigInt(r.addCapTokens) * 10n ** BigInt(r.decimals) - BigInt(r.suppliedAssets);
        c(`supply ${r.symbol}: within add cap`, x.amount <= room, `room=${room}`);
      }
    }
  }
  const br = m.reserves[plan.borrowReserveId]!;
  const amt = BigInt(plan.borrowAmount);
  let debt = q(0n);
  for (const d of book.debt) debt = add(debt, d.amountRay !== undefined ? usd(d.reserveId, d.amountRay) : usd(d.reserveId, d.amount * 10n ** 27n));
  debt = { n: debt.n, d: debt.d * 10n ** 27n };
  debt = add(debt, usd(plan.borrowReserveId, amt));
  c("borrowing room at this target HF", amt > 0n, amt > 0n ? `amount=${amt}` : "Position is already at or beyond this target; no additional borrow proposed.");
  c(`borrow ${br.symbol}: reserve borrowable and open`, br.borrowable && !br.paused && !br.frozen && br.spokeActive && !br.spokeHalted, `borrowable=${br.borrowable} paused=${br.paused} frozen=${br.frozen}`);
  c(`borrow ${br.symbol}: within hub liquidity`, amt <= BigInt(br.hubLiquidity), `liquidity=${br.hubLiquidity}`);
  if (br.drawCapTokens !== null) c(`borrow ${br.symbol}: within spoke draw cap`, BigInt(br.totalDebt) + amt <= BigInt(br.drawCapTokens) * 10n ** BigInt(br.decimals), `drawCap=${br.drawCapTokens} tokens, current debt=${br.totalDebt}`);
  let hfStr: string | null = null;
  if (debt.n > 0n) {
    const hf: Q = { n: weighted.n * debt.d, d: weighted.d * debt.n };
    hfStr = ((hf.n * 10n ** 18n) / hf.d).toString();
    c("health factor ≥ 1.00 (protocol)", geq(hf, q(1n)), `HF=${(Number((hf.n * 10_000n) / hf.d) / 10_000).toFixed(4)}`);
    c("health factor ≥ policy floor", geq(hf, q(policyMinHfWad, 10n ** 18n)), `floor=${Number(policyMinHfWad / 10n ** 14n) / 10_000}`);
    const claimed = BigInt(plan.expectedHfWad);
    const diff = claimed > BigInt(hfStr) ? claimed - BigInt(hfStr) : BigInt(hfStr) - claimed;
    c("solver's HF claim matches independent recomputation", diff <= 10n ** 6n, `claimed=${claimed} independent=${hfStr}`);
  }
  const accepted = checks.every((x) => x.pass);
  const onlyNoRoom = amt === 0n; // nothing would be borrowed; remaining checks describe the existing position
  return { solver: plan.solver, accepted, status: accepted ? "verified" : onlyNoRoom ? "no-room" : "rejected", checks, hfIndependent: hfStr };
}
