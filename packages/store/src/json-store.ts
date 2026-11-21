/**
 * Local-dev fallback when DATABASE_URL is not set: one JSON file, written atomically.
 * Single-process only; on serverless hosts it lives in /tmp and is NOT durable (reported via info()).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { WalletOwnedElsewhereError, type AlertRow, type LedgerRow, type ProofRow, type SessionRow, type Store, type StoreInfo, type WalletRow } from "./types";

interface Data {
  version: 1;
  users: string[];
  wallets: WalletRow[];
  nonces: { nonce: string; expiresAt: string; usedAt: string | null }[];
  sessions: SessionRow[];
  policies: Record<string, unknown>;
  alerts: Record<string, AlertRow[]>;
  proofs: ProofRow[];
  ledger: LedgerRow[];
}

const empty = (): Data => ({ version: 1, users: [], wallets: [], nonces: [], sessions: [], policies: {}, alerts: {}, proofs: [], ledger: [] });

export class JsonStore implements Store {
  private data: Data | null = null;
  constructor(private readonly file: string, private readonly durable: boolean) {}

  info(): StoreInfo {
    return { kind: "json", durable: this.durable, detail: this.durable ? "local JSON file (dev fallback; set DATABASE_URL for Postgres)" : "ephemeral JSON in /tmp (serverless without DATABASE_URL — sessions and records do not survive cold starts)" };
  }

  private load(): Data {
    if (this.data) return this.data;
    try {
      this.data = { ...empty(), ...(JSON.parse(readFileSync(this.file, "utf8")) as Data) };
    } catch {
      this.data = empty();
    }
    return this.data;
  }

  private save() {
    const d = this.load();
    const now = Date.now();
    d.nonces = d.nonces.filter((n) => Date.parse(n.expiresAt) > now - 3600_000);
    d.sessions = d.sessions.filter((x) => Date.parse(x.expiresAt) > now);
    if (d.ledger.length > 5000) d.ledger.splice(0, d.ledger.length - 5000);
    if (d.proofs.length > 500) d.proofs.splice(0, d.proofs.length - 500);
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  async createNonce(nonce: string, expiresAt: Date) {
    this.load().nonces.push({ nonce, expiresAt: expiresAt.toISOString(), usedAt: null });
    this.save();
  }

  async consumeNonce(nonce: string, now: Date) {
    const n = this.load().nonces.find((x) => x.nonce === nonce);
    if (!n || n.usedAt || Date.parse(n.expiresAt) <= now.getTime()) return false;
    n.usedAt = now.toISOString();
    this.save();
    return true;
  }

  async createUser(id: string) {
    const d = this.load();
    if (!d.users.includes(id)) d.users.push(id);
    this.save();
  }

  async getWallet(address: string) {
    return this.load().wallets.find((w) => w.address === address.toLowerCase()) ?? null;
  }

  async linkWallet(row: WalletRow) {
    const d = this.load();
    const address = row.address.toLowerCase();
    const i = d.wallets.findIndex((w) => w.address === address);
    if (i >= 0 && d.wallets[i]!.userId !== row.userId) throw new WalletOwnedElsewhereError(address);
    const v = { ...row, address };
    if (i >= 0) d.wallets[i] = v;
    else d.wallets.push(v);
    this.save();
  }

  async listWallets(userId: string) {
    return this.load().wallets.filter((w) => w.userId === userId);
  }

  async unlinkWallet(userId: string, address: string) {
    const d = this.load();
    const before = d.wallets.length;
    d.wallets = d.wallets.filter((w) => !(w.userId === userId && w.address === address.toLowerCase()));
    this.save();
    return d.wallets.length < before;
  }

  async createSession(row: SessionRow) {
    this.load().sessions.push(row);
    this.save();
  }

  async getSession(idHash: string, now: Date) {
    const d = this.load();
    const r = d.sessions.find((x) => x.idHash === idHash);
    if (!r) return null;
    if (Date.parse(r.expiresAt) <= now.getTime()) {
      await this.deleteSession(idHash);
      return null;
    }
    return r;
  }

  async deleteSession(idHash: string) {
    const d = this.load();
    d.sessions = d.sessions.filter((x) => x.idHash !== idHash);
    this.save();
  }

  async getPolicies(userId: string) {
    return this.load().policies[userId] ?? null;
  }

  async setPolicies(userId: string, policies: unknown) {
    this.load().policies[userId] = policies;
    this.save();
  }

  async upsertAlerts(userId: string, list: { alertKey: string; payload: unknown }[], now: Date) {
    const d = this.load();
    const rows = (d.alerts[userId] ??= []);
    for (const a of list) {
      const r = rows.find((x) => x.alertKey === a.alertKey);
      if (r) {
        r.payload = a.payload;
        r.lastSeen = now.toISOString();
      } else rows.push({ alertKey: a.alertKey, status: "active", payload: a.payload, firstSeen: now.toISOString(), lastSeen: now.toISOString() });
    }
    this.save();
    return this.listAlerts(userId);
  }

  async ackAlert(userId: string, alertKey: string) {
    const r = (this.load().alerts[userId] ?? []).find((x) => x.alertKey === alertKey);
    if (!r) return false;
    r.status = "acked";
    this.save();
    return true;
  }

  async listAlerts(userId: string) {
    return [...(this.load().alerts[userId] ?? [])].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  }

  async saveProof(row: ProofRow) {
    const d = this.load();
    const i = d.proofs.findIndex((p) => p.id === row.id);
    if (i >= 0) d.proofs[i] = row;
    else d.proofs.push(row);
    this.save();
  }

  async listProofs(limit: number) {
    return [...this.load().proofs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
  }

  async appendLedger(rows: LedgerRow[]) {
    if (!rows.length) return;
    this.load().ledger.push(...rows);
    this.save();
  }

  async listLedger(limit: number) {
    return this.load().ledger.slice(-limit).reverse();
  }
}
