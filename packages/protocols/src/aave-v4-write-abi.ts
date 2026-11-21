/**
 * Aave V4 Spoke user-action ABI + custom errors — transcribed verbatim from the
 * official interfaces in https://github.com/aave/aave-v4 @ 4885a7ad44391eb6635954ea3b353fa7f12222f5:
 *   src/spoke/interfaces/ISpoke.sol (supply / withdraw / borrow / repay / setUsingAsCollateral,
 *   setUserPositionManager, isPositionManager, errors), src/hub/interfaces/IHub.sol (errors),
 *   src/dependencies/openzeppelin/SafeERC20.sol (errors).
 * Execution against these is FORK-ONLY in VEYDARA (see packages/execution). Nothing
 * in this repo signs or broadcasts to Base mainnet.
 */
import { parseAbi } from "viem";

export const SPOKE_WRITE_ABI = parseAbi([
  "function supply(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function withdraw(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function borrow(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function repay(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function setUsingAsCollateral(uint256 reserveId, bool usingAsCollateral, address onBehalfOf)",
  "function setUserPositionManager(address positionManager, bool approve)",
  "function isPositionManager(address user, address positionManager) view returns (bool)",
  "function isPositionManagerActive(address positionManager) view returns (bool)",
]);

export const SPOKE_ERRORS_ABI = parseAbi([
  "error AssetNotListed()",
  "error ReserveExists()",
  "error InvalidAssetId()",
  "error InvalidAssetDecimals()",
  "error ReserveNotListed()",
  "error ReserveNotBorrowable()",
  "error ReservePaused()",
  "error ReserveFrozen()",
  "error HealthFactorBelowThreshold()",
  "error ReserveNotEnabledAsCollateral()",
  "error ReserveNotSupplied()",
  "error ReserveNotBorrowed()",
  "error Unauthorized()",
  "error DynamicConfigKeyUninitialized()",
  "error InvalidAddress()",
  "error MustNotLeaveDust()",
  "error MaximumUserReservesExceeded()",
  "error SelfLiquidation()",
]);

export const HUB_ERRORS_ABI = parseAbi([
  "error AddCapExceeded(uint256 addCap)",
  "error InsufficientLiquidity(uint256 liquidity)",
  "error InsufficientTransferred(uint256 liquidityNeeded)",
  "error DrawCapExceeded(uint256 drawCap)",
  "error SurplusDrawnRestored(uint256 maxAllowedRestore)",
  "error SurplusPremiumRayRestored(uint256 maxAllowedRestoreRay)",
  "error SpokeNotActive()",
  "error SpokeHalted()",
  "error SpokeNotListed()",
  "error InvalidAmount()",
  "error InvalidShares()",
]);

export const SAFE_ERC20_ERRORS_ABI = parseAbi(["error SafeERC20FailedOperation(address token)"]);

/** Minimal ERC-20 surface used by B20 Asset tokens and USDC. */
export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

export const ALL_ERRORS_ABI = [...SPOKE_ERRORS_ABI, ...HUB_ERRORS_ABI, ...SAFE_ERC20_ERRORS_ABI] as const;
