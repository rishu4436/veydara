/**
 * Deterministic Aave V4 Spoke risk math in bigint, mirroring
 * src/spoke/Spoke.sol::_processUserAccountData and
 * src/spoke/libraries/LiquidationLogic.sol::calculateLiquidationBonus
 * (aave/aave-v4 @ 4885a7ad). Units:
 *   price      — oracle units (8 decimals on the MAG7 spoke oracle)
 *   Value      — amount * price * 10^(18 - decimals); 1e26 Value = 1 USD
 *   CF, bonus  — BPS (10_000 = 100%)
 *   HF         — WAD (1e18 = 1.00)
 *   rates      — RAY per year (1e27 = 100%/yr)
 * Rounding: collateral down, debt up, liquidation price up (all conservative for the user).
 */
export const WAD = 10n ** 18n;
export const RAY = 10n ** 27n;
export const BPS = 10_000n;
export const MAX_UINT256 = 2n ** 256n - 1n;
export const HF_LIQUIDATION_THRESHOLD = WAD;

export interface CollateralLeg { amount: bigint; decimals: number; price: bigint; collateralFactorBps: bigint; collateralRiskBps?: bigint }
export interface DebtLeg {
  amount: bigint;
  decimals: number;
  price: bigint;
  /** Optional full-precision debt (asset units × RAY); preferred over amount when present. */
  amountRay?: bigint;
}
const legRay = (d: DebtLeg) => d.amountRay ?? d.amount * RAY;

const ceilDiv = (a: bigint, b: bigint) => (a === 0n ? 0n : (a - 1n) / b + 1n);

export function toValue(amount: bigint, decimals: number, price: bigint): bigint {
  if (decimals > 18) throw new Error("decimals > 18 unsupported (reverts on-chain)");
  return amount * price * 10n ** BigInt(18 - decimals);
}

export interface AccountMath {
  totalCollateralValue: bigint;
  /** Σ CF·value (BPS-weighted Value). */
  weightedCollateralValue: bigint;
  totalDebtValue: bigint;
  /** WAD; MAX_UINT256 when there is no debt (same convention as the Spoke). */
  healthFactor: bigint;
  /** WAD-scaled average collateral factor. */
  avgCollateralFactorWad: bigint;
  /** BPS, weighted by collateral covering the debt in ascending collateral-risk order. */
  riskPremiumBps: bigint;
}

export function accountMath(coll: CollateralLeg[], debt: DebtLeg[]): AccountMath {
  let total = 0n;
  let weighted = 0n;
  const info: { risk: bigint; value: bigint }[] = [];
  for (const c of coll) {
    if (c.collateralFactorBps <= 0n || c.amount <= 0n) continue;
    const v = toValue(c.amount, c.decimals, c.price);
    total += v;
    weighted += c.collateralFactorBps * v;
    info.push({ risk: c.collateralRiskBps ?? 0n, value: v });
  }
  // debt in asset units → RAY-scaled like the Spoke (drawnShares*drawnIndex + premiumRay)
  let debtRay = 0n;
  for (const d of debt) debtRay += toValue(legRay(d), d.decimals, d.price);
  const healthFactor = debtRay > 0n ? (weighted * (WAD / BPS) * RAY) / debtRay : MAX_UINT256;
  const avgCollateralFactorWad = total > 0n ? (weighted * (WAD / BPS)) / total : 0n;
  // risk premium
  info.sort((a, b) => (a.risk === b.risk ? (b.value > a.value ? 1 : -1) : a.risk < b.risk ? -1 : 1));
  const totalDebtValue = ceilDiv(debtRay, RAY);
  let left = totalDebtValue;
  let rp = 0n;
  for (const x of info) {
    if (left === 0n) break;
    const used = x.value < left ? x.value : left;
    rp += used * x.risk;
    left -= used;
  }
  const covered = totalDebtValue - left;
  const riskPremiumBps = covered > 0n ? ceilDiv(rp, covered) : 0n;
  return { totalCollateralValue: total, weightedCollateralValue: weighted, totalDebtValue, healthFactor, avgCollateralFactorWad, riskPremiumBps };
}

/**
 * Largest additional borrow of `debtAsset` keeping HF >= targetHfWad (floor).
 * Never returns a negative number; does NOT check caps or liquidity (callers must).
 */
export function maxAdditionalBorrow(coll: CollateralLeg[], existingDebt: DebtLeg[], debtAsset: { decimals: number; price: bigint }, targetHfWad: bigint): bigint {
  if (targetHfWad < WAD) throw new Error("target health factor must be >= 1.00");
  const m = accountMath(coll, existingDebt);
  // need: weighted*1e14*RAY / (debtRay + x*RAY*price*10^(18-d)) >= target
  // ⇒ x <= (weighted*1e14*RAY*WAD/target - debtRay) / (RAY*price*10^(18-d))
  const existingRay = existingDebt.reduce((s, d) => s + toValue(legRay(d), d.decimals, d.price), 0n);
  const allowedRay = (m.weightedCollateralValue * (WAD / BPS) * RAY * WAD) / (targetHfWad * WAD);
  const room = allowedRay - existingRay;
  if (room <= 0n) return 0n;
  const unit = toValue(RAY, debtAsset.decimals, debtAsset.price);
  return room / unit;
}

/**
 * Single-collateral liquidation price (oracle units): price at which HF reaches 1.00,
 * other collateral and debt prices held constant. null when no debt.
 */
export function liquidationPrice(target: CollateralLeg, otherColl: CollateralLeg[], debt: DebtLeg[]): bigint | null {
  if (target.amount <= 0n || target.collateralFactorBps <= 0n) return null;
  const debtRay = debt.reduce((s, d) => s + toValue(legRay(d), d.decimals, d.price), 0n);
  if (debtRay === 0n) return null;
  const otherWeighted = otherColl.reduce((s, c) => (c.collateralFactorBps > 0n && c.amount > 0n ? s + c.collateralFactorBps * toValue(c.amount, c.decimals, c.price) : s), 0n);
  // HF=1: (otherWeighted + cf*amt*p*scale)*1e14*RAY = debtRay*1e18  ⇒ cf*amt*p*scale = debtRay*BPS/RAY - otherWeighted
  const needWeighted = ceilDiv(debtRay * BPS, RAY) - otherWeighted;
  if (needWeighted <= 0n) return 0n; // other collateral alone covers the debt
  const denom = target.collateralFactorBps * target.amount * 10n ** BigInt(18 - target.decimals);
  return ceilDiv(needWeighted, denom);
}

/** Uniform collateral drawdown (BPS) that brings HF to 1.00 with debt prices fixed: 1 - 1/HF. */
export function drawdownToLiquidationBps(hfWad: bigint): bigint | null {
  if (hfWad === MAX_UINT256) return null;
  if (hfWad <= WAD) return 0n;
  return BPS - ceilDiv(BPS * WAD, hfWad);
}

export function liquidationBonusBps(hfWad: bigint, cfg: { healthFactorForMaxBonus: bigint; liquidationBonusFactor: bigint }, maxLiquidationBonusBps: bigint): bigint {
  if (hfWad <= cfg.healthFactorForMaxBonus) return maxLiquidationBonusBps;
  const minBonus = ((maxLiquidationBonusBps - BPS) * cfg.liquidationBonusFactor) / BPS + BPS;
  if (hfWad >= WAD) return minBonus;
  return minBonus + ((maxLiquidationBonusBps - minBonus) * (WAD - hfWad)) / (WAD - cfg.healthFactorForMaxBonus);
}

/** Effective borrow APR in BPS: drawn rate × (1 + risk premium). Linear (simple) interest per MathUtils.calculateLinearInterest. */
export function borrowAprBps(drawnRateRay: bigint, riskPremiumBps: bigint): bigint {
  return (drawnRateRay * BPS * (BPS + riskPremiumBps)) / (RAY * BPS);
}

/** Simple interest over `seconds` on `amount` at drawn rate × (1+RP), rounded up (debt side). */
export function accruedInterest(amount: bigint, drawnRateRay: bigint, riskPremiumBps: bigint, seconds: bigint): bigint {
  const SECONDS_PER_YEAR = 365n * 24n * 3600n;
  return ceilDiv(amount * drawnRateRay * (BPS + riskPremiumBps) * seconds, RAY * BPS * SECONDS_PER_YEAR);
}

export function wadToNumber(x: bigint, digits = 4): number | null {
  if (x === MAX_UINT256) return null;
  const s = 10n ** BigInt(digits);
  return Number((x * s) / WAD) / Number(s);
}
