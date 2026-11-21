/**
 * Aave V4 view ABIs — transcribed verbatim (view subset) from the official
 * interfaces in https://github.com/aave/aave-v4 @ 4885a7ad44391eb6635954ea3b353fa7f12222f5
 * (committed 2026-11-13T21:32:47-08:00, retrieved 2026-11-21):
 *   src/spoke/interfaces/ISpoke.sol, src/hub/interfaces/IHub.sol, src/hub/interfaces/IHubBase.sol,
 *   src/spoke/interfaces/IAaveOracle.sol.
 * Every function here was executed via eth_call against the address-book
 * deployments on Base (see fixtures/chain/aave-v4-abi-verification.json); a
 * selector that reverts or decodes incorrectly is removed, never guessed.
 * `ReserveFlags` is a Solidity user-defined value type over uint8.
 */
import { parseAbi } from "viem";

export const AAVE_V4_SOURCE = {
  repo: "https://github.com/aave/aave-v4",
  commit: "4885a7ad44391eb6635954ea3b353fa7f12222f5",
  committedAt: "2026-11-14T05:32:47Z",
  files: ["src/spoke/interfaces/ISpoke.sol", "src/hub/interfaces/IHub.sol", "src/hub/interfaces/IHubBase.sol", "src/spoke/interfaces/IAaveOracle.sol", "src/spoke/interfaces/IPriceOracle.sol"],
  retrievedAt: "2026-11-21",
} as const;

export const SPOKE_ABI = parseAbi([
  "struct Reserve { address underlying; address hub; uint16 assetId; uint8 decimals; uint24 collateralRisk; uint8 flags; uint32 dynamicConfigKey; }",
  "struct ReserveConfig { uint24 collateralRisk; bool paused; bool frozen; bool borrowable; bool receiveSharesEnabled; }",
  "struct DynamicReserveConfig { uint16 collateralFactor; uint32 maxLiquidationBonus; uint16 liquidationFee; }",
  "struct LiquidationConfig { uint128 targetHealthFactor; uint64 healthFactorForMaxBonus; uint16 liquidationBonusFactor; }",
  "struct UserAccountData { uint256 riskPremium; uint256 avgCollateralFactor; uint256 healthFactor; uint256 totalCollateralValue; uint256 totalDebtValueRay; uint256 activeCollateralCount; uint256 borrowCount; }",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 reserveId) view returns (Reserve)",
  "function getReserveConfig(uint256 reserveId) view returns (ReserveConfig)",
  "function getDynamicReserveConfig(uint256 reserveId, uint32 dynamicConfigKey) view returns (DynamicReserveConfig)",
  "function getLiquidationConfig() view returns (LiquidationConfig)",
  "function getReserveSuppliedAssets(uint256 reserveId) view returns (uint256)",
  "function getReserveTotalDebt(uint256 reserveId) view returns (uint256)",
  "function getUserReserveStatus(uint256 reserveId, address user) view returns (bool, bool)",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 reserveId, address user) view returns (uint256)",
  "function getUserAccountData(address user) view returns (UserAccountData)",
  "struct UserPosition { uint120 drawnShares; uint120 premiumShares; int200 premiumOffsetRay; uint120 suppliedShares; uint32 dynamicConfigKey; }",
  "function getUserPosition(uint256 reserveId, address user) view returns (UserPosition)",
  "function getUserPremiumDebtRay(uint256 reserveId, address user) view returns (uint256)",
  "function ORACLE() view returns (address)",
]);

export const HUB_ABI = parseAbi([
  "struct SpokeData { uint120 drawnShares; uint120 premiumShares; int200 premiumOffsetRay; uint120 addedShares; uint40 addCap; uint40 drawCap; uint24 riskPremiumThreshold; bool active; bool halted; uint200 deficitRay; }",
  "function getAssetCount() view returns (uint256)",
  "function getAssetUnderlyingAndDecimals(uint256 assetId) view returns (address, uint8)",
  "function getAssetLiquidity(uint256 assetId) view returns (uint256)",
  "function getAddedAssets(uint256 assetId) view returns (uint256)",
  "function getAssetTotalOwed(uint256 assetId) view returns (uint256)",
  "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
  "function getAssetDrawnIndex(uint256 assetId) view returns (uint256)",
  "function getSpoke(uint256 assetId, address spoke) view returns (SpokeData)",
  "function MAX_ALLOWED_SPOKE_CAP() view returns (uint40)",
]);

export const ORACLE_ABI = parseAbi([
  "function getReservePrice(uint256 reserveId) view returns (uint256)",
  "function getReserveSource(uint256 reserveId) view returns (address)",
  "function decimals() view returns (uint8)",
  "function spoke() view returns (address)",
]);
