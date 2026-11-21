/**
 * Opt-in LIVE recorder for Aave V4 (Base): reads the MAG7 spoke market and the
 * positions of borrowers found in on-chain Borrow events, cross-checks VEYDARA's
 * bigint health-factor math against the Spoke's own getUserAccountData, and
 * writes labeled fixtures to fixtures/chain/. Read-only; no transactions.
 *   VEYDARA_LIVE_TESTS=1 VEYDARA_RECORD=1 pnpm vitest run tests/live/aave-v4-record.test.ts
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import { base } from "viem/chains";
import { makeBaseClient } from "@veydara/chains";
import { readAaveV4Market, readAaveV4Position, accountMath, positionLegs, AAVE_V4_BASE, AAVE_V4_SOURCE } from "@veydara/protocols";


const BORROW = parseAbiItem("event Borrow(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 drawnAmount)");

describe("live Aave V4 market + positions", () => {
  it("reads reserves and reproduces the Spoke health factor for real borrowers", async () => {
    const client = makeBaseClient(process.env.BASE_RPC_URL);
    const market = await readAaveV4Market(client);
    expect(market.reserves.length).toBeGreaterThan(0);
    const logsClient = createPublicClient({ chain: base, transport: http("https://base-rpc.publicnode.com") }) as PublicClient;
    const head = BigInt(market.blockNumber);
    const users = new Set<string>();
    for (let to = head, i = 0; i < 30 && users.size < 4; i++) {
      const from = to - 49_999n;
      const logs = await logsClient.getLogs({ address: AAVE_V4_BASE.mag7Spoke as `0x${string}`, event: BORROW, fromBlock: from, toBlock: to });
      logs.forEach((l) => users.add(l.args.user!));
      to = from - 1n;
    }
    const checks = [];
    for (const u of users) {
      const p = await readAaveV4Position(client, u, market);
      const { coll, debt } = positionLegs(p, market);
      const ours = accountMath(coll, debt);
      const theirs = BigInt(p.account.healthFactorWad);
      const relErr = theirs > 0n && ours.healthFactor < 2n ** 255n ? Math.abs(Number(ours.healthFactor - theirs)) / Number(theirs) : 0;
      checks.push({ user: u, contractHfWad: theirs.toString(), veydaraHfWad: ours.healthFactor.toString(), relErr });
      expect(ours.healthFactor).toBe(theirs); // exact WAD equality with the Spoke
    }
    if (process.env.VEYDARA_RECORD) {
      const meta = { kind: "live-recording", recordedAt: new Date().toISOString(), chainId: 8453, abiSource: AAVE_V4_SOURCE, note: "LIVE read-only snapshot from Base mainnet via public RPC. Point-in-time; not refreshed. Addresses are public on-chain borrowers found in Borrow events." };
      writeFileSync("fixtures/chain/aave-v4-market.live.json", JSON.stringify({ _fixture: meta, ...market }, null, 1));
      const positions = await Promise.all([...users].map((u) => readAaveV4Position(client, u, market)));
      writeFileSync("fixtures/chain/aave-v4-positions.live.json", JSON.stringify({ _fixture: meta, positions, hfCrossCheck: checks }, null, 1));
    }
    console.warn(JSON.stringify(checks));
  }, 120_000);
});
