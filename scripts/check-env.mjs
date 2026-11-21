// Credential readiness check. Prints which capabilities each variable unlocks.
// Never prints secret values.
import { existsSync, readFileSync } from "node:fs";

const files = ["apps/web/.env.local", ".env.local", ".env"].filter(existsSync);
const env = { ...process.env };
for (const f of files) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
}
const has = (k) => Boolean(env[k] && env[k].trim());
const rows = [
  ["CMC_API_KEY", has("CMC_API_KEY"), "RWA map/info/quotes/historical/issuers, v5 OHLCV charts + indicators, higher rate limits"],
  ["CMC_ALLOW_KEYLESS", env.CMC_ALLOW_KEYLESS !== "false", "Keyless v3 quotes / v2 info / DEX token when no key"],
  ["BASE_RPC_URL", has("BASE_RPC_URL"), "Dedicated Base RPC (else public mainnet.base.org)"],
  ["SOLANA_RPC_URL", has("SOLANA_RPC_URL"), "Dedicated Solana RPC (else public mainnet-beta)"],
];
console.log(`env files read: ${files.length ? files.join(", ") : "(none)"}\n`);
for (const [k, ok, what] of rows) console.log(`${ok ? "✔" : "✘"} ${k.padEnd(18)} ${what}`);
if (has("CMC_API_KEY") && /^NEXT_PUBLIC_/.test("CMC_API_KEY")) process.exit(1);
for (const k of Object.keys(env)) if (k.startsWith("NEXT_PUBLIC_") && /KEY|SECRET|TOKEN/i.test(k)) { console.error(`✘ ${k} looks like a secret exposed to the browser`); process.exit(1); }
