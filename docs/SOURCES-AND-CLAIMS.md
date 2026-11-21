# Sources and claims

Every external fact VEYDARA relies on, where it came from, when it was checked, and its status.
"Verified" means checked against an official/primary source **and** (where possible) on-chain.
All dates are 2026-11-21 unless stated. Times are UTC.

## 1. Aave V4 on Base (Equities Hub)

| Claim | Value | Source | Status |
|---|---|---|---|
| Aave V4 Equities Hub (Base) | `0xa4d5947Eb727A052bae69C593FfC84247EC9864E` | [bgd-labs/aave-address-book `src/AaveV4Base.sol` @ 967c772c](https://github.com/bgd-labs/aave-address-book/blob/967c772c19c63c8728c2a3bcf34f6bd5b0ff9abe/src/AaveV4Base.sol) (commit 2026-11-10T15:37:00Z) | Verified: address book + `eth_getCode` returns bytecode (proxy) |
| MAG7 Spoke | `0x17905Db0e4A3514467539956c084180616AE7B8D` | same file, `AaveV4BaseSpokes.MAG7_SPOKE` | From address book |
| MAG7 Spoke oracle | `0xaBaf048fD7675Ea34a84332371ffd5D55E322A47` | same file | From address book |
| Equities USDC tokenization spoke | `0x7081CE7EB1282c53CF38EA9B622f6269cb8FeFDc` | same file | From address book |
| Position managers (giver/taker/config/native gateway/signature gateway) | see `packages/protocols/src/aave-v4-base.ts` | same file | From address book |
| Base Hub assets | AAPLc, AMZNc, GOOGLc, METAc, MSFTc, NVDAc, TSLAc, SPCXc (8 dp) + USDC (6 dp) | same file, `AaveV4BaseAssets` | Verified on-chain (symbol/decimals) |
| NVDAc price feed for MAG7 spoke | `0x04689a41629776563E6822F76f2e57D148d28513`, `description()` = "Coinbase NVDA", 8 decimals | same file + live `latestRoundData()` | Verified live |
| Other MAG7 feeds | see `AAVE_V4_BASE_FEEDS` | same file | From address book |

**Not yet verified (blocks borrowing UI):** reserve caps, LTV / liquidation thresholds, pause/freeze state, interest-rate curve parameters, user eligibility rules, and the pinned V4 Spoke/Hub ABI. Third-party mirrors (docs.eco.com, pegproof.com, enviodev) were seen during research but are **not** used as sources.

## 2. Coinbase tokenized equities on Base

| Token | Contract | On-chain symbol / name | CMC exact-contract id |
|---|---|---|---|
| AAPLc | `0xb200000000000000000000C2e324d24d7eEcd1fb` | AAPLc / Apple Inc. | 42427 |
| AMZNc | `0xb200000000000000000000d9192b6B456483C2E8` | AMZNc / Amazon.com Inc. | 42425 |
| GOOGLc | `0xb2000000000000000000002D0BA3164cc74f58B7` | GOOGLc / Alphabet Inc. | 42421 |
| METAc | `0xb2000000000000000000008bC8786B856E61707C` | METAc / Meta Platforms Inc. | 42440 |
| MSFTc | `0xB200000000000000000000Ab99cFa739E253872B` | MSFTc / Microsoft Corporation | 42494 |
| NVDAc | `0xb20000000000000000000078ee7ce2fE4908108C` | NVDAc / NVIDIA Corporation | 42461 |
| TSLAc | `0xb2000000000000000000001e800a7f5189430cD0` | TSLAc / Tesla Inc. | 42490 |
| SPCXc | `0xb2000000000000000000007b9fcbd005511aCBd5` | SPCXc / Space Exploration Technologies Corp. | 42487 |

Evidence: `fixtures/chain/registry-verification.json` (produced by `pnpm verify:registry`: on-chain reads at a pinned Base block + CMC keyless `/v2/cryptocurrency/info?address=` exact-contract match on platform "Base").
Issuer attribution "Coinbase": CMC listing names ("… Tokenized Stock (Coinbase)") and the Aave feed description ("Coinbase NVDA"). **Issuer legal documents (rights, token-to-share ratio, redemption, transfer restrictions, eligibility) have not been ingested; the UI shows these as "Unknown — not verified from issuer documents".** Coinbase's own official token-list page was not located during this run — open item.

Other Base tokens: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Circle docs + Aave book, CMC 3408), WETH predeploy `0x4200000000000000000000000000000000000006` (Base docs, CMC 2396). Solana: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (Circle), USDT `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` (Tether).

NVDAX (xStocks / Backed) and NVDAon (Ondo) appear in the CMC RWA docs example as separate issuer tokens. Their contracts are **not** in the registry and they are never treated as NVDAc or as Aave-eligible.

## 3. CoinMarketCap API

| Claim | Source | Status |
|---|---|---|
| Hackathon rules, dates (18 Nov – 9 Dec 2026 23:59 UTC), judging weights, submission requirements | https://coinmarketcap.com/api/resources/api-hackathon-2026-11/ | Read 2026-11-21 |
| RWA endpoints (8), parameters, plan availability, credit rules | https://coinmarketcap.com/api/documentation/pro-api-reference/real-world-assets/ | Read 2026-11-21; schemas in `packages/cmc/src/schemas.ts` |
| `/v5/real-world-assets/map` costs 0 credits | RWA reference | Documented |
| `/v5/real-world-assets/quotes/historical`: 1 credit / 100 points; Startup hourly 1 month, daily from 2020 | RWA reference | Documented; **doc example payload shows the Issuers List response** (reported as feedback) |
| `/v5/real-world-assets/market-pairs/list` Growth+ | prompt + RWA reference | Not called |
| `/v5/cryptocurrency/ohlcv/historical` compact 10-value rows, Startup intraday 1 month | https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency | Documented; schema + fixture |
| Keyless public API (`/public-api` prefix) for v3 quotes, v2 info, v1 map, DEX token/pools etc. | https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api | **Verified live** (fixtures `*.live.json`) |
| Keyless rate limit error `1022` "You've reached the limit for anonymous access" | live response | Verified live (`fixtures/cmc/error-keyless-limit.live.json`) |
| Missing-key error `1002` "API key missing." on key-only endpoints | live response | Verified live (`fixtures/cmc/error-key-missing.live.json`) |
| `/v2/cryptocurrency/info?address=` returns HTTP 400 "Invalid value for 'slug': 'null'" for a **lowercase** EVM address and works with the checksummed form | live observation | Verified live; gateway sends checksummed addresses |
| CMC AI family is `/v5/cmc-ai/coins/map`, `/v5/cmc-ai/latest`, `/v5/cmc-ai/coins/latest` (changelog v3.0.6, 2026-09-09); reference page lists Basic+, blog says Enterprise first then a separate AI credit allowance | https://coinmarketcap.com/api/documentation/pro-api-reference/cmc-ai | Probed 2026-11-21 → 402 with the project key (below) |
| `/v1/k-line/candles` (DEX OHLCV by token or pool address) is keyless; docs: rows `[o,h,l,c,volume,timestamp(seconds),traders]` | keyless reference + `openapi-keyless.json` | **Verified live** 2026-11-21: timestamp is in **milliseconds** and numbers can exceed float precision (handled in `fromCmcKlineRows`; reported as feedback). 200 candles → `credit_count` 2 |

### 3a. Project CMC key — access probe (2026-11-21, `scripts/probe-cmc-plan.mjs`, `fixtures/cmc/plan-probe.live.json`)

The key itself is never stored. `/v1/key/info` → HTTP 200: monthly credit limit **450,000**, **600 req/min**, 0 credits used, resets 2026-12-01T00:00Z (05:30 IST); `status.notice`: *"Warning, your API Key subscription has expired and will be disabled shortly. Please make a payment during this grace period…"*. The plan name is not returned by the endpoint.

| Endpoint | HTTP | CMC code | Result |
|---|---|---|---|
| `/v5/real-world-assets/map`, `/info`, `/quotes/latest`, `/quotes/historical`, `/issuers/list`, `/market-pairs/list` | 402 | 1004 | "Your API Key's subscription plan has expired." |
| `/v5/cryptocurrency/ohlcv/historical` (daily and hourly) | 402 | 1004 | same |
| `/v3/cryptocurrency/quotes/latest`, `/v1/dex/token` | 402 | 1004 | same (keyed); both work keyless |
| `/v5/cmc-ai/coins/map`, `/v5/cmc-ai/latest` | 402 | 1004 | same |

Credits consumed by the probe: **0** (all 402s report `credit_count` 0). Consequence: the gateway treats 402/1004 as `CMC_PLAN_EXPIRED`, suspends pro mode for 15 minutes at a time, retries keyless-capable endpoints through `/public-api`, and reports key-only features as Unavailable with this exact reason.

## 3b. Aave V4 ABIs and on-chain verification

| Claim | Source | Status |
|---|---|---|
| Spoke/Hub/Oracle view ABIs (`getReserve`, `getReserveConfig`, `getDynamicReserveConfig`, `getLiquidationConfig`, `getUserAccountData`, `getUserPosition`, `getUserPremiumDebtRay`, `getSpoke`, `getAssetLiquidity`, `getAssetDrawnRate`, `getAssetDrawnIndex`, `getReservePrice`, …) | https://github.com/aave/aave-v4 @ `4885a7ad44391eb6635954ea3b353fa7f12222f5` (2026-11-13T21:32:47-08:00), `src/spoke/interfaces/ISpoke.sol`, `src/hub/interfaces/IHub.sol`, `IHubBase.sol`, `src/spoke/interfaces/IPriceOracle.sol` | Transcribed to `packages/protocols/src/aave-v4-abi.ts`; every function executed via `eth_call` on Base against the address-book deployments and decoded consistently (2026-11-21) |
| Spoke `ORACLE()` equals the address-book `mag7SpokeOracle`; oracle `spoke()` equals the MAG7 spoke; oracle decimals 8 | live reads | Verified; reads refuse to proceed on mismatch |
| Health factor formula: Σ(CF_bps × value) × 1e14 × RAY ÷ Σ debtRay·price·10^(18−dec), floor; value = amount × price × 10^(18−dec) | `src/spoke/Spoke.sol::_processUserAccountData`, `libraries/SpokeUtils.sol::toValue` | Implemented in `aave-v4-math.ts`; **exactly equal** (WAD) to `getUserAccountData.healthFactor` for 5 live borrowers (`fixtures/chain/aave-v4-positions.live.json`, test `aave-math.test.ts`) |
| Liquidation bonus interpolation, `HEALTH_FACTOR_LIQUIDATION_THRESHOLD` = 1e18 | `src/spoke/libraries/LiquidationLogic.sol` | Implemented + hand-computed tests |
| Simple (linear) interest on drawn rate; premium = drawn × risk premium | `libraries/math/MathUtils.sol::calculateLinearInterest`, `Spoke._processUserAccountData` | Used for APR and accrual estimates |
| Live MAG7 spoke parameters (block 60302763): CF AAPLc 78%, AMZNc 73%, GOOGLc 76%, METAc 65%, MSFTc 79%, NVDAc 70%, TSLAc 65%, SPCXc 55% (collateral risk 10%); max liquidation bonus 5.5% (SPCXc 6.5%); equities not borrowable; USDC borrowable, draw cap 21,000,000, drawn rate ≈3.74%; target HF 1.24 | `fixtures/chain/aave-v4-market.live.json` | Live read; values change — the app always reads fresh |

## 3c. Aave V4 write ABIs, fork execution and B20 tokens

| Claim | Source | Status |
|---|---|---|
| Spoke user actions `supply/withdraw/borrow/repay(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256,uint256)`, `setUsingAsCollateral(uint256,bool,address)`, `setUserPositionManager(address,bool)`, `isPositionManager`, and the Spoke/Hub/SafeERC20 custom errors | aave/aave-v4 @ `4885a7ad`, `src/spoke/interfaces/ISpoke.sol`, `src/hub/interfaces/IHub.sol`, `src/dependencies/openzeppelin/SafeERC20.sol` | Transcribed to `packages/protocols/src/aave-v4-write-abi.ts`; every action executed successfully on a local anvil fork of Base against the address-book Spoke (`fixtures/fork/*.fork.json`) |
| The Spoke pulls the underlying from the caller into the Hub (`safeTransferFrom(msg.sender, hub, amount)`), so the approval spender is the Spoke | `src/spoke/Spoke.sol::supply/repay` | Exact-amount approvals to the Spoke succeeded on the fork |
| Coinbase tokenized equities are Base **B20** Asset tokens (node-native precompiles; 1-byte `0xef` code stub at `0xb2…` addresses) | https://docs.base.org/specifications/b20/ (IB20Factory reference); verified `eth_getCode` = `0xef` for NVDAc | anvil 1.10 executes B20 transfers/approvals on a Base fork (fork receipts) |
| Fork evidence (2026-11-21, Base block 60315121, anvil chain 31337): supply+collateral+borrow (4 tx), partial repay (2 tx), withdraw (1 tx), all status 1 and reconciled (VEYDARA HF = Spoke HF); a policy-blocked borrow (not signed); a revert drill (status 0, decoded `HealthFactorBelowThreshold()`) | `fixtures/fork/` | **FORK ONLY** — these hashes do not exist on Base mainnet |

## 4. Market calendar

NYSE 2026 holidays and early closes encoded in `packages/domain/src/market-session.ts` follow https://www.nyse.com/markets/hours-calendars — **re-verify against the page before relying on it** (recorded from the published calendar, not machine-fetched in this run).

## 5. Not claimed

- No transaction has been signed for, or sent to, Base mainnet. Fork transactions (chain 31337) are labelled FORK everywhere and were signed only with anvil-generated test keys.
- Borrow parameters shown are read live from the Spoke/Hub; VEYDARA does not claim the user is eligible to use the Equities Hub.
- No performance, PnL or TVL figure is computed.
