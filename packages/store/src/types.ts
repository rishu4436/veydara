export interface WalletRow { address: string; userId: string; chainId: number; siweMessage: string; signature: string; verifiedVia: "ecrecover" | "erc1271/6492"; linkedAt: string }
export interface SessionRow { idHash: string; userId: string; csrfHash: string; createdAt: string; expiresAt: string }
export interface AlertRow { alertKey: string; status: "active" | "acked"; payload: unknown; firstSeen: string; lastSeen: string }
export interface ProofRow { id: string; kind: string; label: string; outcome: string; account: string | null; userId: string | null; createdAt: string; record: unknown }
export interface LedgerRow {
  at: string;
  endpoint: string;
  mode: string;
  feature: string;
  outcome: string;
  httpStatus?: number | null;
  expectedCredits: number;
  actualCredits?: number | null;
  errorCode?: string | null;
  latencyMs?: number | null;
}

export class WalletOwnedElsewhereError extends Error {
  constructor(address: string) {
    super(`wallet ${address} is already linked to a different VEYDARA account`);
    this.name = "WalletOwnedElsewhereError";
  }
}

export interface StoreInfo { kind: "postgres" | "json"; durable: boolean; detail: string }

/** Persistence port. Two adapters: Postgres (Drizzle) and a local JSON file fallback. */
export interface Store {
  info(): StoreInfo;
  createNonce(nonce: string, expiresAt: Date): Promise<void>;
  /** Single use: returns true exactly once for an unexpired, unused nonce. */
  consumeNonce(nonce: string, now: Date): Promise<boolean>;
  createUser(id: string): Promise<void>;
  getWallet(address: string): Promise<WalletRow | null>;
  /** Throws WalletOwnedElsewhereError if the wallet belongs to another user. Re-linking to the same user refreshes the proof. */
  linkWallet(row: WalletRow): Promise<void>;
  listWallets(userId: string): Promise<WalletRow[]>;
  unlinkWallet(userId: string, address: string): Promise<boolean>;
  createSession(row: SessionRow): Promise<void>;
  /** Returns null (and deletes) expired sessions. */
  getSession(idHash: string, now: Date): Promise<SessionRow | null>;
  deleteSession(idHash: string): Promise<void>;
  getPolicies(userId: string): Promise<unknown | null>;
  setPolicies(userId: string, policies: unknown): Promise<void>;
  upsertAlerts(userId: string, alerts: { alertKey: string; payload: unknown }[], now: Date): Promise<AlertRow[]>;
  ackAlert(userId: string, alertKey: string): Promise<boolean>;
  listAlerts(userId: string): Promise<AlertRow[]>;
  saveProof(row: ProofRow): Promise<void>;
  listProofs(limit: number): Promise<ProofRow[]>;
  appendLedger(rows: LedgerRow[]): Promise<void>;
  listLedger(limit: number): Promise<LedgerRow[]>;
}
