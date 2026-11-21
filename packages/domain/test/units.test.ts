import { describe, expect, it } from "vitest";
import { classifyFreshness, formatUnitsSafe, mulAmountByPrice, normalizeDecimal, parseUnitsSafe } from "../src";

describe("unit math", () => {
  it("round-trips 8-decimal tokenized equity amounts without float error", () => {
    const a = parseUnitsSafe("0.12345678", 8);
    expect(a).toBe(12345678n);
    expect(formatUnitsSafe(a, 8)).toBe("0.12345678");
  });
  it("truncates display toward zero", () => {
    expect(formatUnitsSafe(1999999n, 6, 2)).toBe("1.99");
  });
  it("rejects excess precision instead of silently rounding", () => {
    expect(() => parseUnitsSafe("1.0000001", 6)).toThrow();
  });
  it("values amount*price rounding down", () => {
    // 1.5 NVDAc (8 dp) * 128.415343 = 192.6230145 -> 192.623014 (6dp, floor)
    expect(mulAmountByPrice(150000000n, 8, "128.415343")).toBe(192623014n);
    // 0.1 + 0.2 class bug check: 0.3 USDC at $1
    expect(mulAmountByPrice(300000n, 6, "1")).toBe(300000n);
  });
  it("normalizes scientific notation", () => {
    expect(normalizeDecimal(1e-7)).toBe("0.0000001");
    expect(normalizeDecimal("2.5e3")).toBe("2500");
  });
  it("classifies freshness", () => {
    expect(classifyFreshness(null, 0, 1, 2)).toBe("unavailable");
    expect(classifyFreshness(100, 100, 10, 20)).toBe("live");
    expect(classifyFreshness(100, 115, 10, 20)).toBe("cached");
    expect(classifyFreshness(100, 200, 10, 20)).toBe("stale");
  });
});
