import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { makeBaseClient } from "@veydara/chains";
import { checkCsrf, resolveSession, SESSION_TTL_MS, type IssuedSession } from "@veydara/auth";
import type { SessionRow } from "@veydara/store";
import { serverEnv } from "./env";
import { store } from "./store";

/** The origin SIWE messages must name. Behind a proxy set VEYDARA_PUBLIC_ORIGIN. */
export function expectedOrigin(req: Request): string {
  const env = serverEnv();
  if (env.VEYDARA_PUBLIC_ORIGIN) return new URL(env.VEYDARA_PUBLIC_ORIGIN).origin;
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const isSecure = (req: Request) => expectedOrigin(req).startsWith("https://");
/** `__Host-` prefix (Secure, Path=/, no Domain) whenever served over HTTPS. */
export const cookieNames = (secure: boolean) => ({ session: secure ? "__Host-veydara_session" : "veydara_session", csrf: secure ? "__Host-veydara_csrf" : "veydara_csrf" });

export function setSessionCookies(res: NextResponse, req: Request, s: IssuedSession) {
  const secure = isSecure(req);
  const n = cookieNames(secure);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.cookies.set(n.session, s.token, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge });
  // Readable by our JS only so it can echo it in X-CSRF-Token; the server checks it against the session's stored hash.
  res.cookies.set(n.csrf, s.csrf, { httpOnly: false, secure, sameSite: "strict", path: "/", maxAge });
}

export function clearSessionCookies(res: NextResponse, req: Request) {
  const secure = isSecure(req);
  const n = cookieNames(secure);
  res.cookies.set(n.session, "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
  res.cookies.set(n.csrf, "", { httpOnly: false, secure, sameSite: "strict", path: "/", maxAge: 0 });
}

export async function currentSession(req: Request): Promise<SessionRow | null> {
  const jar = await cookies();
  const token = jar.get(cookieNames(isSecure(req)).session)?.value;
  return resolveSession(store(), token);
}

const deny = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

/** Strict same-origin check for state-changing requests: Origin (or Sec-Fetch-Site) must be this site. */
export function strictSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin) {
    try {
      if (new URL(origin).origin === expectedOrigin(req)) return null;
    } catch {
      /* fallthrough */
    }
    return deny(403, "CROSS_ORIGIN", "Cross-origin request refused.");
  }
  if (site && site !== "same-origin" && site !== "none") return deny(403, "CROSS_ORIGIN", "Cross-site request refused.");
  return null;
}

/** Session + CSRF + same-origin, for every mutating authenticated route. */
export async function requireAuth(req: Request, opts: { csrf: boolean }): Promise<{ session: SessionRow } | { error: NextResponse }> {
  const so = strictSameOrigin(req);
  if (so) return { error: so };
  const session = await currentSession(req);
  if (!session) return { error: deny(401, "UNAUTHENTICATED", "Sign in with Ethereum first.") };
  if (opts.csrf && !checkCsrf(session, req.headers.get("x-csrf-token"))) return { error: deny(403, "CSRF", "Missing or invalid CSRF token.") };
  return { session };
}

/** Optional on-chain verifier for smart-contract wallets (ERC-1271 / ERC-6492) on Base. */
export function contractVerifier() {
  return makeBaseClient(serverEnv().BASE_RPC_URL);
}

/** Signed-in user with their SIWE-proven wallets (checksummed), or null. */
export async function sessionWithWallets(req: Request): Promise<{ userId: string; wallets: string[] } | null> {
  const s = await currentSession(req);
  if (!s) return null;
  return { userId: s.userId, wallets: (await store().listWallets(s.userId)).map((w) => w.address) };
}
