// Apply committed Drizzle migrations to DATABASE_URL. Never prints the URL (it carries credentials).
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — nothing to migrate (the app uses the local JSON fallback).");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const { rows } = await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations");
  console.log(`migrations applied on ${new URL(url).hostname}; ${rows[0].n} migration(s) recorded`);
} finally {
  await pool.end();
}
