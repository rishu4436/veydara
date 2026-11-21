import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { JsonStore } from "./json-store";
import { PgStore } from "./pg-store";
import * as schema from "./schema";
import type { Store } from "./types";

export interface StoreConfig {
  databaseUrl?: string;
  jsonFile: string;
  /** false on serverless hosts where the JSON file lives in ephemeral /tmp. */
  jsonDurable: boolean;
}

/** DATABASE_URL → Postgres (Neon or any Postgres; TLS via `sslmode=require` in the URL). Otherwise JSON fallback. */
export function createStore(cfg: StoreConfig): Store {
  if (cfg.databaseUrl) {
    const pool = new Pool({ connectionString: cfg.databaseUrl, max: 5, idleTimeoutMillis: 10_000 });
    let host = "postgres";
    try {
      host = new URL(cfg.databaseUrl).hostname;
    } catch {
      /* host stays generic; never echo the URL (it carries credentials) */
    }
    // Public capability text: keep the provider/region suffix, hide the endpoint label.
    const shown = host.includes(".") ? host.replace(/^[^.]+/, "…") : host;
    return new PgStore(drizzle(pool, { schema }), `Postgres at ${shown} (Drizzle; migrations in packages/store/drizzle)`);
  }
  return new JsonStore(cfg.jsonFile, cfg.jsonDurable);
}
