import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { AAVE_V4_BASE } from "@veydara/protocols";
import { json, rateLimit } from "@/lib/server/http";
import { serverEnv } from "@/lib/server/env";
import { fixtureBorrowers, isFixtureMode } from "@/lib/server/dataset";

export const dynamic = "force-dynamic";
const BORROW = parseAbiItem("event Borrow(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 drawnAmount)");
const g = globalThis as unknown as { __borrowers?: { at: number; data: unknown } };

/**
 * Recent borrowers on the MAG7 spoke, from on-chain Borrow events (public data),
 * so the Positions view can be demonstrated on real positions without a wallet.
 * eth_getLogs uses BASE_LOGS_RPC_URL, else BASE_RPC_URL, else the public
 * base-rpc.publicnode.com endpoint (mainnet.base.org rate-limits getLogs).
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "aave-borrowers", 6);
  if (limited) return limited;
  if (isFixtureMode()) return json({ status: "ok", source: "fixture", borrowers: fixtureBorrowers().map((user) => ({ user, lastBorrowBlock: "fixture", txHash: "" })) });
  if (g.__borrowers && Date.now() - g.__borrowers.at < 10 * 60_000) return json(g.__borrowers.data);
  const env = serverEnv();
  const rpc = process.env.BASE_LOGS_RPC_URL || env.BASE_RPC_URL || "https://base-rpc.publicnode.com";
  try {
    const c = createPublicClient({ chain: base, transport: http(rpc, { timeout: 12_000 }) });
    const head = await c.getBlockNumber();
    const seen = new Map<string, { user: string; lastBorrowBlock: string; txHash: string }>();
    for (let to = head, i = 0; i < 12 && seen.size < 8; i++) {
      const from = to - 49_999n;
      const logs = await c.getLogs({ address: AAVE_V4_BASE.mag7Spoke as `0x${string}`, event: BORROW, fromBlock: from, toBlock: to });
      for (const l of logs.reverse()) if (!seen.has(l.args.user!)) seen.set(l.args.user!, { user: l.args.user!, lastBorrowBlock: String(l.blockNumber), txHash: l.transactionHash! });
      to = from - 1n;
    }
    const data = { status: "ok", headBlock: head.toString(), source: { event: "Spoke.Borrow", contract: AAVE_V4_BASE.mag7Spoke, rpc: rpc.startsWith("https://base-rpc.publicnode.com") ? "base-rpc.publicnode.com (public)" : "configured RPC" }, borrowers: [...seen.values()] };
    g.__borrowers = { at: Date.now(), data };
    return json(data);
  } catch (e) {
    return json({ status: "unavailable", code: "RPC_UNAVAILABLE", reason: (e as Error).message.slice(0, 160) });
  }
}
