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

## Planned (Phase 3)
Aave V4 health factor / liquidation price from protocol formulas once reserve parameters are read on-chain; borrow-cost accrual; re-open gap stress; refinance break-even.
