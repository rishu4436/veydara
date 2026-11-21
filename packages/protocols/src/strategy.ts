/**
 * Parallel Futures (deterministic scenario grid) and the Solver Arena
 * (candidate borrow plans + an independent verifier). Pure functions over a
 * live, block-pinned Aave V4 market snapshot. Nothing here signs or sends.
 */
import type { AaveMarket, AaveReserve } from "./aave-v4-reads";
import { accountMath, accruedInterest, borrowAprBps, BPS, drawdownToLiquidationBps, liquidationBonusBps, maxAdditionalBorrow, MAX_UINT256, WAD, type CollateralLeg, type DebtLeg } from "./aave-v4-math";

export interface BookCollateral { reserveId: number; amount: bigint; /** true if already supplied on-chain; false = what-if supply from wallet */ supplied: boolean }
export interface BookDebt { reserveId: number; amount: bigint; amountRay?: bigint }
export interface Book { collateral: BookCollateral[]; debt: BookDebt[] }

const isEquity = (r: AaveReserve) => Boolean(r.symbol && /c$/.test(r.symbol) && r.symbol !== "USDC");

function legs(book: Book, m: AaveMarket, priceOf: (r: AaveReserve) => bigint = (r) => BigInt(r.price)): { coll: CollateralLeg[]; debt: DebtLeg[] } {
  return {
    coll: book.collateral.map((c) => {
      const r = m.reserves[c.reserveId]!;
      return { amount: c.amount, decimals: r.decimals, price: priceOf(r), collateralFactorBps: BigInt(r.collateralFactorBps), collateralRiskBps: BigInt(r.collateralRiskBps) };
    }),
    debt: book.debt.map((d) => {
      const r = m.reserves[d.reserveId]!;
      return { amount: d.amount, amountRay: d.amountRay, decimals: r.decimals, price: priceOf(r) };
    }),
  };
}

/* ------------------------------ Parallel Futures ------------------------------ */
export interface ScenarioResult {
  id: string;
  label: string;
  assumption: string;
  healthFactorWad: string;
  status: "no-debt" | "safe" | "near-target" | "liquidatable";
  drawdownToLiquidationBps: string | null;
  liquidationBonusBps: string | null;
  collateralValueUsd: string;
  debtValueUsd: string;
}

const valueToUsd = (v: bigint) => (Number(v / 10n ** 20n) / 1e6).toFixed(2); // 1e26 Value = $1

export function parallelFutures(book: Book, m: AaveMarket): ScenarioResult[] {
  const target = BigInt(m.liquidation.targetHealthFactor);
  const largest = book.collateral.reduce<BookCollateral | null>((best, c) => {
    const r = m.reserves[c.reserveId]!;
    const v = c.amount * BigInt(r.price) * 10n ** BigInt(18 - r.decimals);
    if (!best) return c;
    const br = m.reserves[best.reserveId]!;
    return v > best.amount * BigInt(br.price) * 10n ** BigInt(18 - br.decimals) ? c : best;
  }, null);
  const shock = (bps: bigint, pred: (r: AaveReserve) => boolean) => (r: AaveReserve) => (pred(r) ? (BigInt(r.price) * (BPS - bps)) / BPS : BigInt(r.price));
  const scenarios: { id: string; label: string; assumption: string; price: (r: AaveReserve) => bigint; days?: bigint; rateMult?: bigint }[] = [
    { id: "now", label: "Now", assumption: "Current Spoke oracle prices at the pinned block.", price: (r) => BigInt(r.price) },
    { id: "gap10", label: "Monday gap −10%", assumption: "All tokenized equities reopen 10% lower (weekend gap); USDC unchanged.", price: shock(1000n, isEquity) },
    { id: "gap20", label: "Gap −20%", assumption: "All tokenized equities −20%.", price: shock(2000n, isEquity) },
    { id: "crash35", label: "Crash −35%", assumption: "All tokenized equities −35% (2020/2022-style drawdown).", price: shock(3500n, isEquity) },
    { id: "single40", label: `Largest collateral −40%`, assumption: `Only ${largest ? m.reserves[largest.reserveId]!.symbol : "the largest collateral"} falls 40%; others unchanged.`, price: shock(4000n, (r) => Boolean(largest && r.reserveId === largest.reserveId)) },
    { id: "depeg", label: "Debt asset +2%", assumption: "Borrowed stablecoin trades at $1.02 on the oracle (debt grows in USD).", price: (r) => (r.symbol === "USDC" ? (BigInt(r.price) * 10200n) / BPS : BigInt(r.price)) },
    { id: "rates", label: "Rates ×2 for 90 days", assumption: "Drawn rate doubles for 90 days at today's prices; simple interest accrues on debt.", price: (r) => BigInt(r.price), days: 90n, rateMult: 2n },
  ];
  return scenarios.map((s) => {
    let b = book;
    if (s.days) {
      b = {
        ...book,
        debt: book.debt.map((d) => {
          const r = m.reserves[d.reserveId]!;
          const extra = accruedInterest(d.amount, BigInt(r.drawnRateRay) * (s.rateMult ?? 1n), 0n, s.days! * 86400n);
          return { reserveId: d.reserveId, amount: d.amount + extra, amountRay: d.amountRay !== undefined ? d.amountRay + extra * 10n ** 27n : undefined };
        }),
      };
    }
    const { coll, debt } = legs(b, m, s.price);
    const a = accountMath(coll, debt);
    const hf = a.healthFactor;
    const maxBonus = coll.length ? book.collateral.map((c) => BigInt(m.reserves[c.reserveId]!.maxLiquidationBonusBps)).reduce((x, y) => (y > x ? y : x), 0n) : 0n;
    return {
      id: s.id,
      label: s.label,
      assumption: s.assumption,
      healthFactorWad: hf.toString(),
      status: hf === MAX_UINT256 ? "no-debt" : hf < WAD ? "liquidatable" : hf < target ? "near-target" : "safe",
      drawdownToLiquidationBps: drawdownToLiquidationBps(hf)?.toString() ?? null,
      liquidationBonusBps: hf < WAD && maxBonus > 0n ? liquidationBonusBps(hf, { healthFactorForMaxBonus: BigInt(m.liquidation.healthFactorForMaxBonus), liquidationBonusFactor: BigInt(m.liquidation.liquidationBonusFactor) }, maxBonus).toString() : null,
      collateralValueUsd: valueToUsd(a.totalCollateralValue),
      debtValueUsd: valueToUsd(a.totalDebtValue),
    };
  });
}

/* -------------------------------- Solver Arena -------------------------------- */
export interface Plan {
  solver: string;
  thesis: string;
  targetHfWad: string;
  steps: { action: "supply" | "borrow"; reserveId: number; symbol: string | null; amount: string }[];
  borrowReserveId: number;
  borrowAmount: string;
  expectedHfWad: string;
  aprBps: string;
  interest30d: string;
}

export const POLICY = { minHealthFactorWad: 1_250000000000000000n, note: "VEYDARA policy floor HF 1.25 (above the Spoke targetHealthFactor 1.24 used to restore liquidated positions)." } as const;

export function solverArena(book: Book, m: AaveMarket, borrowReserveId: number): Plan[] {
  const br = m.reserves[borrowReserveId]!;
  const { coll, debt } = legs(book, m);
  const rp = accountMath(coll, debt).riskPremiumBps;
  const headroom = (() => {
    const liq = BigInt(br.hubLiquidity);
    const cap = br.drawCapTokens === null ? null : BigInt(br.drawCapTokens) * 10n ** BigInt(br.decimals) - BigInt(br.totalDebt);
    return cap === null ? liq : cap < liq ? (cap > 0n ? cap : 0n) : liq;
  })();
  const solvers: { id: string; thesis: string; target: bigint }[] = [
    { id: "Fortress", thesis: "Keep HF ≥ 2.00: survives a ~50% uniform equity drawdown.", target: 2_000000000000000000n },
    { id: "Gap-proof", thesis: "After a −20% Monday gap, HF stays at or above the Spoke target 1.24 (HF ≥ 1.55 now).", target: 1_550000000000000000n },
    { id: "Buffer-35", thesis: "Collateral can fall 35% before liquidation (HF ≥ 1/(1−0.35)).", target: 1_538461538461538462n },
    { id: "Aggressive", thesis: "Borrow up to HF 1.10 — included to show the verifier rejecting unsafe candidates.", target: 1_100000000000000000n },
  ];
  return solvers.map((s) => {
    let amt = maxAdditionalBorrow(coll, debt, { decimals: br.decimals, price: BigInt(br.price) }, s.target);
    if (amt > headroom) amt = headroom;
    const after = accountMath(coll, [...debt, { amount: amt, decimals: br.decimals, price: BigInt(br.price) }]);
    return {
      solver: s.id,
      thesis: s.thesis,
      targetHfWad: s.target.toString(),
      steps: [
        ...book.collateral.filter((c) => !c.supplied).map((c) => ({ action: "supply" as const, reserveId: c.reserveId, symbol: m.reserves[c.reserveId]!.symbol, amount: c.amount.toString() })),
        { action: "borrow" as const, reserveId: borrowReserveId, symbol: br.symbol, amount: amt.toString() },
      ],
      borrowReserveId,
      borrowAmount: amt.toString(),
      expectedHfWad: after.healthFactor.toString(),
      aprBps: borrowAprBps(BigInt(br.drawnRateRay), after.riskPremiumBps > rp ? after.riskPremiumBps : rp).toString(),
      interest30d: accruedInterest(amt, BigInt(br.drawnRateRay), after.riskPremiumBps, 30n * 86400n).toString(),
    };
  });
}
