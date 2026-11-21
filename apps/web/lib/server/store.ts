import { join } from "node:path";
import { createStore, type Store } from "@veydara/store";
import { repoRoot } from "./dataset";
import { serverEnv } from "./env";

const g = globalThis as unknown as { __veydaraStore?: Store };

/** Process-wide store: Postgres when DATABASE_URL is set, otherwise a local JSON file (dev fallback). */
export function store(): Store {
  if (!g.__veydaraStore) {
    const env = serverEnv();
    const serverless = Boolean(env.VERCEL);
    const jsonFile = env.VEYDARA_DATA_FILE ?? (serverless ? "/tmp/veydara-data.json" : join(repoRoot(), ".veydara", "data.json"));
    g.__veydaraStore = createStore({ databaseUrl: env.DATABASE_URL, jsonFile, jsonDurable: !serverless });
  }
  return g.__veydaraStore;
}
