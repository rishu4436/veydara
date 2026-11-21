/**
 * SIWE (EIP-4361) sign-in core: server nonces, strict message validation, signature verification
 * (EOA ecrecover, then ERC-1271/ERC-6492 for smart wallets on Base), hashed session + CSRF tokens,
 * and multi-wallet ownership proofs. Framework-free so it can be unit-tested.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getAddress, recoverMessageAddress, type Address, type Hex, type PublicClient } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { WalletOwnedElsewhereError, type SessionRow, type Store } from "@veydara/store";

export const SIWE_STATEMENT = "Sign in to VEYDARA. This signature proves wallet ownership only; it does not authorize any transaction or spend.";
/** Base mainnet (read-only analysis), Ethereum mainnet (common wallet default) and the local anvil fork. Signing in never sends a transaction on any of them. */
export const SIWE_CHAIN_IDS = [8453, 1, 31337] as const;
export const NONCE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 60 * 60_000; // short-lived: 1 hour
export const MAX_MESSAGE_AGE_MS = 10 * 60_000;
export const MAX_WALLETS_PER_USER = 10;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export async function issueNonce(store: Store, now = new Date()): Promise<{ nonce: string; expiresAt: string }> {
  const nonce = generateSiweNonce();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);
  await store.createNonce(nonce, expiresAt);
  return { nonce, expiresAt: expiresAt.toISOString() };
}

export class SiweError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SiweError";
  }
}

export interface VerifiedSiwe { address: Address; chainId: number; message: string; signature: Hex; verifiedVia: "ecrecover" | "erc1271/6492"; nonce: string }

/**
 * Validate every EIP-4361 field against what this server expects, burn the nonce (single use),
 * then verify the signature. Throws SiweError with a stable code on any failure.
 */
export async function verifySiwe(opts: { store: Store; message: string; signature: string; expectedOrigin: string; now?: Date; contractVerifier?: Pick<PublicClient, "verifyMessage"> | null }): Promise<VerifiedSiwe> {
  const now = opts.now ?? new Date();
  if (opts.message.length > 2000) throw new SiweError("SIWE_TOO_LONG", "SIWE message too long");
  if (!/^0x[0-9a-fA-F]+$/.test(opts.signature) || opts.signature.length > 20_000) throw new SiweError("SIWE_BAD_SIGNATURE", "signature must be hex");
  const m = parseSiweMessage(opts.message);
  const origin = new URL(opts.expectedOrigin);
  if (!m.address || !m.nonce || !m.domain || !m.uri || !m.version || m.chainId === undefined || !m.issuedAt) throw new SiweError("SIWE_MALFORMED", "SIWE message is missing required fields");
  if (m.domain !== origin.host) throw new SiweError("SIWE_DOMAIN", `domain ${m.domain} does not match ${origin.host}`);
  let uriOrigin = "";
  try {
    uriOrigin = new URL(m.uri).origin;
  } catch {
    throw new SiweError("SIWE_URI", "uri is not a URL");
  }
  if (uriOrigin !== origin.origin) throw new SiweError("SIWE_URI", `uri origin ${uriOrigin} does not match ${origin.origin}`);
  if (m.version !== "1") throw new SiweError("SIWE_VERSION", "only SIWE version 1 is supported");
  if (!(SIWE_CHAIN_IDS as readonly number[]).includes(m.chainId)) throw new SiweError("SIWE_CHAIN", `chain id ${m.chainId} is not accepted for sign-in`);
  if (m.statement !== SIWE_STATEMENT) throw new SiweError("SIWE_STATEMENT", "unexpected statement");
  const issued = m.issuedAt.getTime();
  if (issued > now.getTime() + 60_000 || now.getTime() - issued > MAX_MESSAGE_AGE_MS) throw new SiweError("SIWE_STALE", "message issuedAt is outside the allowed window");
  if (m.expirationTime && m.expirationTime.getTime() <= now.getTime()) throw new SiweError("SIWE_EXPIRED", "message has expired");
  if (m.notBefore && m.notBefore.getTime() > now.getTime()) throw new SiweError("SIWE_NOT_YET_VALID", "message is not valid yet");
  // Burn the nonce before verifying the signature so a nonce can never be tried twice.
  if (!(await opts.store.consumeNonce(m.nonce, now))) throw new SiweError("SIWE_NONCE", "nonce is unknown, expired or already used");
  const address = getAddress(m.address);
  const signature = opts.signature as Hex;
  let verifiedVia: VerifiedSiwe["verifiedVia"] | null = null;
  try {
    if (getAddress(await recoverMessageAddress({ message: opts.message, signature })) === address) verifiedVia = "ecrecover";
  } catch {
    /* not a plain ECDSA signature — maybe a smart wallet */
  }
  if (!verifiedVia && opts.contractVerifier && m.chainId !== 31337) {
    try {
      if (await opts.contractVerifier.verifyMessage({ address, message: opts.message, signature })) verifiedVia = "erc1271/6492";
    } catch {
      /* fall through */
    }
  }
  if (!verifiedVia) throw new SiweError("SIWE_SIGNATURE", "signature does not prove ownership of the address");
  return { address, chainId: m.chainId, message: opts.message, signature, verifiedVia, nonce: m.nonce };
}

export interface IssuedSession { token: string; csrf: string; row: SessionRow }

/** Sign in: the wallet's existing user, or a new user. Always records the fresh ownership proof. */
export async function signIn(store: Store, v: VerifiedSiwe, now = new Date()): Promise<IssuedSession & { userId: string; newUser: boolean }> {
  const existing = await store.getWallet(v.address);
  const userId = existing?.userId ?? randomUUID();
  if (!existing) await store.createUser(userId);
  await store.linkWallet({ address: v.address, userId, chainId: v.chainId, siweMessage: v.message, signature: v.signature, verifiedVia: v.verifiedVia, linkedAt: now.toISOString() });
  const s = await openSession(store, userId, now);
  return { ...s, userId, newUser: !existing };
}

/** Link an additional wallet to the signed-in user (multi-wallet ownership proof). */
export async function linkWallet(store: Store, userId: string, v: VerifiedSiwe, now = new Date()): Promise<void> {
  const list = await store.listWallets(userId);
  if (!list.some((w) => w.address === v.address.toLowerCase()) && list.length >= MAX_WALLETS_PER_USER) throw new SiweError("SIWE_TOO_MANY", `at most ${MAX_WALLETS_PER_USER} wallets per account`);
  try {
    await store.linkWallet({ address: v.address, userId, chainId: v.chainId, siweMessage: v.message, signature: v.signature, verifiedVia: v.verifiedVia, linkedAt: now.toISOString() });
  } catch (e) {
    if (e instanceof WalletOwnedElsewhereError) throw new SiweError("SIWE_WALLET_TAKEN", e.message);
    throw e;
  }
}

export async function openSession(store: Store, userId: string, now = new Date()): Promise<IssuedSession> {
  const token = newToken();
  const csrf = newToken();
  const row: SessionRow = { idHash: sha256(token), userId, csrfHash: sha256(csrf), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString() };
  await store.createSession(row);
  return { token, csrf, row };
}

export async function resolveSession(store: Store, token: string | undefined, now = new Date()): Promise<SessionRow | null> {
  if (!token || token.length > 100) return null;
  return store.getSession(sha256(token), now);
}

export function checkCsrf(session: SessionRow, headerToken: string | null): boolean {
  if (!headerToken || headerToken.length > 100) return false;
  return safeEqualHex(sha256(headerToken), session.csrfHash);
}
