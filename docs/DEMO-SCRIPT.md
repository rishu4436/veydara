# Demo script (current build, ~2 min)

1. **Overview, disconnected** — "Start from what you own." Topbar shows CMC status; the source-health drawer and `/proof` show the key-access probe (402/1004 plan expired) and that keyless endpoints are serving.
2. **Watch the Aave V4 Equities Hub contract** (`/?watch=0xa4d5947Eb727A052bae69C593FfC84247EC9864E`). Real block-pinned balances of USDC and eight Coinbase tokenized equities; Capital Constellation links each holding to its underlying and to the Aave V4 reserve with its collateral factor (table view for accessibility).
3. **Open NVDAc → Collateral Passport.** Price triad (CMC token quote vs CMC aggregate [unavailable: plan expired] vs Aave oracle) with the disagreement flag; live reserve facts (CF 70%, add cap, bonus 5.5%); real DEX candles with EMA20/50 and S/R zones, outlier wick disclosed; multi-horizon research (1h/4h/1d) with consensus and sources; issuer graph (unavailable with exact reason).
4. **Positions** — pick a public recent borrower. Spoke health factor with "VEYDARA recomputation matches exactly ✓", liquidation prices per collateral, drawdown to liquidation, APR, headroom; Risk Clock shows what a Monday gap does to HF; Parallel Futures table; full reserve table.
5. **Strategies (Solver Arena)** — choose a low-leverage borrower: Fortress / Gap-proof / Buffer-35 verified with exact HF; Aggressive rejected by the verifier on the HF ≥ 1.25 policy; expand the checks.
6. **Proof Center** — credit ledger rows from steps 2–5 (keyless fallback tagged), capability matrix, recorded key probe.

With an active CMC key the same build lights up RWA aggregate prices, the issuer graph (NVDAX, NVDAon, … vs NVDAc) and CEX OHLCV — no code change.
