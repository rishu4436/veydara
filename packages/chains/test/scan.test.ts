import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { BASE_TOKENS, scanBaseWallet, scanSolanaWallet } from "../src";

/** FIXTURE chain client: deterministic responses, clearly not live data. */
function fakeClient(balances: Record<string, bigint>, extras: Record<string, [bigint, string, string, number]> = {}): PublicClient {
  return {
    getBlockNumber: async () => 123n,
    getBalance: async () => balances.native ?? 0n,
    multicall: async ({ contracts }: { contracts: { address: string; functionName: string }[] }) =>
      contracts.map((c) => {
        const a = c.address.toLowerCase();
        if (c.functionName === "balanceOf") {
          if (a in extras) return { status: "success", result: extras[a]![0] };
          return { status: "success", result: balances[a] ?? 0n };
        }
        const e = extras[a];
        if (!e) return { status: "failure", error: new Error("revert") };
        if (c.functionName === "symbol") return { status: "success", result: e[1] };
        if (c.functionName === "name") return { status: "success", result: e[2] };
        return { status: "success", result: e[3] };
      }),
  } as unknown as PublicClient;
}

const OWNER = "0x000000000000000000000000000000000000dEaD";
const USDC = BASE_TOKENS.find((t) => t.symbol === "USDC")!.address;
const NVDAC = BASE_TOKENS.find((t) => t.symbol === "NVDAc")!.address;

describe("Base scan (fixture client)", () => {
  it("empty wallet yields no holdings and no invented data", async () => {
    const r = await scanBaseWallet(OWNER, { client: fakeClient({}) });
    expect(r.holdings).toHaveLength(0);
    expect(r.blockNumber).toBe("123");
    expect(r.coverage.complete).toBe(false);
  });
  it("stablecoin-only wallet returns just USDC with block-pinned provenance", async () => {
    const r = await scanBaseWallet(OWNER, { client: fakeClient({ [USDC]: 2_500_000n }) });
    expect(r.holdings.map((h) => h.identity.display.symbol)).toEqual(["USDC"]);
    expect(r.holdings[0]!.formatted).toBe("2.5");
    expect(r.holdings[0]!.provenance.blockNumber).toBe("123");
    expect(r.holdings[0]!.provenance.isSimulated).toBe(false);
  });
  it("NVDAc holder resolves exact issuer token with 8 decimals", async () => {
    const r = await scanBaseWallet(OWNER, { client: fakeClient({ [NVDAC]: 150_000_000n }) });
    const h = r.holdings[0]!;
    expect(h.identity.status).toBe("verified");
    expect(h.identity.verified?.underlying?.symbol).toBe("NVDA");
    expect(h.formatted).toBe("1.5");
  });
  it("user-added spam contract is quarantined", async () => {
    const spam = "0x5555555555555555555555555555555555555555";
    const r = await scanBaseWallet(OWNER, { client: fakeClient({}, { [spam]: [10n ** 21n, "USDC", "USDC claim at usdc-bonus.com", 18] }), extraTokens: [spam] });
    expect(r.holdings[0]!.identity.status).toBe("impersonation");
  });
});

describe("Solana scan (fixture RPC)", () => {
  it("aggregates token accounts by mint and quarantines unknown mints", async () => {
    const rpc = async (method: string, params: unknown[]) => {
      if (method === "getBalance") return { context: { slot: 999 }, value: 0 };
      const program = (params[1] as { programId: string }).programId;
      if (program.startsWith("Tokenkeg"))
        return {
          value: [
            { account: { data: { parsed: { info: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenAmount: { amount: "1000000", decimals: 6 } } } } } },
            { account: { data: { parsed: { info: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenAmount: { amount: "500000", decimals: 6 } } } } } },
            { account: { data: { parsed: { info: { mint: "So1aNaRandoMMint1111111111111111111111111111", tokenAmount: { amount: "42", decimals: 0 } } } } } },
          ],
        };
      return { value: [] };
    };
    const r = await scanSolanaWallet("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", { rpc });
    expect(r.slot).toBe("999");
    const usdc = r.holdings.find((h) => h.identity.display.symbol === "USDC")!;
    expect(usdc.formatted).toBe("1.5");
    expect(r.holdings.find((h) => h.address.startsWith("So1a"))!.identity.status).toBe("unverified");
  });
});
