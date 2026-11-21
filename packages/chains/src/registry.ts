/**
 * Verified token registry. Every entry is pinned to an official source and was
 * cross-checked on-chain (symbol()/name()/decimals()) on 2026-11-21 — see
 * docs/SOURCES-AND-CLAIMS.md and `pnpm verify:registry`.
 * Tokens NOT in this registry are never treated as verified, whatever their ticker says.
 */
import type { TokenRepresentation } from "@veydara/domain";

const AAVE_BOOK = "https://github.com/bgd-labs/aave-address-book/blob/967c772c19c63c8728c2a3bcf34f6bd5b0ff9abe/src/AaveV4Base.sol";
const RETRIEVED = "2026-11-21";

function coinbaseEquity(symbol: string, address: string, company: string, ticker: string, cmcId?: number): TokenRepresentation {
  return {
    chain: "base",
    address: address.toLowerCase(),
    symbol,
    name: company,
    decimals: 8,
    assetClass: "tokenized-equity",
    issuer: "Coinbase",
    underlying: { symbol: ticker, name: company, kind: "stock" },
    cmcId,
    sources: [
      { label: "Aave address book — AaveV4BaseAssets (official Aave governance-maintained registry)", url: AAVE_BOOK, retrievedAt: RETRIEVED },
      { label: "On-chain symbol()/name()/decimals() via Base RPC", url: `https://basescan.org/token/${address}`, retrievedAt: RETRIEVED },
      ...(cmcId ? [{ label: `CoinMarketCap exact-contract listing #${cmcId} (fixtures/chain/registry-verification.json)`, url: `https://coinmarketcap.com/currencies/id/${cmcId}`, retrievedAt: RETRIEVED }] : []),
    ],
  };
}

export const BASE_NATIVE: TokenRepresentation = {
  chain: "base",
  address: "native",
  symbol: "ETH",
  name: "Ether (Base native gas token)",
  decimals: 18,
  assetClass: "native",
  underlying: { symbol: "ETH", name: "Ether", kind: "crypto" },
  cmcId: 1027,
  sources: [{ label: "Base docs — ETH is the native gas token", url: "https://docs.base.org/base-chain/network-information/network-fees", retrievedAt: RETRIEVED }],
};

export const BASE_TOKENS: TokenRepresentation[] = [
  {
    chain: "base",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    name: "USD Coin (native, Circle)",
    decimals: 6,
    assetClass: "stablecoin",
    issuer: "Circle",
    underlying: { symbol: "USD", name: "US Dollar", kind: "fiat" },
    cmcId: 3408,
    sources: [
      { label: "Circle — USDC contract addresses", url: "https://developers.circle.com/stablecoins/usdc-contract-addresses", retrievedAt: RETRIEVED },
      { label: "Aave address book — AaveV4BaseAssets.USDC_UNDERLYING", url: AAVE_BOOK, retrievedAt: RETRIEVED },
    ],
  },
  {
    chain: "base",
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ether (OP Stack predeploy)",
    decimals: 18,
    assetClass: "wrapped-crypto",
    underlying: { symbol: "ETH", name: "Ether", kind: "crypto" },
    cmcId: 2396,
    sources: [{ label: "Base docs — contract addresses (L2 predeploys)", url: "https://docs.base.org/base-chain/network-information/base-contracts", retrievedAt: RETRIEVED }],
  },
  coinbaseEquity("AAPLc", "0xb200000000000000000000C2e324d24d7eEcd1fb", "Apple Inc.", "AAPL", 42427),
  coinbaseEquity("AMZNc", "0xb200000000000000000000d9192b6B456483C2E8", "Amazon.com Inc.", "AMZN", 42425),
  coinbaseEquity("GOOGLc", "0xb2000000000000000000002D0BA3164cc74f58B7", "Alphabet Inc.", "GOOGL", 42421),
  coinbaseEquity("METAc", "0xb2000000000000000000008bC8786B856E61707C", "Meta Platforms Inc.", "META", 42440),
  coinbaseEquity("MSFTc", "0xB200000000000000000000Ab99cFa739E253872B", "Microsoft Corporation", "MSFT", 42494),
  coinbaseEquity("NVDAc", "0xb20000000000000000000078ee7ce2fE4908108C", "NVIDIA Corporation", "NVDA", 42461),
  coinbaseEquity("TSLAc", "0xb2000000000000000000001e800a7f5189430cD0", "Tesla Inc.", "TSLA", 42490),
  coinbaseEquity("SPCXc", "0xb2000000000000000000007b9fcbd005511aCBd5", "Space Exploration Technologies Corp.", "SPCX", 42487),
];

export const SOLANA_NATIVE: TokenRepresentation = {
  chain: "solana",
  address: "native",
  symbol: "SOL",
  name: "Solana (native)",
  decimals: 9,
  assetClass: "native",
  underlying: { symbol: "SOL", name: "Solana", kind: "crypto" },
  cmcId: 5426,
  sources: [{ label: "Solana docs", url: "https://solana.com/docs/core/tokens", retrievedAt: RETRIEVED }],
};

export const SOLANA_TOKENS: TokenRepresentation[] = [
  {
    chain: "solana",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin (Circle)",
    decimals: 6,
    assetClass: "stablecoin",
    issuer: "Circle",
    underlying: { symbol: "USD", name: "US Dollar", kind: "fiat" },
    cmcId: 3408,
    sources: [{ label: "Circle — USDC contract addresses", url: "https://developers.circle.com/stablecoins/usdc-contract-addresses", retrievedAt: RETRIEVED }],
  },
  {
    chain: "solana",
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    assetClass: "stablecoin",
    issuer: "Tether",
    underlying: { symbol: "USD", name: "US Dollar", kind: "fiat" },
    cmcId: 825,
    sources: [{ label: "Tether — supported protocols", url: "https://tether.to/en/supported-protocols/", retrievedAt: RETRIEVED }],
  },
];

export const ALL_VERIFIED: TokenRepresentation[] = [BASE_NATIVE, ...BASE_TOKENS, SOLANA_NATIVE, ...SOLANA_TOKENS];

export function findVerified(chain: "base" | "solana", address: string): TokenRepresentation | undefined {
  const a = chain === "solana" ? address : address.toLowerCase();
  return ALL_VERIFIED.find((t) => t.chain === chain && t.address === a);
}
