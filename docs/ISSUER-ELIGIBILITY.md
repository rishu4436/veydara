# Issuer eligibility

VEYDARA does **not** decide legal eligibility and does not bypass geofencing or onboarding.

Current state (2026-11-21):
- Coinbase tokenized equities (…c tokens on Base): issuer attribution verified via CMC listing names and Aave feed descriptions. Eligibility rules (jurisdictions, KYC, transfer restrictions) have **not** been sourced from Coinbase documents. Every passport shows "Transfer restrictions & eligibility: Unknown — not verified from issuer documents".
- Aave V4 Equities Hub: listing is verified from the address book. Any protocol-level allowlisting, user gating or geofencing has **not** been verified. The UI states "eligibility unverified" and offers no borrow action.
- Other issuers (Backed/xStocks, Ondo, etc.): separate instruments, not in the registry, no eligibility assumed.

Required before any execution feature: primary-source issuer terms per token, Aave V4 hub/spoke access-control review, and an explicit owner decision on jurisdiction. Until then the product runs in informational read-only mode.
