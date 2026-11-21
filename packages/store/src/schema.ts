/**
 * VEYDARA persistence schema (Postgres via Drizzle). Migrations live in packages/store/drizzle
 * and are generated with `pnpm --filter @veydara/store db:generate`.
 * Secrets are never stored: session and CSRF tokens are kept only as SHA-256 hashes.
 */
import { bigserial, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Wallets proven by a SIWE (EIP-4361) signature. One wallet belongs to at most one user. */
export const wallets = pgTable(
  "wallets",
  {
    address: text("address").primaryKey(), // lowercase 0x…
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    chainId: integer("chain_id").notNull(),
    siweMessage: text("siwe_message").notNull(),
    signature: text("signature").notNull(),
    verifiedVia: text("verified_via").notNull(), // "ecrecover" | "erc1271/6492"
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallets_user_idx").on(t.userId)],
);

export const siweNonces = pgTable("siwe_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    csrfHash: text("csrf_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const policies = pgTable("guardian_policies", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  policies: jsonb("policies").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable(
  "guardian_alerts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    alertKey: text("alert_key").notNull(), // policyId:address
    status: text("status").notNull(), // active | acked
    payload: jsonb("payload").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alerts_user_key_uq").on(t.userId, t.alertKey)],
);

/** Proof Center records (fork executions, intent solves). `record` is the full JSON record. */
export const proofs = pgTable(
  "proofs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(), // FORK | LIVE-READ | FIXTURE
    outcome: text("outcome").notNull(),
    account: text("account"),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    record: jsonb("record").notNull(),
  },
  (t) => [index("proofs_created_idx").on(t.createdAt)],
);

/** CMC API credit ledger (expected vs reported credit_count), persisted from the gateway. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    endpoint: text("endpoint").notNull(),
    mode: text("mode").notNull(),
    feature: text("feature").notNull(),
    outcome: text("outcome").notNull(),
    httpStatus: integer("http_status"),
    expectedCredits: integer("expected_credits").notNull(),
    actualCredits: integer("actual_credits"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
  },
  (t) => [index("credit_ledger_at_idx").on(t.at)],
);
