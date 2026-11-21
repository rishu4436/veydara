/**
 * Live, block-pinned reads of the Aave V4 Equities Hub / MAG7 Spoke on Base.
 * ABIs: ./aave-v4-abi.ts (official interfaces). Addresses: ./aave-v4-base.ts (address book).
 */
import { getAddress, type Address, type PublicClient } from "viem";
import type { Provenance } from "@veydara/domain";
import { AAVE_V4_BASE, AAVE_V4_BASE_FEEDS } from "./aave-v4-base";
import { HUB_ABI, ORACLE_ABI, SPOKE_ABI } from "./aave-v4-abi";

export interface AaveReserve {
  reserveId: number;
  symbol: string | null;
  underlying: Address;
  decimals: number;
  assetId: number;
  hub: Address;
  collateralFactorBps: number;
  maxLiquidationBonusBps: number;
  liquidationFeeBps: number;
  collateralRiskBps: number;
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
  /** Spoke-level totals (asset base units). */
  suppliedAssets: string;
  totalDebt: string;
  /** Hub caps for this spoke, whole tokens; null = uncapped (MAX_ALLOWED_SPOKE_CAP). */
  addCapTokens: string | null;
  drawCapTokens: string | null;
  spokeActive: boolean;
  spokeHalted: boolean;
  /** Hub-wide available liquidity for the asset (base units). */
  hubLiquidity: string;
  /** Hub drawn (borrow) rate, RAY per year. */
  drawnRateRay: string;
  /** Spoke oracle price (oracle decimals). */
  price: string;
}

export interface AaveMarket {
  spoke: Address;
  hub: Address;
  oracle: Address;
  oracleDecimals: number;
  blockNumber: string;
  liquidation: { targetHealthFactor: string; healthFactorForMaxBonus: string; liquidationBonusFactor: number };
  reserves: AaveReserve[];
  provenance: Provenance;
}

const symbolFor = (underlying: string) => Object.entries(AAVE_V4_BASE_FEEDS).find(([, v]) => v.asset.toLowerCase() === underlying.toLowerCase())?.[0] ?? null;

export async function readAaveV4Market(client: PublicClient, blockNumber?: bigint): Promise<AaveMarket> {
  const spoke = getAddress(AAVE_V4_BASE.mag7Spoke);
  const bn = blockNumber ?? (await client.getBlockNumber());
  const r = <T>(p: Promise<T>) => p;
  const [count, oracle, liq] = await Promise.all([
    r(client.readContract({ address: spoke, abi: SPOKE_ABI, functionName: "getReserveCount", blockNumber: bn })),
    r(client.readContract({ address: spoke, abi: SPOKE_ABI, functionName: "ORACLE", blockNumber: bn })),
    r(client.readContract({ address: spoke, abi: SPOKE_ABI, functionName: "getLiquidationConfig", blockNumber: bn })),
  ]);
  if (getAddress(oracle) !== getAddress(AAVE_V4_BASE.mag7SpokeOracle)) throw new Error(`Spoke ORACLE() ${oracle} differs from the address book; refusing to read prices.`);
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const base = await client.multicall({
    allowFailure: false,
    blockNumber: bn,
    contracts: ids.flatMap((id) => [
      { address: spoke, abi: SPOKE_ABI, functionName: "getReserve", args: [id] } as const,
      { address: spoke, abi: SPOKE_ABI, functionName: "getReserveConfig", args: [id] } as const,
      { address: spoke, abi: SPOKE_ABI, functionName: "getReserveSuppliedAssets", args: [id] } as const,
      { address: spoke, abi: SPOKE_ABI, functionName: "getReserveTotalDebt", args: [id] } as const,
      { address: oracle, abi: ORACLE_ABI, functionName: "getReservePrice", args: [id] } as const,
    ]),
  });
  const [oracleDecimals, maxCap] = await Promise.all([
    client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "decimals", blockNumber: bn }),
    client.readContract({ address: getAddress(AAVE_V4_BASE.equitiesHub), abi: HUB_ABI, functionName: "MAX_ALLOWED_SPOKE_CAP", blockNumber: bn }),
  ]);
  type Res = { underlying: Address; hub: Address; assetId: number; decimals: number; collateralRisk: number; flags: number; dynamicConfigKey: number };
  const reservesRaw = ids.map((_, i) => ({
    reserve: base[i * 5] as Res,
    cfg: base[i * 5 + 1] as { collateralRisk: number; paused: boolean; frozen: boolean; borrowable: boolean },
    supplied: base[i * 5 + 2] as bigint,
    debt: base[i * 5 + 3] as bigint,
    price: base[i * 5 + 4] as bigint,
  }));
  const second = await client.multicall({
    allowFailure: false,
    blockNumber: bn,
    contracts: reservesRaw.flatMap((x, i) => [
      { address: spoke, abi: SPOKE_ABI, functionName: "getDynamicReserveConfig", args: [BigInt(i), x.reserve.dynamicConfigKey] } as const,
      { address: x.reserve.hub, abi: HUB_ABI, functionName: "getSpoke", args: [BigInt(x.reserve.assetId), spoke] } as const,
      { address: x.reserve.hub, abi: HUB_ABI, functionName: "getAssetLiquidity", args: [BigInt(x.reserve.assetId)] } as const,
      { address: x.reserve.hub, abi: HUB_ABI, functionName: "getAssetDrawnRate", args: [BigInt(x.reserve.assetId)] } as const,
    ]),
  });
  const cap = (v: number | bigint) => (BigInt(v) === BigInt(maxCap) ? null : BigInt(v).toString());
  const reserves: AaveReserve[] = reservesRaw.map((x, i) => {
    const dyn = second[i * 4] as { collateralFactor: number; maxLiquidationBonus: number; liquidationFee: number };
    const sd = second[i * 4 + 1] as { addCap: number | bigint; drawCap: number | bigint; active: boolean; halted: boolean };
    return {
      reserveId: i,
      symbol: symbolFor(x.reserve.underlying),
      underlying: getAddress(x.reserve.underlying),
      decimals: Number(x.reserve.decimals),
      assetId: Number(x.reserve.assetId),
      hub: getAddress(x.reserve.hub),
      collateralFactorBps: Number(dyn.collateralFactor),
      maxLiquidationBonusBps: Number(dyn.maxLiquidationBonus),
      liquidationFeeBps: Number(dyn.liquidationFee),
      collateralRiskBps: Number(x.cfg.collateralRisk),
      paused: x.cfg.paused,
      frozen: x.cfg.frozen,
      borrowable: x.cfg.borrowable,
      suppliedAssets: x.supplied.toString(),
      totalDebt: x.debt.toString(),
      addCapTokens: cap(sd.addCap),
      drawCapTokens: cap(sd.drawCap),
      spokeActive: sd.active,
      spokeHalted: sd.halted,
      hubLiquidity: (second[i * 4 + 2] as bigint).toString(),
      drawnRateRay: (second[i * 4 + 3] as bigint).toString(),
      price: x.price.toString(),
    };
  });
  return {
    spoke,
    hub: getAddress(AAVE_V4_BASE.equitiesHub),
    oracle: getAddress(oracle),
    oracleDecimals: Number(oracleDecimals),
    blockNumber: bn.toString(),
    liquidation: { targetHealthFactor: liq.targetHealthFactor.toString(), healthFactorForMaxBonus: liq.healthFactorForMaxBonus.toString(), liquidationBonusFactor: Number(liq.liquidationBonusFactor) },
    reserves,
    provenance: { source: "aave-v4-spoke", endpointOrContract: spoke, chainId: 8453, blockNumber: bn.toString(), observedAt: null, fetchedAt: new Date().toISOString(), currency: "USD", freshness: "live", coverage: "complete", isSimulated: false },
  };
}

export interface AaveUserReserve {
  reserveId: number;
  symbol: string | null;
  collateralEnabled: boolean;
  borrowing: boolean;
  supplied: string;
  /** Total debt in asset units (rounded up by the Spoke). */
  debt: string;
  /** Full-precision debt: drawnShares × drawnIndex + premiumDebtRay (asset units × RAY), as used by the Spoke for health. */
  debtRay: string;
}
export interface AaveUserPosition {
  user: Address;
  blockNumber: string;
  reserves: AaveUserReserve[];
  /** Raw getUserAccountData from the Spoke (protocol-authoritative). */
  account: { riskPremiumBps: string; avgCollateralFactorWad: string; healthFactorWad: string; totalCollateralValue: string; totalDebtValueRay: string; activeCollateralCount: string; borrowCount: string };
  provenance: Provenance;
}

export async function readAaveV4Position(client: PublicClient, user: string, market: AaveMarket): Promise<AaveUserPosition> {
  const u = getAddress(user);
  const spoke = market.spoke;
  const bn = BigInt(market.blockNumber);
  const res = await client.multicall({
    allowFailure: false,
    blockNumber: bn,
    contracts: [
      ...market.reserves.flatMap((x) => [
        { address: spoke, abi: SPOKE_ABI, functionName: "getUserReserveStatus", args: [BigInt(x.reserveId), u] } as const,
        { address: spoke, abi: SPOKE_ABI, functionName: "getUserSuppliedAssets", args: [BigInt(x.reserveId), u] } as const,
        { address: spoke, abi: SPOKE_ABI, functionName: "getUserTotalDebt", args: [BigInt(x.reserveId), u] } as const,
        { address: spoke, abi: SPOKE_ABI, functionName: "getUserPosition", args: [BigInt(x.reserveId), u] } as const,
        { address: spoke, abi: SPOKE_ABI, functionName: "getUserPremiumDebtRay", args: [BigInt(x.reserveId), u] } as const,
        { address: x.hub, abi: HUB_ABI, functionName: "getAssetDrawnIndex", args: [BigInt(x.assetId)] } as const,
      ]),
      { address: spoke, abi: SPOKE_ABI, functionName: "getUserAccountData", args: [u] } as const,
    ],
  });
  const reserves = market.reserves.map((x, i) => {
    const k = i * 6;
    const [coll, borrow] = res[k] as readonly [boolean, boolean];
    const pos = res[k + 3] as { drawnShares: bigint };
    const debtRay = BigInt(pos.drawnShares) * (res[k + 5] as bigint) + (res[k + 4] as bigint);
    return { reserveId: x.reserveId, symbol: x.symbol, collateralEnabled: coll, borrowing: borrow, supplied: (res[k + 1] as bigint).toString(), debt: (res[k + 2] as bigint).toString(), debtRay: debtRay.toString() };
  });
  const a = res[res.length - 1] as { riskPremium: bigint; avgCollateralFactor: bigint; healthFactor: bigint; totalCollateralValue: bigint; totalDebtValueRay: bigint; activeCollateralCount: bigint; borrowCount: bigint };
  return {
    user: u,
    blockNumber: market.blockNumber,
    reserves,
    account: { riskPremiumBps: a.riskPremium.toString(), avgCollateralFactorWad: a.avgCollateralFactor.toString(), healthFactorWad: a.healthFactor.toString(), totalCollateralValue: a.totalCollateralValue.toString(), totalDebtValueRay: a.totalDebtValueRay.toString(), activeCollateralCount: a.activeCollateralCount.toString(), borrowCount: a.borrowCount.toString() },
    provenance: { ...market.provenance, assetId: u, fetchedAt: new Date().toISOString() },
  };
}
