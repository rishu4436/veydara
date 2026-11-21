import { describe, expect, it, vi } from "vitest";
import { CmcGateway } from "../src";
import { fixture } from "./fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("CmcGateway", () => {
  it("returns CMC_KEY_MISSING for key-only endpoints without any network call", async () => {
    const f = vi.fn();
    const g = new CmcGateway({ fetchImpl: f as unknown as typeof fetch });
    const r = await g.request("rwaQuotesLatest", { symbol: "NVDA" }, { feature: "test" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("CMC_KEY_MISSING");
      expect(r.provenance.freshness).toBe("unavailable");
    }
    expect(f).not.toHaveBeenCalled();
    expect(g.ledger.summary().blockedCalls).toBe(1);
  });

  it("uses the keyless base for keyless endpoints and never sends a key header", async () => {
    const f = vi.fn(async (_u: URL | RequestInfo, _init?: RequestInit) => jsonResponse(fixture("crypto-quotes-latest-v3.live.json")));
    const g = new CmcGateway({ fetchImpl: f as unknown as typeof fetch });
    const r = await g.request("cryptoQuotesLatestV3", { id: "1027,3408,42461" }, { feature: "test" });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toContain("/public-api/v3/cryptocurrency/quotes/latest");
    expect((init?.headers as Record<string, string>)["X-CMC_PRO_API_KEY"]).toBeUndefined();
    if (r.ok) expect(r.provenance.source).toBe("cmc-keyless");
  });

  it("uses pro base + header when a key is configured", async () => {
    const f = vi.fn(async () => jsonResponse(fixture("rwa-quotes-latest.doc.json")));
    const g = new CmcGateway({ apiKey: "test-key", fetchImpl: f as unknown as typeof fetch });
    const r = await g.request("rwaQuotesLatest", { symbol: "NVDA" }, { feature: "test" });
    expect(r.ok).toBe(true);
    const [url, init] = (f.mock.calls[0] as unknown as [URL, RequestInit]);
    expect(String(url)).toBe("https://pro-api.coinmarketcap.com/v5/real-world-assets/quotes/latest?symbol=NVDA");
    expect((init.headers as Record<string, string>)["X-CMC_PRO_API_KEY"]).toBe("test-key");
  });

  it("caches within TTL and single-flights concurrent identical requests", async () => {
    let t = 1_000_000;
    const f = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return jsonResponse(fixture("crypto-quotes-latest-v3.live.json"));
    });
    const g = new CmcGateway({ fetchImpl: f as unknown as typeof fetch, now: () => t });
    const [a, b] = await Promise.all([
      g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "a" }),
      g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "b" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const c = await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "c" });
    expect(c.ok && c.cache).toBe("hit");
    expect(f).toHaveBeenCalledTimes(1);
    t += 61_000;
    await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "d" });
    expect(f).toHaveBeenCalledTimes(2);
    const s = g.ledger.summary();
    expect(s.dedupedCalls).toBe(1);
    expect(s.cacheHits).toBe(1);
    expect(s.actualCredits).toBe(2);
  });

  it("negative-caches plan 403s instead of hammering", async () => {
    const f = vi.fn(async () => jsonResponse({ status: { timestamp: "x", error_code: 1006, error_message: "Your API Key subscription plan doesn't support this endpoint.", credit_count: 0 } }, 403));
    const g = new CmcGateway({ apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    const r1 = await g.request("rwaQuotesLatest", { symbol: "NVDA" }, { feature: "t" });
    const r2 = await g.request("rwaQuotesLatest", { symbol: "NVDA" }, { feature: "t" });
    expect(!r1.ok && r1.error.code).toBe("CMC_PLAN_FORBIDDEN");
    expect(!r2.ok && r2.error.code).toBe("CMC_PLAN_FORBIDDEN");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("maps keyless 1022 to rate-limited, backs off, and serves flagged stale data", async () => {
    let t = 0;
    const responses = [jsonResponse(fixture("crypto-quotes-latest-v3.live.json")), jsonResponse(fixture("error-keyless-limit.live.json"), 429)];
    const f = vi.fn(async () => responses.shift()!);
    const g = new CmcGateway({ fetchImpl: f as unknown as typeof fetch, now: () => t });
    await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "t" });
    t += 120_000; // past ttl, within stale window
    const r = await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("CMC_RATE_LIMITED");
      expect(r.stale).toBeDefined();
    }
    // during backoff: no new network call, stale served as explicit "stale"
    const r3 = await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "t" });
    expect(r3.ok && r3.provenance.freshness).toBe("stale");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("reports schema mismatch rather than rendering malformed data", async () => {
    const f = vi.fn(async () => jsonResponse({ data: [{ nope: true }], status: { timestamp: "x", error_code: 0, credit_count: 1 } }));
    const g = new CmcGateway({ fetchImpl: f as unknown as typeof fetch });
    const r = await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "t" });
    expect(!r.ok && r.error.code).toBe("CMC_SCHEMA_MISMATCH");
  });

  it("opens the circuit after repeated network failures", async () => {
    const f = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const g = new CmcGateway({ fetchImpl: f as unknown as typeof fetch, circuitThreshold: 2 });
    await g.request("cryptoQuotesLatestV3", { id: "1" }, { feature: "t" });
    await g.request("cryptoQuotesLatestV3", { id: "2" }, { feature: "t" });
    const r = await g.request("cryptoQuotesLatestV3", { id: "3" }, { feature: "t" });
    expect(!r.ok && r.error.code).toBe("CIRCUIT_OPEN");
    expect(f).toHaveBeenCalledTimes(2);
  });
});
