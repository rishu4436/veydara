/**
 * Aave V4 on Base — addresses pinned to the official Aave address book
 * (bgd-labs/aave-address-book, src/AaveV4Base.sol @ 967c772c, committed
 * 2026-11-10T15:37:00Z, retrieved 2026-11-21). Never guess addresses.
 * Hub bytecode presence and token symbols were cross-checked via Base RPC.
 */
export const AAVE_V4_BASE_SOURCE = {
  repo: "https://github.com/bgd-labs/aave-address-book",
  file: "https://github.com/bgd-labs/aave-address-book/blob/967c772c19c63c8728c2a3bcf34f6bd5b0ff9abe/src/AaveV4Base.sol",
  commit: "967c772c19c63c8728c2a3bcf34f6bd5b0ff9abe",
  committedAt: "2026-11-10T15:37:00Z",
  retrievedAt: "2026-11-21",
} as const;

export const AAVE_V4_BASE = {
  chainId: 8453,
  equitiesHub: "0xa4d5947Eb727A052bae69C593FfC84247EC9864E",
  mag7Spoke: "0x17905Db0e4A3514467539956c084180616AE7B8D",
  mag7SpokeOracle: "0xaBaf048fD7675Ea34a84332371ffd5D55E322A47",
  treasurySpoke: "0x5F8d0102F5B51Fae6DE9d2F2561bda63Fb5Db674",
  equitiesUsdcTokenizationSpoke: "0x7081CE7EB1282c53CF38EA9B622f6269cb8FeFDc",
  irStrategy: "0x3b0c5FbEff9d32fB6bB706bACc988c88b1871770",
  positionManagers: {
    giver: "0x9E81c2fDE4E34CAB3AB1667ca3c932dBAED95F08",
    taker: "0x8481204E528735aF2F3391AD98f36E757A56D695",
    config: "0xe90F830bEe4b190B4910e146908437075b0BDaaF",
    nativeTokenGateway: "0xdFC11f7037Ba11D9cC29A822844f5dC19C42B70d",
    signatureGateway: "0x5d488d3EAAa86DDb6D4f834FC34938054eC505A7",
  },
} as const;

/** MAG7 Spoke price feeds per listed asset (AaveV4BaseSpokePriceFeeds). */
export const AAVE_V4_BASE_FEEDS: Record<string, { asset: string; feed: string }> = {
  AAPLc: { asset: "0xb200000000000000000000C2e324d24d7eEcd1fb", feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988" },
  AMZNc: { asset: "0xb200000000000000000000d9192b6B456483C2E8", feed: "0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295" },
  GOOGLc: { asset: "0xb2000000000000000000002D0BA3164cc74f58B7", feed: "0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2" },
  METAc: { asset: "0xb2000000000000000000008bC8786B856E61707C", feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D" },
  MSFTc: { asset: "0xB200000000000000000000Ab99cFa739E253872B", feed: "0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c" },
  NVDAc: { asset: "0xb20000000000000000000078ee7ce2fE4908108C", feed: "0x04689a41629776563E6822F76f2e57D148d28513" },
  TSLAc: { asset: "0xb2000000000000000000001e800a7f5189430cD0", feed: "0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4" },
  SPCXc: { asset: "0xb2000000000000000000007b9fcbd005511aCBd5", feed: "0x6A634B235903C4ad6376892180d6fF8612e3Fa68" },
  USDC: { asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", feed: "0xC7d0f8dCC1F860ca752054c59Ea82Ba2A5AaB50c" },
};

/**
 * "Listed in the address book" ≠ "you can borrow against it". Listing only
 * proves a reserve and feed exist; caps, LTV, pause state and user
 * eligibility must be read on-chain (Phase 3) before any borrow is shown.
 */
export function aaveListingFor(symbolOrAddress: string): { symbol: string; asset: string; feed: string } | null {
  const s = symbolOrAddress.toLowerCase();
  for (const [symbol, v] of Object.entries(AAVE_V4_BASE_FEEDS)) {
    if (symbol.toLowerCase() === s || v.asset.toLowerCase() === s) return { symbol, ...v };
  }
  return null;
}
