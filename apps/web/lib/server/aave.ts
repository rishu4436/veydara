import { getAddress } from "viem";
import { makeBaseClient, scanBaseWallet } from "@veydara/chains";
import {
  accountMath, borrowAprBps, drawdownToLiquidationBps, liquidationPrice, maxAdditionalBorrow, parallelFutures, positionLegs, readAaveV4Market, readAaveV4Position, solverArena, verifyPlan,
  AAVE_V4_BASE_SOURCE, AAVE_V4_SOURCE, MAX_UINT256, POLICY, type AaveMarket, type AaveUserPosition, type Book, type ScenarioResult, type Plan, type Verdict,
} from "@veydara/protocols";
import { formatUnitsSafe } from "@veydara/domain";
import { serverEnv } from "./env";
import { fixtureMarket, fixturePosition, isFixtureMode } from "./dataset";

const g = globalThis as unknown as { __aaveMarket?: { at: number; p: Promise<AaveMarket> } };

/** Market snapshot, single-flighted and cached 30 s (one block-pinned multicall set). */
export function aaveMarket(): Promise<AaveMarket> {
  if (isFixtureMode()) return Promise.resolve(fixtureMarket());
  const now = Date.now();
  if (g.__aaveMarket && now - g.__aaveMarket.at < 30_000) return g.__aaveMarket.p;
  const p = readAaveV4Market(makeBaseClient(serverEnv().BASE_RPC_URL));
  g.__aaveMarket = { at: now, p };
  p.catch(() => {
    if (g.__aaveMarket?.p === p) g.__aaveMarket = undefined;
  });
  return p;
}

export const fmtPrice = (raw: string | bigint, dec: number) => formatUnitsSafe(BigInt(raw), dec);
export const sources = { addresses: AAVE_V4_BASE_SOURCE, abi: AAVE_V4_SOURCE };

export interface PositionAnalysis {
  market: AaveMarket;
  position: AaveUserPosition;
  hasPosition: boolean;
  veydara: { healthFactorWad: string; matchesSpoke: boolean; riskPremiumBps: string; drawdownToLiquidationBps: string | null; borrowAprBps: Record<string, string> };
  collateral: { reserveId: number; symbol: string | null; amount: string; formatted: string; priceUsd: string; liquidationPriceUsd: string | null; distancePct: number | null; liquidationNote: string | null }[];
  debt: { reserveId: number; symbol: string | null; amount: string; formatted: string }[];
  headroom: { symbol: string | null; atHf: string; amount: string; formatted: string }[];
  futures: ScenarioResult[];
  sources: typeof sources;
}

export async function analysePosition(user: string): Promise<PositionAnalysis> {
  const market = await aaveMarket();
  const position = isFixtureMode() ? fixturePosition(user) : await readAaveV4Position(makeBaseClient(serverEnv().BASE_RPC_URL), user, market);
  const { coll, debt } = positionLegs(position, market);
  const m = accountMath(coll, debt);
  const book = bookFromPosition(position);
  const collateral = position.reserves
    .filter((r) => r.collateralEnabled && BigInt(r.supplied) > 0n)
    .map((r, i) => {
      // positionLegs emits collateral legs in the same reserve order and with the same filter.
      const res = market.reserves[r.reserveId]!;
      const target = coll[i]!;
      const others = coll.filter((_, j) => j !== i);
      const lp = liquidationPrice(target, others, debt);
      const px = BigInt(res.price);
      return {
        reserveId: r.reserveId,
        symbol: res.symbol,
        amount: r.supplied,
        formatted: formatUnitsSafe(BigInt(r.supplied), res.decimals),
        priceUsd: fmtPrice(px, market.oracleDecimals),
        liquidationPriceUsd: lp === null || lp === 0n ? null : fmtPrice(lp, market.oracleDecimals),
        distancePct: lp === null || lp === 0n || px === 0n ? null : Number(((px - lp) * 1_000_000n) / px) / 10_000,
        liquidationNote: lp === 0n ? "Other collateral alone keeps HF ≥ 1 even if this asset went to $0" : lp === null ? "No debt" : null,
      };
    });
  const usdc = market.reserves.find((r) => r.symbol === "USDC");
  const headroom = usdc
    ? [1_500000000000000000n, 2_000000000000000000n].map((t) => {
        const a = maxAdditionalBorrow(coll, debt, { decimals: usdc.decimals, price: BigInt(usdc.price) }, t);
        return { symbol: usdc.symbol, atHf: (Number(t / 10n ** 16n) / 100).toFixed(2), amount: a.toString(), formatted: formatUnitsSafe(a, usdc.decimals) };
      })
    : [];
  return {
    market,
    position,
    hasPosition: coll.length > 0 || debt.length > 0,
    veydara: {
      healthFactorWad: m.healthFactor.toString(),
      matchesSpoke: m.healthFactor.toString() === position.account.healthFactorWad,
      riskPremiumBps: m.riskPremiumBps.toString(),
      drawdownToLiquidationBps: drawdownToLiquidationBps(m.healthFactor)?.toString() ?? null,
      borrowAprBps: Object.fromEntries(market.reserves.filter((r) => r.borrowable).map((r) => [r.symbol ?? String(r.reserveId), borrowAprBps(BigInt(r.drawnRateRay), m.riskPremiumBps).toString()])),
    },
    collateral,
    debt: position.reserves.filter((r) => BigInt(r.debtRay) > 0n).map((r) => ({ reserveId: r.reserveId, symbol: market.reserves[r.reserveId]!.symbol, amount: r.debt, formatted: formatUnitsSafe(BigInt(r.debt), market.reserves[r.reserveId]!.decimals) })),
    headroom,
    futures: parallelFutures(book, market),
    sources,
  };
}

export function bookFromPosition(p: AaveUserPosition): Book {
  return {
    collateral: p.reserves.filter((r) => r.collateralEnabled && BigInt(r.supplied) > 0n).map((r) => ({ reserveId: r.reserveId, amount: BigInt(r.supplied), supplied: true })),
    debt: p.reserves.filter((r) => BigInt(r.debtRay) > 0n).map((r) => ({ reserveId: r.reserveId, amount: BigInt(r.debt), amountRay: BigInt(r.debtRay) })),
  };
}

export interface ArenaResponse {
  basis: "existing-position" | "wallet-what-if" | "position-plus-wallet";
  user: string;
  blockNumber: string;
  book: { collateral: { symbol: string | null; formatted: string; supplied: boolean }[]; debt: { symbol: string | null; formatted: string }[] };
  plans: (Plan & { borrowFormatted: string; verdict: Verdict })[];
  futures: ScenarioResult[];
  futuresBasis: string;
  policy: { minHealthFactor: string; note: string };
  note: string;
  sources: typeof sources;
}

/**
 * Solver Arena for a user: existing Aave collateral plus (what-if) any eligible
 * verified tokens in the wallet at their block-pinned balances.
 */
export async function arenaFor(user: string): Promise<ArenaResponse> {
  const market = await aaveMarket();
  const client = makeBaseClient(serverEnv().BASE_RPC_URL);
  const [position, scan] = isFixtureMode()
    ? [fixturePosition(user), { holdings: [] as Awaited<ReturnType<typeof scanBaseWallet>>["holdings"] }]
    : await Promise.all([readAaveV4Position(client, user, market), scanBaseWallet(getAddress(user), { client })]);
  const book = bookFromPosition(position);
  const wallet: Record<number, bigint> = {};
  for (const h of scan.holdings) {
    if (h.identity.status !== "verified" || h.address === "native") continue;
    const res = market.reserves.find((r) => r.underlying.toLowerCase() === h.address.toLowerCase());
    if (!res || res.collateralFactorBps === 0 || BigInt(h.rawBalance) === 0n) continue;
    wallet[res.reserveId] = BigInt(h.rawBalance);
    const existing = book.collateral.find((c) => c.reserveId === res.reserveId);
    if (!existing) book.collateral.push({ reserveId: res.reserveId, amount: BigInt(h.rawBalance), supplied: false });
  }
  const usdc = market.reserves.find((r) => r.symbol === "USDC" && r.borrowable);
  const hasExisting = position.reserves.some((r) => r.collateralEnabled && BigInt(r.supplied) > 0n);
  const hasWallet = book.collateral.some((c) => !c.supplied);
  const plans = usdc && book.collateral.length
    ? solverArena(book, market, usdc.reserveId).map((p) => ({ ...p, borrowFormatted: formatUnitsSafe(BigInt(p.borrowAmount), usdc.decimals), verdict: verifyPlan(p, book, market, POLICY.minHealthFactorWad, wallet) }))
    : [];
  return {
    basis: hasExisting && hasWallet ? "position-plus-wallet" : hasExisting ? "existing-position" : "wallet-what-if",
    user: getAddress(user),
    blockNumber: market.blockNumber,
    book: {
      collateral: book.collateral.map((c) => ({ symbol: market.reserves[c.reserveId]!.symbol, formatted: formatUnitsSafe(c.amount, market.reserves[c.reserveId]!.decimals), supplied: c.supplied })),
      debt: book.debt.map((d) => ({ symbol: market.reserves[d.reserveId]!.symbol, formatted: formatUnitsSafe(d.amount, market.reserves[d.reserveId]!.decimals) })),
    },
    plans,
    ...(() => {
      if (!book.collateral.length) return { futures: [], futuresBasis: "No collateral." };
      const pick = plans.find((p) => p.solver === "Gap-proof" && p.verdict.accepted);
      if (book.debt.length === 0 && pick && usdc) {
        const withPlan: Book = { collateral: book.collateral, debt: [{ reserveId: usdc.reserveId, amount: BigInt(pick.borrowAmount) }] };
        return { futures: parallelFutures(withPlan, market), futuresBasis: `No existing debt — scenarios assume the verified Gap-proof plan (borrow ${pick.borrowFormatted} USDC).` };
      }
      return { futures: parallelFutures(book, market), futuresBasis: "Existing position as read on-chain" + (hasWallet ? " plus what-if supply of eligible wallet holdings." : ".") };
    })(),
    policy: { minHealthFactor: "1.25", note: POLICY.note },
    note: book.collateral.length ? "Simulation on live, block-pinned Aave V4 state. No transaction is built, signed or sent. Eligibility to use the Equities Hub is unverified." : "No Aave V4 collateral and no eligible tokenized equities in this wallet — nothing to simulate.",
    sources,
  };
}

export const isNoDebt = (hf: string) => BigInt(hf) === MAX_UINT256;
