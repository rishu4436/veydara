import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { describe, expect, it } from "vitest";
import { JsonStore } from "@veydara/store";
import { checkCsrf, issueNonce, linkWallet, resolveSession, signIn, SIWE_STATEMENT, verifySiwe } from "../src";

const ORIGIN = "http://127.0.0.1:3000";
const mkStore = () => new JsonStore(join(mkdtempSync(join(tmpdir(), "veydara-auth-")), "d.json"), true);
const wallet = () => privateKeyToAccount(generatePrivateKey()); // ephemeral test keys, never persisted

async function signed(store: JsonStore, acct = wallet(), over: Partial<Parameters<typeof createSiweMessage>[0]> = {}, signer = acct) {
  const { nonce } = await issueNonce(store);
  const message = createSiweMessage({ address: acct.address, chainId: 8453, domain: "127.0.0.1:3000", uri: ORIGIN, nonce, version: "1", statement: SIWE_STATEMENT, issuedAt: new Date(), ...over });
  return { acct, message, signature: await signer.signMessage({ message }) };
}

describe("SIWE (EIP-4361)", () => {
  it("verifies a correct message and burns the nonce (no replay)", async () => {
    const store = mkStore();
    const s = await signed(store);
    const v = await verifySiwe({ store, ...s, expectedOrigin: ORIGIN });
    expect(v).toMatchObject({ address: s.acct.address, verifiedVia: "ecrecover", chainId: 8453 });
    await expect(verifySiwe({ store, ...s, expectedOrigin: ORIGIN })).rejects.toMatchObject({ code: "SIWE_NONCE" });
  });

  it.each([
    ["SIWE_DOMAIN", { domain: "evil.example" }],
    ["SIWE_URI", { uri: "https://evil.example/login" }],
    ["SIWE_CHAIN", { chainId: 137 }],
    ["SIWE_STATEMENT", { statement: "Sign in" }],
    ["SIWE_STALE", { issuedAt: new Date(Date.now() - 11 * 60_000) }],
    ["SIWE_EXPIRED", { expirationTime: new Date(Date.now() - 1000) }],
  ])("rejects %s", async (code, over) => {
    const store = mkStore();
    const s = await signed(store, wallet(), over);
    await expect(verifySiwe({ store, ...s, expectedOrigin: ORIGIN })).rejects.toMatchObject({ code });
  });

  it("rejects an unknown nonce and a signature from a different key", async () => {
    const store = mkStore();
    const a = wallet();
    const s1 = await signed(store, a, { nonce: "notissued123" });
    await expect(verifySiwe({ store, ...s1, expectedOrigin: ORIGIN })).rejects.toMatchObject({ code: "SIWE_NONCE" });
    const s2 = await signed(store, a, {}, wallet());
    await expect(verifySiwe({ store, ...s2, expectedOrigin: ORIGIN })).rejects.toMatchObject({ code: "SIWE_SIGNATURE" });
  });

  it("sessions are hashed, short-lived and CSRF-bound; multiple wallets link with their own proofs", async () => {
    const store = mkStore();
    const a = await signed(store);
    const s = await signIn(store, await verifySiwe({ store, ...a, expectedOrigin: ORIGIN }));
    expect(s.newUser).toBe(true);
    expect(s.row.idHash).not.toContain(s.token);
    expect(Date.parse(s.row.expiresAt) - Date.parse(s.row.createdAt)).toBe(3600_000);
    const sess = await resolveSession(store, s.token);
    expect(sess?.userId).toBe(s.userId);
    expect(checkCsrf(sess!, s.csrf)).toBe(true);
    expect(checkCsrf(sess!, "wrong")).toBe(false);
    expect(checkCsrf(sess!, null)).toBe(false);
    expect(await resolveSession(store, s.token, new Date(Date.now() + 3601_000))).toBeNull();

    const b = await signed(store);
    await linkWallet(store, s.userId, await verifySiwe({ store, ...b, expectedOrigin: ORIGIN }));
    expect((await store.listWallets(s.userId)).map((w) => w.address).sort()).toEqual([a.acct.address, b.acct.address].map((x) => x.toLowerCase()).sort());
    // Signing in with the second wallet lands in the same account.
    const b2 = await signed(store, b.acct);
    expect((await signIn(store, await verifySiwe({ store, ...b2, expectedOrigin: ORIGIN }))).userId).toBe(s.userId);
    // A wallet owned by another account cannot be linked.
    const other = await signIn(store, await verifySiwe({ store, ...(await signed(store)), expectedOrigin: ORIGIN }));
    const b3 = await signed(store, b.acct);
    await expect(linkWallet(store, other.userId, await verifySiwe({ store, ...b3, expectedOrigin: ORIGIN }))).rejects.toMatchObject({ code: "SIWE_WALLET_TAKEN" });
  });
});
