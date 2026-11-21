import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { AAVE_V4_BASE, AAVE_V4_BASE_FEEDS, aaveListingFor } from "../src";
import { BASE_TOKENS } from "@veydara/chains";

describe("Aave V4 Base registry", () => {
  it("all addresses are valid checksummed EVM addresses", () => {
    for (const a of [AAVE_V4_BASE.equitiesHub, AAVE_V4_BASE.mag7Spoke, ...Object.values(AAVE_V4_BASE.positionManagers)]) expect(getAddress(a)).toBe(a);
    for (const v of Object.values(AAVE_V4_BASE_FEEDS)) {
      expect(getAddress(v.asset)).toBeTruthy();
      expect(getAddress(v.feed)).toBe(v.feed);
    }
  });
  it("every listed equity asset matches the verified token registry exactly", () => {
    for (const [sym, v] of Object.entries(AAVE_V4_BASE_FEEDS)) {
      const t = BASE_TOKENS.find((x) => x.address === v.asset.toLowerCase());
      expect(t?.symbol, sym).toBe(sym);
    }
  });
  it("listing lookup is by exact symbol or address, NVDAX is not listed", () => {
    expect(aaveListingFor("NVDAc")?.feed).toBe("0x04689a41629776563E6822F76f2e57D148d28513");
    expect(aaveListingFor("0xb20000000000000000000078ee7ce2fe4908108c")?.symbol).toBe("NVDAc");
    expect(aaveListingFor("NVDAX")).toBeNull();
  });
});
