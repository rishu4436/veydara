# Security

- **Secrets**: `CMC_API_KEY` and RPC URLs are server-only env vars (no `NEXT_PUBLIC_`), validated by Zod without echoing values; `pnpm check:env` flags secret-looking public vars. `.env*` is git-ignored; CI greps for committed keys.
- **Signing (fork only)**: the app never asks the user's wallet to sign. The Fork Lab signs with anvil-generated test keys read at runtime from a 0600 file outside the repo; the signer refuses non-loopback RPCs, chain ids ≠ 31337 (checked again on the serialized tx) and non-anvil accounts. Preview hash binding + server-side freshness re-check prevent signing something other than what was reviewed. Fork POST routes reject cross-origin requests. No private keys or mnemonics exist in the codebase or fixtures (CI scan).
- **Token impersonation / ticker collision**: identity is (chain, contract). `classifyToken` flags registry-ticker collisions (incl. Unicode confusables like Cyrillic "С") as impersonation; URL/claim lures as suspected spam; quarantined tokens are never priced or analysed.
- **Malicious metadata**: control/bidi characters stripped, length-capped; React escapes all output.
- **CMC identity**: contract lookups accepted only when CMC's `contract_address[]` lists the exact address on the same platform; ambiguous ticker matches are never collapsed.
- **Price manipulation / stale data**: every datum carries provenance + freshness; CMC vs oracle disagreement is flagged; stale cache is labeled stale.
- **Abuse / budget**: per-IP token-bucket rate limits on every API route; gateway negative caching, backoff and circuit breaker.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Input validation**: Zod on all route query params; addresses validated (EVM checksum-normalized, Solana base58 32-byte).
- **Dependency audit**: `pnpm audit --prod` runs in CI (non-blocking, results in logs).

- **Calldata allowlist**: routes are built only from the pinned Spoke ABI and ERC-20 `approve`, targeting the address-book Spoke and the reserve underlyings read from it.

Open items before any non-fork execution (none planned without owner approval): SIWE nonce sessions, user-wallet signing UX, full threat-model review (route injection, ABI spoofing, reorgs), hardware-wallet clear-signing metadata.
