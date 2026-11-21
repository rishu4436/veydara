/** Read-only Kamino Lend (Solana) snapshot types. No SDK import here (safe for client type imports). */

/** Verified addresses. Market: Kamino developer docs (xStocks examples). Program: @kamino-finance/klend-sdk PROGRAM_ID. */
export const KAMINO_SOURCE = {
  programId: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
  sdk: "@kamino-finance/klend-sdk@14.0.0",
  markets: {
    xStocks: {
      address: "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua",
      name: "xStocks Market",
      source: "https://docs.kamino.com/build/developers/multiply/operations/deposit-xstocks",
    },
  },
  notIncluded: "Other markets that list xStocks (e.g. curated/hidden markets) are not shown until their address is confirmed from an official Kamino source.",
} as const;

export type KaminoAssetKind = "tokenized-equity" | "stablecoin" | "crypto";

export interface KaminoReserveRow {
  symbol: string;
  reserve: string;
  mint: string;
  decimals: number;
  kind: KaminoAssetKind;
  status: "Active" | "Obsolete" | "Hidden";
  ltvPct: number;
  liquidationThresholdPct: number;
  liquidationBonusPct: { min: number; max: number };
  borrowFactorPct: number;
  priceUsd: string;
  oracleValid: boolean;
  supplyApy: number;
  borrowApy: number;
  totalSupply: string;
  depositLimit: string;
  borrowed: string;
  borrowLimit: string;
  utilization: number;
  /** Fraction of the deposit cap already used (≥ 1 = deposits closed). */
  depositCapUsed: number;
  borrowable: boolean;
}

export interface KaminoMarketSnapshot {
  protocol: "kamino-lend";
  chain: "solana";
  market: string;
  name: string;
  programId: string;
  slot: string;
  blockTime: number;
  readAt: string;
  reserves: KaminoReserveRow[];
  source: typeof KAMINO_SOURCE;
}

export interface KaminoPositionLeg { symbol: string; mint: string; amount: string; valueUsd: string }
export interface KaminoObligationRow {
  obligation: string;
  owner: string;
  deposits: KaminoPositionLeg[];
  borrows: KaminoPositionLeg[];
  totalDepositUsd: string;
  totalBorrowUsd: string;
  netValueUsd: string;
  /** Kamino UI definition (borrow-factor-adjusted borrows / collateral deposits). */
  ltv: number;
  liquidationLtv: number;
  /** Uniform collateral drop (prices of deposits, debt flat) until ltv reaches liquidationLtv. null if no debt. */
  distanceToLiquidationPct: number | null;
}

export interface KaminoPositionsSnapshot {
  protocol: "kamino-lend";
  chain: "solana";
  market: string;
  owner: string;
  slot: string;
  readAt: string;
  obligations: KaminoObligationRow[];
  source: typeof KAMINO_SOURCE;
}

/** If collateral value falls by d (debt flat), ltv' = ltv/(1−d). Liquidation when ltv' = liqLtv ⇒ d = 1 − ltv/liqLtv. */
export function distanceToLiquidation(ltv: number, liquidationLtv: number): number | null {
  if (ltv <= 0) return null;
  if (liquidationLtv <= 0) return 0;
  return Math.max(0, 1 - ltv / liquidationLtv);
}

export function classify(symbol: string): KaminoAssetKind {
  if (/^(USDC|USDT|USDG|PYUSD|USDS|FDUSD)$/i.test(symbol)) return "stablecoin";
  if (/x$/.test(symbol) && symbol !== "x") return "tokenized-equity";
  return "crypto";
}
