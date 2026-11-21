import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, distanceToLiquidation, KAMINO_SOURCE, type KaminoMarketSnapshot, type KaminoPositionsSnapshot } from "../src/types";

const market = JSON.parse(readFileSync("fixtures/chain/kamino-xstocks-market.live.json", "utf8")) as KaminoMarketSnapshot;
const pos = JSON.parse(readFileSync("fixtures/chain/kamino-xstocks-positions.live.json", "utf8")) as KaminoPositionsSnapshot;

describe("Kamino read-only adapter (recorded live snapshot)", () => {
  it("is the verified xStocks market on the pinned program", () => {
    expect(market.market).toBe(KAMINO_SOURCE.markets.xStocks.address);
    expect(market.programId).toBe(KAMINO_SOURCE.programId);
    expect(market.name).toBe("xStocks Market");
  });

  it("lists tokenized equities with sane risk parameters", () => {
    const eq = market.reserves.filter((r) => r.kind === "tokenized-equity");
    expect(eq.length).toBeGreaterThanOrEqual(5);
    for (const r of eq) {
      expect(r.mint.startsWith("Xs")).toBe(true); // xStocks mints read from the reserve accounts
      expect(r.liquidationThresholdPct).toBeGreaterThanOrEqual(r.ltvPct);
      expect(Number(r.priceUsd)).toBeGreaterThan(0);
    }
    expect(market.reserves.find((r) => r.symbol === "USDC")?.borrowable).toBe(true);
  });

  it("distance to liquidation matches the recorded obligation", () => {
    for (const o of pos.obligations.filter((x) => x.ltv > 0)) {
      expect(o.distanceToLiquidationPct).toBeCloseTo(100 * (1 - o.ltv / o.liquidationLtv), 1);
    }
    expect(distanceToLiquidation(0, 0.5)).toBeNull();
    expect(distanceToLiquidation(0.25, 0.5)).toBe(0.5);
    expect(classify("NVDAx")).toBe("tokenized-equity");
    expect(classify("USDC")).toBe("stablecoin");
    expect(classify("cbBTC")).toBe("crypto");
  });
});
