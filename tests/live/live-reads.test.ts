/**
 * Opt-in LIVE read tests (no keys, no transactions): `pnpm test:live`.
 * They prove the real read paths work today; they are excluded from CI because
 * public endpoints are rate-limited.
 */
import { describe, expect, it } from "vitest";
import { makeBaseClient, scanBaseWallet } from "@veydara/chains";
import { readAaveFeed, AAVE_V4_BASE } from "@veydara/protocols";
import { CmcGateway, pickQuote } from "@veydara/cmc";

describe("live Base + Aave reads", () => {
  it("reads the Aave V4 NVDAc Chainlink feed", async () => {
    const r = await readAaveFeed(makeBaseClient(), "NVDAc");
    expect(r.description).toMatch(/NVDA/);
    expect(Number(r.answer)).toBeGreaterThan(0);
    expect(r.provenance.isSimulated).toBe(false);
  }, 30_000);
  it("scans the Aave Equities Hub contract's real token balances", async () => {
    const r = await scanBaseWallet(AAVE_V4_BASE.equitiesHub);
    expect(r.holdings.some((h) => h.identity.display.symbol === "NVDAc")).toBe(true);
  }, 30_000);
});

describe("live CMC keyless", () => {
  it("fetches a real v3 quote for NVDAc (id 42461)", async () => {
    const g = new CmcGateway();
    const r = await g.request("cryptoQuotesLatestV3", { id: "42461" }, { feature: "live-test" });
    if (!r.ok && r.error.code === "CMC_RATE_LIMITED") return; // shared keyless pool; not a code failure
    expect(r.ok).toBe(true);
    if (r.ok) expect(pickQuote(r.data.data[0]!, "USD")?.price).toBeGreaterThan(0);
  }, 30_000);
});
