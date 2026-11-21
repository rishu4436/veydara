import { getAddress, parseAbi, type PublicClient } from "viem";
import { formatUnitsSafe, type Provenance } from "@veydara/domain";
import { AAVE_V4_BASE_FEEDS } from "./aave-v4-base";

const AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);

export interface OracleReading {
  symbol: string;
  feed: string;
  description: string;
  answer: string; // decimal string
  rawAnswer: string;
  decimals: number;
  roundId: string;
  updatedAt: string; // ISO
  ageSeconds: number;
  provenance: Provenance;
}

/**
 * Read the protocol-authoritative price feed configured for the Aave V4 MAG7
 * spoke. This is the oracle Aave risk decisions use — distinct from CMC market
 * prices. Age is reported raw; whether it is "expected" depends on the feed's
 * 24/5 schedule (see RWA Risk Clock).
 */
export async function readAaveFeed(client: PublicClient, symbol: string): Promise<OracleReading> {
  const cfg = AAVE_V4_BASE_FEEDS[symbol];
  if (!cfg) throw new Error(`No Aave V4 Base feed configured for ${symbol}`);
  const address = getAddress(cfg.feed);
  const blockNumber = await client.getBlockNumber();
  const [round, decimals, description] = await Promise.all([
    client.readContract({ address, abi: AGGREGATOR_ABI, functionName: "latestRoundData", blockNumber }),
    client.readContract({ address, abi: AGGREGATOR_ABI, functionName: "decimals", blockNumber }),
    client.readContract({ address, abi: AGGREGATOR_ABI, functionName: "description", blockNumber }),
  ]);
  const [roundId, answer, , updatedAt] = round;
  const now = Math.floor(Date.now() / 1000);
  const fetchedAt = new Date().toISOString();
  return {
    symbol,
    feed: address,
    description,
    rawAnswer: answer.toString(),
    answer: answer < 0n ? "-" + formatUnitsSafe(-answer, decimals) : formatUnitsSafe(answer, decimals),
    decimals,
    roundId: roundId.toString(),
    updatedAt: new Date(Number(updatedAt) * 1000).toISOString(),
    ageSeconds: now - Number(updatedAt),
    provenance: {
      source: "chainlink-feed",
      endpointOrContract: address,
      chainId: 8453,
      observedAt: new Date(Number(updatedAt) * 1000).toISOString(),
      fetchedAt,
      blockNumber: blockNumber.toString(),
      currency: "USD",
      freshness: "live",
      coverage: "complete",
      isSimulated: false,
    },
  };
}
