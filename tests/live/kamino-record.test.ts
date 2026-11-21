/** Opt-in live read (VEYDARA_LIVE_TESTS=1). VEYDARA_RECORD=1 writes the fixtures used by offline tests and fixture mode. */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readKaminoMarket, readKaminoPositions, KAMINO_SOURCE } from "@veydara/kamino";

// A public borrower on the xStocks market, found via the SDK's obligations-by-deposited-reserve (NVDAx) query.
const SAMPLE_OWNER = "Fa7LNzj3SCV364hya9dx9evL29pC1awx24iHeCEwX6vU";

describe("Kamino xStocks market (live, Solana mainnet)", () => {
  it("reads the verified market and a borrower's obligations", async () => {
    const m = await readKaminoMarket({ rpcUrl: process.env.SOLANA_RPC_URL });
    expect(m.market).toBe(KAMINO_SOURCE.markets.xStocks.address);
    expect(m.reserves.length).toBeGreaterThan(5);
    await new Promise((r) => setTimeout(r, 3000)); // public RPC courtesy
    const p = await readKaminoPositions(SAMPLE_OWNER, { rpcUrl: process.env.SOLANA_RPC_URL });
    expect(p.obligations.length).toBeGreaterThan(0);
    if (process.env.VEYDARA_RECORD === "1") {
      writeFileSync("fixtures/chain/kamino-xstocks-market.live.json", JSON.stringify({ ...m, _recorded: "live read via @kamino-finance/klend-sdk; not edited" }, null, 2));
      writeFileSync("fixtures/chain/kamino-xstocks-positions.live.json", JSON.stringify({ ...p, _recorded: "live read via @kamino-finance/klend-sdk; not edited" }, null, 2));
    }
  }, 120_000);
});
