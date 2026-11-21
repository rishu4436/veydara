# Financial models

## Units
- Token amounts: `bigint` base units end-to-end (`packages/domain/src/units.ts`). `parseUnitsSafe` rejects excess precision; `formatUnitsSafe` truncates toward zero.
- Valuation: `mulAmountByPrice(amount, decimals, priceDecimalString, outDecimals=6)` → floor-rounded micro-USD (safe side for collateral).
- API prices (JS numbers) are converted to plain decimal strings (`normalizeDecimal`) before bigint math.
- Indicators use float64 — analytics only, never token amounts or collateral bounds.

## Indicators (`packages/quant/src/indicators.ts`)
| Indicator | Definition | Lookback |
|---|---|---|
| SMA(n) | arithmetic mean of last n closes | n |
| EMA(n) | seeded with SMA(n); k = 2/(n+1) | n |
| RSI(14) | Wilder smoothing of average gain/loss | 15 closes |
| MACD(12,26,9) | EMA12−EMA26; signal = EMA9 of MACD; histogram = MACD−signal | 34 |
| ATR(14) | Wilder smoothing of true range, seeded with simple mean | 14 |
| Volatility(20) | sample stdev of log returns (not annualized) | 21 |
| Classic pivots | P=(H+L+C)/3, R1=2P−L, S1=2P−H, R2=P+(H−L), S2=P−(H−L) | prior period |
| Fibonacci | swingHigh − (swingHigh−swingLow)·r, r∈{0,.236,.382,.5,.618,.786,1} | swing |

Incomplete candles (`closed=false`) are dropped before any indicator runs (no look-ahead). RSI verified against an independent Python implementation; the published StockCharts example differs by <0.1 because it rounds intermediate averages.

## Support / resistance zones (`levels.ts`)
Fractal pivots (±3 candles) → sort by price → cluster within 2×tolerance, tolerance = max(0.5×ATR14, 0.2% of last close) → zone band = cluster range ± tolerance/2; quality from touches + recency; zones need ≥2 touches unless recent; invalidation = close beyond the band. Returns `insufficient-data` for <40 candles, >20% large gaps, or zero ATR.

## Market session (`market-session.ts`)
NYSE regular session 09:30–16:00 ET, 2026 holiday/early-close calendar, DST-safe ET↔UTC conversion. Used by the Risk Clock; underlying session ≠ token trading ≠ oracle schedule.

## Price disagreement
`(CMC − oracle) / oracle` in bps; flagged above 100 bps; never averaged. Risk math (Phase 3) uses the protocol oracle.

## Aave V4 risk math (`packages/protocols/src/aave-v4-math.ts`)
Mirrors `Spoke._processUserAccountData` and `LiquidationLogic` (aave-v4 @ `4885a7ad`). All bigint.
| Quantity | Definition | Rounding |
|---|---|---|
| Value | amount × oraclePrice × 10^(18−decimals); 1e26 = $1 | exact |
| Health factor (WAD) | Σ(CF_bps × collateralValue) × 1e14 × RAY ÷ Σ(debtRay × price × 10^(18−dec)); debtRay = drawnShares × drawnIndex + premiumDebtRay | floor (same as Spoke) |
| Risk premium (bps) | collateral sorted by collateral risk asc / value desc, covering debt; Σ(min(value, left) × risk) ÷ covered | ceil |
| Max additional borrow | largest x with HF(after) ≥ target; x = (Σ CF·V × 1e14 × RAY ÷ target − existing debtRay) ÷ (RAY × price × 10^(18−d)) | floor |
| Single-asset liquidation price | price p where HF = 1 holding other prices fixed: (ceil(debtRay × 1e4 ÷ RAY) − Σ other CF·V) ÷ (CF × amount × 10^(18−d)) | ceil (warns earlier) |
| Drawdown to liquidation | 1 − 1/HF (uniform collateral move, debt fixed) | conservative |
| Liquidation bonus | max if HF ≤ HFmaxBonus; else min + (max−min)·(1−HF)/(1−HFmaxBonus), min = (max−1)·factor + 1 | floor |
| Borrow APR | drawnRate × (1 + riskPremium) ; interest = simple (linear) | debt rounded up |

Validation: on 5 live borrowers the computed HF, total collateral value and risk premium equal `getUserAccountData` **exactly** (`fixtures/chain/aave-v4-positions.live.json`, `aave-math.test.ts`), plus hand-computed cases.

## Parallel Futures (`strategy.ts`)
Scenario prices are oracle prices × (1 − shock) for the affected reserves; "rates ×2" accrues 90 days of simple interest at twice the live drawn rate. States: liquidatable (HF < 1), near-target (HF < Spoke targetHealthFactor 1.24), safe, no-debt.

## Solver Arena and verifier (`strategy.ts`, `verifier.ts`)
Solvers: Fortress (HF ≥ 2.00), Gap-proof (HF ≥ 1.24 / 0.8 = 1.55), Buffer-35 (HF ≥ 1/0.65), Aggressive (HF 1.10, a deliberate negative control). Each amount is capped by hub liquidity and the spoke draw-cap headroom. The verifier does not import the math module: it recomputes HF with exact rationals from raw snapshot fields and checks reserve state, caps, liquidity, wallet balances, HF ≥ 1 and the VEYDARA policy floor HF ≥ 1.25, and that the solver's HF claim matches within 1e-12. Zero-amount plans are reported as "no room".
