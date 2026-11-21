/** Stage 2 — fresh state: one block-pinned read of the market, the account's position, balances and allowances. */
import { getAddress, type Address, type PublicClient } from "viem";
import { ERC20_ABI, readAaveV4Market, readAaveV4Position, type AaveMarket, type AaveUserPosition } from "@veydara/protocols";
import { FORK_CHAIN_ID } from "./fork";

export interface FreshState {
  blockNumber: string;
  blockTimestamp: number;
  account: Address;
  market: AaveMarket;
  position: AaveUserPosition;
  /** Wallet balance of each reserve's underlying (base units), keyed by reserveId. */
  wallet: Record<number, string>;
  /** Allowance granted to the Spoke for each reserve's underlying. */
  allowance: Record<number, string>;
  ethBalance: string;
}

export async function readFreshState(client: PublicClient, account: string): Promise<FreshState> {
  const acct = getAddress(account);
  const block = await client.getBlock();
  const raw = await readAaveV4Market(client, block.number);
  const market: AaveMarket = { ...raw, provenance: { ...raw.provenance, source: "anvil-fork", chainId: FORK_CHAIN_ID, isSimulated: true } };
  const position = await readAaveV4Position(client, acct, market);
  const reads = await client.multicall({
    allowFailure: false,
    blockNumber: block.number,
    contracts: market.reserves.flatMap((r) => [
      { address: r.underlying, abi: ERC20_ABI, functionName: "balanceOf", args: [acct] } as const,
      { address: r.underlying, abi: ERC20_ABI, functionName: "allowance", args: [acct, market.spoke] } as const,
    ]),
  });
  const wallet: Record<number, string> = {};
  const allowance: Record<number, string> = {};
  market.reserves.forEach((r, i) => {
    wallet[r.reserveId] = (reads[i * 2] as bigint).toString();
    allowance[r.reserveId] = (reads[i * 2 + 1] as bigint).toString();
  });
  const ethBalance = (await client.getBalance({ address: acct, blockNumber: block.number })).toString();
  return { blockNumber: block.number.toString(), blockTimestamp: Number(block.timestamp), account: acct, market, position, wallet, allowance, ethBalance };
}

export interface PositionSummary {
  blockNumber: string;
  healthFactorWad: string;
  reserves: { reserveId: number; symbol: string | null; supplied: string; debt: string; collateralEnabled: boolean; wallet: string; decimals: number }[];
}

export function summarise(s: FreshState): PositionSummary {
  return {
    blockNumber: s.blockNumber,
    healthFactorWad: s.position.account.healthFactorWad,
    reserves: s.market.reserves
      .map((r) => {
        const p = s.position.reserves[r.reserveId]!;
        return { reserveId: r.reserveId, symbol: r.symbol, supplied: p.supplied, debt: p.debt, collateralEnabled: p.collateralEnabled, wallet: s.wallet[r.reserveId] ?? "0", decimals: r.decimals };
      })
      .filter((x) => x.supplied !== "0" || x.debt !== "0" || x.wallet !== "0" || x.collateralEnabled),
  };
}
