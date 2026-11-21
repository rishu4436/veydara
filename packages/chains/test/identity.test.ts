import { describe, expect, it } from "vitest";
import { classifyToken, findVerified, isSolanaAddress, normalizeEvmAddress, sanitizeMeta } from "../src";

const NVDAC = "0xb20000000000000000000078ee7ce2fE4908108C";

describe("token identity + quarantine", () => {
  it("verifies NVDAc only by exact Base contract (case-insensitive hex)", () => {
    const v = classifyToken({ chain: "base", address: NVDAC.toUpperCase().replace("0X", "0x"), symbol: "NVDAc", name: "NVIDIA Corporation", decimals: 8 });
    expect(v.status).toBe("verified");
    expect(v.verified?.underlying?.symbol).toBe("NVDA");
    expect(v.verified?.issuer).toBe("Coinbase");
  });
  it("flags a different contract using the NVDAc ticker as impersonation", () => {
    const v = classifyToken({ chain: "base", address: "0x1111111111111111111111111111111111111111", symbol: "NVDAc", name: "NVIDIA", decimals: 8 });
    expect(v.status).toBe("impersonation");
  });
  it("does not treat NVDAX as NVDAc or as verified", () => {
    const v = classifyToken({ chain: "base", address: "0x2222222222222222222222222222222222222222", symbol: "NVDAX", name: "NVIDIA xStock", decimals: 18 });
    expect(v.status).toBe("unverified");
    expect(v.verified).toBeUndefined();
  });
  it("catches homoglyph USDC (Cyrillic С)", () => {
    const v = classifyToken({ chain: "base", address: "0x3333333333333333333333333333333333333333", symbol: "USDС", name: "USD Coin", decimals: 6 });
    expect(v.status).toBe("impersonation");
  });
  it("quarantines airdrop-lure metadata", () => {
    const v = classifyToken({ chain: "base", address: "0x4444444444444444444444444444444444444444", symbol: "VISIT", name: "Claim $5000 at evil-site.xyz", decimals: 18 });
    expect(v.status).toBe("suspected-spam");
    expect(v.reasons.join(" ")).toMatch(/URL/);
  });
  it("sanitizes control and bidi characters", () => {
    expect(sanitizeMeta("abc\u202Edef\u0000")).toBe("abcdef");
    expect(sanitizeMeta("x".repeat(100), 10)).toHaveLength(10);
  });
  it("validates addresses", () => {
    expect(() => normalizeEvmAddress("0x123")).toThrow();
    expect(normalizeEvmAddress(NVDAC.toLowerCase())).toBe(NVDAC);
    expect(isSolanaAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true);
    expect(isSolanaAddress("0xabc")).toBe(false);
    expect(findVerified("solana", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")?.symbol).toBe("USDC");
  });
});
