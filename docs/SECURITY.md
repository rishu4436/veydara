# Security

- **Secrets**: `CMC_API_KEY` and RPC URLs are server-only env vars (no `NEXT_PUBLIC_`), validated by Zod without echoing values; `pnpm check:env` flags secret-looking public vars. `.env*` is git-ignored; CI greps for committed keys.
- **No signing**: the app never requests signatures or transactions in this release. No private keys, mnemonics or session secrets exist in the codebase.
- **Token impersonation / ticker collision**: identity is (chain, contract). `classifyToken` flags registry-ticker collisions (incl. Unicode confusables like Cyrillic "С") as impersonation; URL/claim lures as suspected spam; quarantined tokens are never priced or analysed.
- **Malicious metadata**: control/bidi characters stripped, length-capped; React escapes all output.
- **CMC identity**: contract lookups accepted only when CMC's `contract_address[]` lists the exact address on the same platform; ambiguous ticker matches are never collapsed.
- **Price manipulation / stale data**: every datum carries provenance + freshness; CMC vs oracle disagreement is flagged; stale cache is labeled stale.
- **Abuse / budget**: per-IP token-bucket rate limits on every API route; gateway negative caching, backoff and circuit breaker.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Input validation**: Zod on all route query params; addresses validated (EVM checksum-normalized, Solana base58 32-byte).
- **Dependency audit**: `pnpm audit --prod` runs in CI (non-blocking, results in logs).

Open items before any execution feature: SIWE nonce sessions, CSRF on mutating routes, calldata target/selector allowlists, simulation at pinned block, full threat-model review (route injection, ABI spoofing, reorgs).
