/**
 * Read-only Kamino Lend adapter using the official SDK. It loads the verified market account and its
 * reserves from Solana mainnet and reads a wallet's obligations. It never builds or sends a transaction.
 */
import { address, createSolanaRpc } from "@solana/kit";
import { DEFAULT_RECENT_SLOT_DURATION_MS, getCurrentLedgerInstant, KaminoMarket, PROGRAM_ID } from "@kamino-finance/klend-sdk";
import { classify, distanceToLiquidation, KAMINO_SOURCE, type KaminoMarketSnapshot, type KaminoPositionsSnapshot, type KaminoReserveRow } from "./types";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

async function load(rpcUrl: string | undefined, market: string) {
  if (market !== KAMINO_SOURCE.markets.xStocks.address) throw new Error("Only verified Kamino markets can be read.");
  if (PROGRAM_ID !== KAMINO_SOURCE.programId) throw new Error(`SDK program id ${PROGRAM_ID} differs from the pinned ${KAMINO_SOURCE.programId}`);
  const rpc = createSolanaRpc(rpcUrl ?? DEFAULT_RPC);
  const m = await KaminoMarket.load(rpc, address(market), DEFAULT_RECENT_SLOT_DURATION_MS);
  if (!m) throw new Error(`Kamino market ${market} not found on-chain`);
  const instant = await getCurrentLedgerInstant(rpc, "confirmed");
  return { rpc, m, instant };
}

export async function readKaminoMarket(opts: { rpcUrl?: string; market?: string } = {}): Promise<KaminoMarketSnapshot> {
  const market = opts.market ?? KAMINO_SOURCE.markets.xStocks.address;
  const { m, instant } = await load(opts.rpcUrl, market);
  const reserves: KaminoReserveRow[] = [...m.reserves.values()].map((r) => {
    const s = r.stats;
    const scale = 10 ** s.decimals;
    const supply = r.getTotalSupply().div(scale);
    const limit = s.reserveDepositLimit.div(scale);
    const borrowLimit = s.reserveBorrowLimit.div(scale);
    return {
      symbol: s.symbol,
      reserve: String(r.address),
      mint: String(r.getLiquidityMint()),
      decimals: s.decimals,
      kind: classify(s.symbol),
      status: s.status as KaminoReserveRow["status"],
      ltvPct: Math.round(s.loanToValue * 10_000) / 100,
      liquidationThresholdPct: Math.round(s.liquidationThreshold * 10_000) / 100,
      liquidationBonusPct: { min: s.minLiquidationBonus * 100, max: s.maxLiquidationBonus * 100 },
      borrowFactorPct: s.borrowFactor,
      priceUsd: r.getOracleMarketPrice().toFixed(6),
      oracleValid: r.hasValidOraclePrice(),
      supplyApy: r.totalSupplyAPY(instant),
      borrowApy: r.totalBorrowAPY(instant),
      totalSupply: supply.toFixed(6),
      depositLimit: limit.toFixed(0),
      borrowed: r.getBorrowedAmount().div(scale).toFixed(6),
      borrowLimit: borrowLimit.toFixed(0),
      utilization: r.calculateUtilizationRatio(),
      depositCapUsed: limit.isZero() ? 1 : supply.div(limit).toNumber(),
      borrowable: !borrowLimit.isZero() && s.status === "Active",
    };
  });
  reserves.sort((a, b) => (a.kind === b.kind ? a.symbol.localeCompare(b.symbol) : a.kind === "tokenized-equity" ? -1 : b.kind === "tokenized-equity" ? 1 : a.kind.localeCompare(b.kind)));
  return { protocol: "kamino-lend", chain: "solana", market, name: m.getName(), programId: PROGRAM_ID, slot: instant.slot.toString(), blockTime: Number(instant.blockTime), readAt: new Date().toISOString(), reserves, source: KAMINO_SOURCE };
}

export async function readKaminoPositions(owner: string, opts: { rpcUrl?: string; market?: string } = {}): Promise<KaminoPositionsSnapshot> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) throw new Error("owner must be a base58 Solana address");
  const market = opts.market ?? KAMINO_SOURCE.markets.xStocks.address;
  const { m, instant } = await load(opts.rpcUrl, market);
  const obs = await m.getAllUserObligations(address(owner), instant);
  const sym = (mint: string) => [...m.reserves.values()].find((r) => String(r.getLiquidityMint()) === mint);
  return {
    protocol: "kamino-lend",
    chain: "solana",
    market,
    owner,
    slot: instant.slot.toString(),
    readAt: new Date().toISOString(),
    obligations: obs.map((o) => {
      const st = o.refreshedStats;
      const ltv = o.loanToValue().toNumber();
      const liq = o.liquidationLtv().toNumber();
      const leg = (p: { mintAddress: unknown; amount: { div: (n: number) => { toFixed: (d: number) => string } }; marketValueRefreshed: { toFixed: (d: number) => string } }) => {
        const r = sym(String(p.mintAddress));
        return { symbol: r?.stats.symbol ?? String(p.mintAddress).slice(0, 6), mint: String(p.mintAddress), amount: p.amount.div(10 ** (r?.stats.decimals ?? 0)).toFixed(6), valueUsd: p.marketValueRefreshed.toFixed(2) };
      };
      return {
        obligation: String(o.obligationAddress),
        owner: String(o.state.owner),
        deposits: o.getDeposits().map(leg),
        borrows: o.getBorrows().map(leg),
        totalDepositUsd: st.userTotalDeposit.toFixed(2),
        totalBorrowUsd: st.userTotalBorrow.toFixed(2),
        netValueUsd: st.netAccountValue.toFixed(2),
        ltv,
        liquidationLtv: liq,
        distanceToLiquidationPct: (() => {
          const d = distanceToLiquidation(ltv, liq);
          return d === null ? null : Math.round(d * 10_000) / 100;
        })(),
      };
    }),
    source: KAMINO_SOURCE,
  };
}
