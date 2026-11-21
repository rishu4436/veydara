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
| CMC AI endpoints Enterprise-only (Phase 1) | prompt | Feature-gated off; not called |

## 4. Market calendar

NYSE 2026 holidays and early closes encoded in `packages/domain/src/market-session.ts` follow https://www.nyse.com/markets/hours-calendars — **re-verify against the page before relying on it** (recorded from the published calendar, not machine-fetched in this run).

## 5. Not claimed

- No transaction has been sent, simulated on a fork, or signed by VEYDARA.
- No borrow availability, rate, cap, or LTV is shown anywhere.
- No performance, PnL or TVL figure is computed.
