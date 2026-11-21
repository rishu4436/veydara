import { CmcGateway } from "@veydara/cmc";
import { serverEnv } from "./env";

const g = globalThis as unknown as { __veydaraCmc?: CmcGateway };

/** Process-wide singleton so cache, single-flight and the credit ledger are shared. */
export function cmc(): CmcGateway {
  if (!g.__veydaraCmc) {
    const env = serverEnv();
    g.__veydaraCmc = new CmcGateway({ apiKey: env.CMC_API_KEY, allowKeyless: env.CMC_ALLOW_KEYLESS === "true" });
  }
  return g.__veydaraCmc;
}
