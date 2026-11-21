# Execution runbook

**Status: no execution path exists.** Nothing in this release can sign, simulate or broadcast.

Planned Phase 4 procedure (Aave V4 Equities Hub, Base fork only):
1. `anvil --fork-url $BASE_RPC_URL --fork-block-number <pinned>`; label the environment "FORK" in every screen and receipt.
2. Validate policy/eligibility → read fresh reserve state → build typed route → independent verifier → simulate (`eth_call` at pinned block) → human-readable preview → explicit signature from the user's wallet connected to the fork RPC → wait for receipt → reconcile balances/debt → write Proof Center artifact.
3. Never "success" before a confirmed receipt; reverts shown verbatim.
4. Mainnet broadcast requires explicit written owner approval and is out of scope until then.
