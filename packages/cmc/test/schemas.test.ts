import { describe, expect, it } from "vitest";
import * as S from "../src/schemas";
import { pickQuote, resolveContract, resolveSymbolStrict, splitRwaPrices } from "../src";
import { fixture } from "./fixtures";

describe("CMC schema contracts (fixtures)", () => {
  it("parses recorded live keyless v3 quotes and reads array-shaped quote", () => {
    const d = S.QuotesLatestV3Schema.parse(fixture("crypto-quotes-latest-v3.live.json"));
    const nvdac = d.data.find((x) => x.id === 42461)!;
    expect(nvdac.symbol).toBe("NVDAc");
    expect(pickQuote(nvdac, "USD")?.price).toBeGreaterThan(0);
    expect(pickQuote(nvdac, "EUR")).toBeNull();
  });
  it("parses recorded live v2 info and resolves NVDAc by exact Base contract", () => {
    const d = S.InfoV2Schema.parse(fixture("crypto-info-v2-nvdac.live.json"));
    const r = resolveContract(d.data, "base", "0xB20000000000000000000078EE7CE2FE4908108C");
    expect(r).toMatchObject({ status: "exact", cmcId: 42461, symbol: "NVDAc" });
    // Same address on the wrong chain must not resolve.
    expect(resolveContract(d.data, "ethereum", "0xb20000000000000000000078ee7ce2fE4908108C").status).toBe("mismatch");
  });
  it("parses recorded live DEX token detail", () => {
    const d = S.DexTokenSchema.parse(fixture("dex-token-nvdac.live.json"));
    expect(d.data.sym).toBe("NVDAc");
    expect(d.data.dec).toBe(8);
  });
  it("parses documented RWA payloads", () => {
    expect(S.RwaMapSchema.parse(fixture("rwa-map.doc.json")).data.rwa_assets[1]!.symbol).toBe("NVDA");
    expect(S.RwaInfoSchema.parse(fixture("rwa-info.doc.json")).data.rwa_assets[0]!.cik).toBe("0001045810");
    expect(S.RwaIssuersListSchema.parse(fixture("rwa-issuers-list.doc.json")).data.issuers).toHaveLength(2);
    expect(S.RwaIssuerSchema.parse(fixture("rwa-issuer.doc.json")).data.tokens[0]!.rwa_id).toBe(9);
    expect(S.OhlcvHistoricalV5Schema.parse(fixture("ohlcv-v5.doc.json")).data[0]![6]).toBe("2026-09-01T00:00:00.000Z");
  });
  it("keeps aggregate and issuer-token prices separate (NVDAX ≠ NVDAon ≠ aggregate)", () => {
    const d = S.RwaQuotesLatestSchema.parse(fixture("rwa-quotes-latest.doc.json"));
    const split = splitRwaPrices(d.data.rwa_assets[0]!);
    expect(split.aggregate.label).toMatch(/aggregate/);
    expect(split.issuerTokens.map((t) => t.symbol)).toEqual(["NVDAX", "NVDAon"]);
    expect(split.issuerTokens[0]!.issuerName).toBe("Backed Assets");
  });
  it("never resolves an ambiguous ticker to the first hit", () => {
    const items = [{ symbol: "NVDA", id: 1 }, { symbol: "nvda", id: 2 }];
    expect(resolveSymbolStrict(items, "NVDA").status).toBe("ambiguous");
    expect(resolveSymbolStrict(items, "AAPL").status).toBe("none");
  });
});
