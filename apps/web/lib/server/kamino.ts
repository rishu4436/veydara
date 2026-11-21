import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readKaminoMarket, readKaminoPositions, type KaminoMarketSnapshot, type KaminoPositionsSnapshot } from "@veydara/kamino";
import { repoRoot, isFixtureMode } from "./dataset";
import { serverEnv } from "./env";

const g = globalThis as unknown as { __kamino?: { at: number; p: Promise<KaminoMarketSnapshot> } };
const fixture = <T,>(name: string) => JSON.parse(readFileSync(join(repoRoot(), "fixtures/chain", name), "utf8")) as T;

/** Live read via the official klend SDK (cached 60 s, single-flight). Fixture mode serves the recorded snapshot. */
export function kaminoMarket(): Promise<KaminoMarketSnapshot & { dataset: "live" | "fixture" }> {
  if (isFixtureMode()) return Promise.resolve({ ...fixture<KaminoMarketSnapshot>("kamino-xstocks-market.live.json"), dataset: "fixture" });
  const now = Date.now();
  if (!g.__kamino || now - g.__kamino.at > 60_000) {
    const p = readKaminoMarket({ rpcUrl: serverEnv().SOLANA_RPC_URL });
    g.__kamino = { at: now, p };
    p.catch(() => {
      if (g.__kamino?.p === p) g.__kamino = undefined;
    });
  }
  return g.__kamino.p.then((m) => ({ ...m, dataset: "live" as const }));
}

export async function kaminoPositions(owner: string): Promise<KaminoPositionsSnapshot & { dataset: "live" | "fixture" }> {
  if (isFixtureMode()) {
    const f = fixture<KaminoPositionsSnapshot>("kamino-xstocks-positions.live.json");
    return { ...f, owner, obligations: f.owner === owner ? f.obligations : [], dataset: "fixture" };
  }
  return { ...(await readKaminoPositions(owner, { rpcUrl: serverEnv().SOLANA_RPC_URL })), dataset: "live" };
}
