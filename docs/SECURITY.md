# Security

- **Secrets**: `CMC_API_KEY` and RPC URLs are server-only env vars (no `NEXT_PUBLIC_`), validated by Zod without echoing values; `pnpm check:env` flags secret-looking public vars. `.env*` is git-ignored; CI greps for committed keys.
- **Signing (fork only)**: two signers, both fork-only. (a) The user's SIWE-proven wallet: wagmi adds/switches to chain 31337 (loopback RPC); the server hands over only the exact previewed steps after a freshness re-check and accepts back only tx hashes whose on-fork from/to/calldata/chainId/value match the preview; anything else is reported, not reconciled. Simulation impersonates the wallet inside a reverted snapshot. Mainnet signing is shown as unavailable. (b) The Fork Lab signs with anvil-generated test keys read at runtime from a 0600 file outside the repo; the signer refuses non-loopback RPCs, chain ids ≠ 31337 (checked again on the serialized tx) and non-anvil accounts. Preview hash binding + server-side freshness re-check prevent signing something other than what was reviewed. Fork POST routes reject cross-origin requests. No private keys or mnemonics exist in the codebase or fixtures (CI scan).
- **Token impersonation / ticker collision**: identity is (chain, contract). `classifyToken` flags registry-ticker collisions (incl. Unicode confusables like Cyrillic "С") as impersonation; URL/claim lures as suspected spam; quarantined tokens are never priced or analysed.
- **Malicious metadata**: control/bidi characters stripped, length-capped; React escapes all output.
- **CMC identity**: contract lookups accepted only when CMC's `contract_address[]` lists the exact address on the same platform; ambiguous ticker matches are never collapsed.
- **Price manipulation / stale data**: every datum carries provenance + freshness; CMC vs oracle disagreement is flagged; stale cache is labeled stale.
- **Abuse / budget**: per-IP token-bucket rate limits on every API route; gateway negative caching, backoff and circuit breaker.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Input validation**: Zod on all route query params; addresses validated (EVM checksum-normalized, Solana base58 32-byte).
- **Dependency audit**: `pnpm audit --prod` runs in CI (non-blocking, results in logs).

- **Calldata allowlist**: routes are built only from the pinned Spoke ABI and ERC-20 `approve`, targeting the address-book Spoke and the reserve underlyings read from it.

- **SIWE (EIP-4361)**: nonces are server-issued (viem `generateSiweNonce`, random), single-use and expire in 5 min; the nonce is burned before signature checks so a failed attempt cannot be replayed. The message must match the expected domain, URI origin, version 1, chain 8453/1/31337, the exact VEYDARA statement, issuedAt within 10 min, and expiration/notBefore. EOAs verify by ecrecover, contract wallets by ERC-1271/6492 on Base.
- **Sessions/cookies**: 32-byte random session and CSRF tokens; only SHA-256 hashes are stored. 1 h lifetime, rotated on sign-in. Cookies are HttpOnly (session), SameSite=Strict, Path=/, and `__Host-`-prefixed + Secure when served over HTTPS. Logout deletes the server session.
- **CSRF**: every state-changing authenticated route requires an `X-CSRF-Token` header whose SHA-256 matches the session's stored CSRF hash (token delivered in a readable cookie, constant-time compare) **and** a strict same-origin check (Origin or Sec-Fetch-Site).
- **Multi-wallet proof**: each linked wallet signs its own SIWE message while the session is active; a wallet can belong to one user only; the last wallet cannot be unlinked; max 10 wallets.
- **Persistence**: `DATABASE_URL` is server-only and never logged (only the hostname is reported). The JSON fallback writes 0600 files atomically under a git-ignored directory; on Vercel without a database it is ephemeral and labelled so.

Open items before any non-fork execution (none planned without owner approval): full threat-model review (route injection, ABI spoofing, reorgs), hardware-wallet clear-signing metadata.
