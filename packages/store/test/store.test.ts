import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { JsonStore, PgStore, WalletOwnedElsewhereError, type Store } from "../src";
import * as schema from "../src/schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

async function pg(): Promise<Store> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return new PgStore(db, "PGlite (in-memory, test)");
}
const json = async (): Promise<Store> => new JsonStore(join(mkdtempSync(join(tmpdir(), "veydara-store-")), "data.json"), true);

for (const [name, make] of [["postgres (PGlite + committed migrations)", pg], ["json fallback", json]] as const) {
  describe(`Store contract — ${name}`, () => {
    it("SIWE nonces are single-use and expire", async () => {
      const s = await make();
      const now = new Date();
      await s.createNonce("abc12345", new Date(now.getTime() + 60_000));
      await s.createNonce("old12345", new Date(now.getTime() - 1));
      expect(await s.consumeNonce("abc12345", now)).toBe(true);
      expect(await s.consumeNonce("abc12345", now)).toBe(false);
      expect(await s.consumeNonce("old12345", now)).toBe(false);
      expect(await s.consumeNonce("missing1", now)).toBe(false);
    });

    it("wallet ownership: one user per wallet, many wallets per user", async () => {
      const s = await make();
      await s.createUser("u1");
      await s.createUser("u2");
      const w = (address: string, userId: string) => ({ address, userId, chainId: 8453, siweMessage: "m", signature: "0x01", verifiedVia: "ecrecover" as const, linkedAt: new Date().toISOString() });
      await s.linkWallet(w("0xAA00000000000000000000000000000000000001", "u1"));
      await s.linkWallet(w("0xaa00000000000000000000000000000000000002", "u1"));
      await expect(s.linkWallet(w("0xaa00000000000000000000000000000000000001", "u2"))).rejects.toBeInstanceOf(WalletOwnedElsewhereError);
      await s.linkWallet(w("0xaa00000000000000000000000000000000000001", "u1")); // refresh same owner
      expect((await s.listWallets("u1")).map((x) => x.address).sort()).toEqual(["0xaa00000000000000000000000000000000000001", "0xaa00000000000000000000000000000000000002"]);
      expect((await s.getWallet("0xAA00000000000000000000000000000000000001"))?.userId).toBe("u1");
      expect(await s.unlinkWallet("u2", "0xaa00000000000000000000000000000000000001")).toBe(false);
      expect(await s.unlinkWallet("u1", "0xaa00000000000000000000000000000000000002")).toBe(true);
    });

    it("sessions expire and can be revoked", async () => {
      const s = await make();
      await s.createUser("u1");
      const now = new Date();
      await s.createSession({ idHash: "h1", userId: "u1", csrfHash: "c1", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 1000).toISOString() });
      expect((await s.getSession("h1", now))?.userId).toBe("u1");
      expect(await s.getSession("h1", new Date(now.getTime() + 2000))).toBeNull();
      await s.createSession({ idHash: "h2", userId: "u1", csrfHash: "c2", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60_000).toISOString() });
      await s.deleteSession("h2");
      expect(await s.getSession("h2", now)).toBeNull();
    });

    it("policies, alerts (dedupe + ack), proofs and the credit ledger round-trip", async () => {
      const s = await make();
      await s.createUser("u1");
      expect(await s.getPolicies("u1")).toBeNull();
      await s.setPolicies("u1", [{ id: "p-hf", threshold: 1.5 }]);
      await s.setPolicies("u1", [{ id: "p-hf", threshold: 1.6 }]);
      expect(await s.getPolicies("u1")).toEqual([{ id: "p-hf", threshold: 1.6 }]);
      await s.upsertAlerts("u1", [{ alertKey: "p-hf:0x1", payload: { v: 1 } }], new Date());
      const rows = await s.upsertAlerts("u1", [{ alertKey: "p-hf:0x1", payload: { v: 2 } }, { alertKey: "p-dd:0x1", payload: { v: 3 } }], new Date());
      expect(rows).toHaveLength(2);
      expect(await s.ackAlert("u1", "p-hf:0x1")).toBe(true);
      expect((await s.listAlerts("u1")).find((a) => a.alertKey === "p-hf:0x1")).toMatchObject({ status: "acked", payload: { v: 2 } });
      await s.saveProof({ id: "r1", kind: "fork-execution", label: "FORK", outcome: "executed", account: "0x1", userId: null, createdAt: "2026-11-21T10:00:00.000Z", record: { a: 1 } });
      await s.saveProof({ id: "r2", kind: "intent-solve", label: "LIVE-READ", outcome: "solved", account: null, userId: "u1", createdAt: "2026-11-21T11:00:00.000Z", record: { b: 2 } });
      expect((await s.listProofs(10)).map((p) => p.id)).toEqual(["r2", "r1"]);
      await s.appendLedger([{ at: new Date().toISOString(), endpoint: "/v1/x", mode: "keyless", feature: "f", outcome: "miss", httpStatus: 200, expectedCredits: 1, actualCredits: 1 }]);
      expect((await s.listLedger(5))[0]).toMatchObject({ endpoint: "/v1/x", expectedCredits: 1, actualCredits: 1 });
    });
  });
}
