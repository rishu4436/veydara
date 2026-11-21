import { z } from "zod";

/** Server-only environment schema. Secrets never use the NEXT_PUBLIC_ prefix. */
const EnvSchema = z.object({
  CMC_API_KEY: z.string().trim().min(1).optional(),
  CMC_ALLOW_KEYLESS: z.enum(["true", "false"]).default("true"),
  CMC_PLAN: z.enum(["basic", "startup", "growth", "professional", "enterprise"]).default("startup"),
  BASE_RPC_URL: z.url().optional(),
  SOLANA_RPC_URL: z.url().optional(),
  /** Local anvil fork (loopback only — enforced again in @veydara/execution). */
  FORK_RPC_URL: z.url().default("http://127.0.0.1:8545"),
  FORK_ACCOUNTS_FILE: z.string().default("/tmp/veydara-fork/anvil-accounts.json"),
  FORK_RECORDS_DIR: z.string().default("/tmp/veydara-fork/records"),
  /** "fixture" serves the committed, labelled snapshots instead of live reads (e2e / offline demo). */
  VEYDARA_DATASET: z.enum(["live", "fixture"]).default("live"),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | null = null;
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const raw = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]));
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Never echo values — only which variable is malformed.
    throw new Error(`Invalid server environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  cached = parsed.data;
  return cached;
}
