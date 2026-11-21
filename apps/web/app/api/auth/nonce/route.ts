import { issueNonce, SIWE_CHAIN_IDS, SIWE_STATEMENT } from "@veydara/auth";
import { expectedOrigin } from "@/lib/server/auth";
import { errorResponse, json, rateLimit } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Server-issued, single-use SIWE nonce (5-minute expiry). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "auth-nonce", 20);
  if (limited) return limited;
  try {
    const origin = new URL(expectedOrigin(req));
    const n = await issueNonce(store());
    return json({ ...n, statement: SIWE_STATEMENT, domain: origin.host, uri: origin.origin, chainIds: SIWE_CHAIN_IDS });
  } catch (e) {
    return errorResponse(e);
  }
}
