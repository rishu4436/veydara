import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "./schema";
import { WalletOwnedElsewhereError, type AlertRow, type LedgerRow, type ProofRow, type SessionRow, type Store, type StoreInfo, type WalletRow } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDb = PgDatabase<PgQueryResultHKT, any>;

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/** Postgres adapter (works with node-postgres in production and PGlite in tests). */
export class PgStore implements Store {
  constructor(private readonly db: AnyPgDb, private readonly detail: string) {}

  info(): StoreInfo {
    return { kind: "postgres", durable: true, detail: this.detail };
  }

  async createNonce(nonce: string, expiresAt: Date) {
    await this.db.insert(s.siweNonces).values({ nonce, expiresAt });
  }

  async consumeNonce(nonce: string, now: Date) {
    const r = await this.db
      .update(s.siweNonces)
      .set({ usedAt: now })
      .where(and(eq(s.siweNonces.nonce, nonce), isNull(s.siweNonces.usedAt), gt(s.siweNonces.expiresAt, now)))
      .returning({ nonce: s.siweNonces.nonce });
    return r.length === 1;
  }

  async createUser(id: string) {
    await this.db.insert(s.users).values({ id }).onConflictDoNothing();
  }

  private wallet(r: typeof s.wallets.$inferSelect): WalletRow {
    return { address: r.address, userId: r.userId, chainId: r.chainId, siweMessage: r.siweMessage, signature: r.signature, verifiedVia: r.verifiedVia as WalletRow["verifiedVia"], linkedAt: iso(r.linkedAt) };
  }

  async getWallet(address: string) {
    const [r] = await this.db.select().from(s.wallets).where(eq(s.wallets.address, address.toLowerCase()));
    return r ? this.wallet(r) : null;
  }

  async linkWallet(row: WalletRow) {
    const address = row.address.toLowerCase();
    const existing = await this.getWallet(address);
    if (existing && existing.userId !== row.userId) throw new WalletOwnedElsewhereError(address);
    const values = { address, userId: row.userId, chainId: row.chainId, siweMessage: row.siweMessage, signature: row.signature, verifiedVia: row.verifiedVia, linkedAt: new Date(row.linkedAt) };
    await this.db.insert(s.wallets).values(values).onConflictDoUpdate({ target: s.wallets.address, set: { chainId: values.chainId, siweMessage: values.siweMessage, signature: values.signature, verifiedVia: values.verifiedVia, linkedAt: values.linkedAt }, setWhere: eq(s.wallets.userId, row.userId) });
  }

  async listWallets(userId: string) {
    return (await this.db.select().from(s.wallets).where(eq(s.wallets.userId, userId)).orderBy(s.wallets.linkedAt)).map((r) => this.wallet(r));
  }

  async unlinkWallet(userId: string, address: string) {
    const r = await this.db.delete(s.wallets).where(and(eq(s.wallets.userId, userId), eq(s.wallets.address, address.toLowerCase()))).returning({ a: s.wallets.address });
    return r.length > 0;
  }

  async createSession(row: SessionRow) {
    await this.db.insert(s.sessions).values({ idHash: row.idHash, userId: row.userId, csrfHash: row.csrfHash, createdAt: new Date(row.createdAt), expiresAt: new Date(row.expiresAt) });
  }

  async getSession(idHash: string, now: Date) {
    const [r] = await this.db.select().from(s.sessions).where(eq(s.sessions.idHash, idHash));
    if (!r) return null;
    if (r.expiresAt <= now) {
      await this.deleteSession(idHash);
      return null;
    }
    return { idHash: r.idHash, userId: r.userId, csrfHash: r.csrfHash, createdAt: iso(r.createdAt), expiresAt: iso(r.expiresAt) };
  }

  async deleteSession(idHash: string) {
    await this.db.delete(s.sessions).where(eq(s.sessions.idHash, idHash));
  }

  async getPolicies(userId: string) {
    const [r] = await this.db.select().from(s.policies).where(eq(s.policies.userId, userId));
    return r ? r.policies : null;
  }

  async setPolicies(userId: string, policies: unknown) {
    await this.db.insert(s.policies).values({ userId, policies, updatedAt: new Date() }).onConflictDoUpdate({ target: s.policies.userId, set: { policies, updatedAt: new Date() } });
  }

  async upsertAlerts(userId: string, list: { alertKey: string; payload: unknown }[], now: Date) {
    for (const a of list) {
      await this.db
        .insert(s.alerts)
        .values({ userId, alertKey: a.alertKey, status: "active", payload: a.payload, firstSeen: now, lastSeen: now })
        .onConflictDoUpdate({ target: [s.alerts.userId, s.alerts.alertKey], set: { payload: a.payload, lastSeen: now } });
    }
    return this.listAlerts(userId);
  }

  async ackAlert(userId: string, alertKey: string) {
    const r = await this.db.update(s.alerts).set({ status: "acked" }).where(and(eq(s.alerts.userId, userId), eq(s.alerts.alertKey, alertKey))).returning({ k: s.alerts.alertKey });
    return r.length > 0;
  }

  async listAlerts(userId: string): Promise<AlertRow[]> {
    return (await this.db.select().from(s.alerts).where(eq(s.alerts.userId, userId)).orderBy(desc(s.alerts.lastSeen))).map((r) => ({ alertKey: r.alertKey, status: r.status as AlertRow["status"], payload: r.payload, firstSeen: iso(r.firstSeen), lastSeen: iso(r.lastSeen) }));
  }

  async saveProof(row: ProofRow) {
    const v = { ...row, createdAt: new Date(row.createdAt) };
    await this.db.insert(s.proofs).values(v).onConflictDoUpdate({ target: s.proofs.id, set: { outcome: v.outcome, record: v.record } });
  }

  async listProofs(limit: number): Promise<ProofRow[]> {
    return (await this.db.select().from(s.proofs).orderBy(desc(s.proofs.createdAt)).limit(limit)).map((r) => ({ ...r, createdAt: iso(r.createdAt) }));
  }

  async appendLedger(rows: LedgerRow[]) {
    if (!rows.length) return;
    await this.db.insert(s.creditLedger).values(rows.map((r) => ({ at: new Date(r.at), endpoint: r.endpoint, mode: r.mode, feature: r.feature, outcome: r.outcome, httpStatus: r.httpStatus ?? null, expectedCredits: r.expectedCredits, actualCredits: r.actualCredits ?? null, errorCode: r.errorCode ?? null, latencyMs: r.latencyMs ?? null })));
  }

  async listLedger(limit: number): Promise<LedgerRow[]> {
    return (await this.db.select().from(s.creditLedger).orderBy(desc(s.creditLedger.id)).limit(limit)).map((r) => ({ at: iso(r.at), endpoint: r.endpoint, mode: r.mode, feature: r.feature, outcome: r.outcome, httpStatus: r.httpStatus, expectedCredits: r.expectedCredits, actualCredits: r.actualCredits, errorCode: r.errorCode, latencyMs: r.latencyMs }));
  }
}
