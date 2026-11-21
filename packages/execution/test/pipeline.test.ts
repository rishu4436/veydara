import { describe, expect, it } from "vitest";
import { encodeErrorResult, getAddress, decodeFunctionData } from "viem";
import { readFileSync } from "node:fs";
import { ALL_ERRORS_ABI, ERC20_ABI, SPOKE_WRITE_ABI, POLICY, type AaveMarket } from "@veydara/protocols";
import { assertLoopback, buildRoute, decodeRevertData, routeHash, validateIntent, verifyRoute, NotAForkError, type FreshState, type Intent } from "../src";

const market = JSON.parse(readFileSync("fixtures/chain/aave-v4-market.live.json", "utf8")) as AaveMarket;
const ACCT = getAddress("0x00000000000000000000000000000000000a11ce");

function state(over: Partial<{ wallet: Record<number, string>; allowance: Record<number, string>; supplied: Record<number, string>; debtRay: Record<number, string>; enabled: number[] }> = {}): FreshState {
  return {
    blockNumber: market.blockNumber, blockTimestamp: 0, account: ACCT, market, ethBalance: "0",
    wallet: Object.fromEntries(market.reserves.map((r) => [r.reserveId, over.wallet?.[r.reserveId] ?? "0"])),
    allowance: Object.fromEntries(market.reserves.map((r) => [r.reserveId, over.allowance?.[r.reserveId] ?? "0"])),
    position: {
      user: ACCT, blockNumber: market.blockNumber, provenance: market.provenance,
      account: { riskPremiumBps: "0", avgCollateralFactorWad: "0", healthFactorWad: (2n ** 256n - 1n).toString(), totalCollateralValue: "0", totalDebtValueRay: "0", activeCollateralCount: "0", borrowCount: "0" },
      reserves: market.reserves.map((r) => ({ reserveId: r.reserveId, symbol: r.symbol, collateralEnabled: over.enabled?.includes(r.reserveId) ?? false, borrowing: false, supplied: over.supplied?.[r.reserveId] ?? "0", debt: "0", debtRay: over.debtRay?.[r.reserveId] ?? "0" })),
    },
  };
}
const NV = market.reserves.findIndex((r) => r.symbol === "NVDAc");
const US = market.reserves.findIndex((r) => r.symbol === "USDC");
const intent = (actions: Intent["actions"]): Intent => ({ account: ACCT, actions, source: "manual", signer: "anvil-test-account" });

describe("fork guard", () => {
  it("accepts loopback and refuses remote RPCs", () => {
    expect(assertLoopback("http://127.0.0.1:8545").hostname).toBe("127.0.0.1");
    expect(() => assertLoopback("https://mainnet.base.org")).toThrow(NotAForkError);
    expect(() => assertLoopback("http://10.0.0.5:8545")).toThrow(NotAForkError);
  });
});

describe("validate", () => {
  it("only anvil test accounts, positive integer amounts, listed reserves", () => {
    expect(validateIntent({ account: ACCT, actions: [{ kind: "supply", reserveId: NV, amount: "1" }] }, { testAccounts: [ACCT], reserveCount: 9 }).ok).toBe(true);
    const notTest = validateIntent({ account: "0x5771e9CD1F225eBdE88D4815587C38899604AC2a", actions: [{ kind: "supply", reserveId: NV, amount: "1" }] }, { testAccounts: [ACCT], reserveCount: 9 });
    expect(notTest.ok).toBe(false);
    expect(notTest.errors[0]).toMatch(/not one of this fork's anvil-generated test accounts/);
    // Wallet signer: only SIWE-proven wallets, never "any address".
    const real = "0x5771e9CD1F225eBdE88D4815587C38899604AC2a";
    expect(validateIntent({ account: real, signer: "wallet", actions: [{ kind: "supply", reserveId: NV, amount: "1" }] }, { testAccounts: [ACCT], ownedWallets: [], reserveCount: 9 }).errors[0]).toMatch(/Sign-In with Ethereum/);
    expect(validateIntent({ account: real, signer: "wallet", actions: [{ kind: "supply", reserveId: NV, amount: "1" }] }, { testAccounts: [ACCT], ownedWallets: [real.toLowerCase()], reserveCount: 9 }).ok).toBe(true);
    expect(validateIntent({ account: ACCT, signer: "wallet", actions: [{ kind: "supply", reserveId: NV, amount: "1" }] }, { testAccounts: [ACCT], ownedWallets: [], reserveCount: 9 }).ok).toBe(false);
    expect(validateIntent({ account: ACCT, actions: [{ kind: "borrow", reserveId: US, amount: "1.5" }] }, { testAccounts: [ACCT], reserveCount: 9 }).ok).toBe(false);
    expect(validateIntent({ account: ACCT, actions: [{ kind: "borrow", reserveId: US, amount: "0" }] }, { testAccounts: [ACCT], reserveCount: 9 }).ok).toBe(false);
    expect(validateIntent({ account: ACCT, actions: [{ kind: "borrow", reserveId: 42, amount: "5" }] }, { testAccounts: [ACCT], reserveCount: 9 }).ok).toBe(false);
  });
});

describe("typed route", () => {
  it("inserts exact-amount approvals only when the allowance is short, and encodes the pinned ABI", () => {
    const s = state({ wallet: { [NV]: "100000000" }, allowance: { [US]: "50000000" } });
    const r = buildRoute(intent([{ kind: "supply", reserveId: NV, amount: "100000000" }, { kind: "enableCollateral", reserveId: NV }, { kind: "borrow", reserveId: US, amount: "30000000" }, { kind: "repay", reserveId: US, amount: "10000000" }]), s);
    expect(r.map((x) => x.functionName)).toEqual(["approve", "supply", "setUsingAsCollateral", "borrow", "repay"]);
    const ap = decodeFunctionData({ abi: ERC20_ABI, data: r[0]!.data });
    expect(ap.args).toEqual([market.spoke, 100000000n]);
    const sup = decodeFunctionData({ abi: SPOKE_WRITE_ABI, data: r[1]!.data });
    expect(sup.functionName).toBe("supply");
    expect(sup.args).toEqual([BigInt(NV), 100000000n, ACCT]);
    expect(r[1]!.to).toBe(market.spoke);
    expect(r[0]!.to).toBe(market.reserves[NV]!.underlying);
  });
  it("route hash binds chain, account and calldata", () => {
    const s = state({ wallet: { [NV]: "1" } });
    const r = buildRoute(intent([{ kind: "supply", reserveId: NV, amount: "1" }]), s);
    expect(routeHash(31337, ACCT, r)).toBe(routeHash(31337, ACCT.toLowerCase(), r));
    expect(routeHash(31337, ACCT, r)).not.toBe(routeHash(8453, ACCT, r));
  });
});

describe("independent route verifier", () => {
  const px = BigInt(market.reserves[NV]!.price);
  const cf = BigInt(market.reserves[NV]!.collateralFactorBps);
  it("accepts a safe lifecycle and predicts HF by hand", () => {
    const s = state({ wallet: { [NV]: "100000000" } });
    const v = verifyRoute(intent([{ kind: "supply", reserveId: NV, amount: "100000000" }, { kind: "enableCollateral", reserveId: NV }, { kind: "borrow", reserveId: US, amount: "30000000" }]), s, POLICY.minHealthFactorWad);
    expect(v.accepted).toBe(true);
    // HF = (1 NVDAc × px × CF) / (30 USDC × usdcPx), all 8-dec oracle prices
    const usdcPx = BigInt(market.reserves[US]!.price);
    const expected = (1n * px * cf * 10n ** 18n) / (10_000n * 30n * usdcPx);
    expect(BigInt(v.predicted.healthFactorWad!)).toBe(expected);
  });
  it("rejects over-borrow on protocol HF and policy floor; rejects supply above wallet", () => {
    const s = state({ wallet: { [NV]: "100000000" } });
    const v = verifyRoute(intent([{ kind: "supply", reserveId: NV, amount: "100000000" }, { kind: "enableCollateral", reserveId: NV }, { kind: "borrow", reserveId: US, amount: "1000000000" }]), s, POLICY.minHealthFactorWad);
    expect(v.accepted).toBe(false);
    expect(v.checks.filter((c) => !c.pass).map((c) => c.name).join()).toMatch(/protocol/);
    const w = verifyRoute(intent([{ kind: "supply", reserveId: NV, amount: "200000000" }]), s, POLICY.minHealthFactorWad);
    expect(w.checks.find((c) => c.name.includes("wallet"))!.pass).toBe(false);
  });
  it("policy-only rejection: protocol allows, VEYDARA floor does not", () => {
    const s = state({ supplied: { [NV]: "100000000" }, enabled: [NV] });
    const usdcPx = BigInt(market.reserves[US]!.price);
    // borrow sized for HF ≈ 1.10
    const amt = (px * cf * 10n ** 6n) / (10_000n * usdcPx * 110n / 100n);
    const v = verifyRoute(intent([{ kind: "borrow", reserveId: US, amount: amt.toString() }]), s, POLICY.minHealthFactorWad);
    const failed = v.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatch(/policy floor/);
  });
  it("repay caps at debt; withdraw blocked if it would break HF", () => {
    const s = state({ supplied: { [NV]: "100000000" }, enabled: [NV], debtRay: { [US]: (30_000000n * 10n ** 27n).toString() }, wallet: { [US]: "100000000" } });
    const r = verifyRoute(intent([{ kind: "repay", reserveId: US, amount: "50000000" }]), s, POLICY.minHealthFactorWad);
    expect(r.accepted).toBe(true);
    expect(r.predicted.reserves[US]!.debtRay).toBe("0");
    expect(r.predicted.reserves[US]!.wallet).toBe("70000000");
    const w = verifyRoute(intent([{ kind: "withdraw", reserveId: NV, amount: "95000000" }]), s, POLICY.minHealthFactorWad);
    expect(w.accepted).toBe(false);
  });
});

describe("revert decoding", () => {
  it("decodes pinned Spoke/Hub errors and shows unknown selectors raw", () => {
    const hf = encodeErrorResult({ abi: ALL_ERRORS_ABI, errorName: "HealthFactorBelowThreshold" });
    expect(decodeRevertData(hf).name).toBe("HealthFactorBelowThreshold");
    const cap = encodeErrorResult({ abi: ALL_ERRORS_ABI, errorName: "DrawCapExceeded", args: [21000000n] });
    expect(decodeRevertData(cap).message).toBe("DrawCapExceeded(21000000)");
    expect(decodeRevertData("0xdeadbeef").name).toBe("Unknown custom error");
    expect(decodeRevertData(null).name).toMatch(/no revert data/);
  });
});
