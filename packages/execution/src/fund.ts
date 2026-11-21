/**
 * Fork-only funding. Moves real token balances to an anvil test account INSIDE the
 * fork by impersonating an existing holder discovered from recent Transfer logs.
 * Protocol contracts (hub, spokes, treasury) are never used as donors so their
 * accounting stays intact. Refuses to run unless `inspectFork` passes.
 */
import { encodeFunctionData, getAddress, parseAbiItem, toHex, type Address, type Hex, type PublicClient } from "viem";
import { AAVE_V4_BASE, ERC20_ABI } from "@veydara/protocols";
import { inspectFork, rpc } from "./fork";
import { waitReceipt } from "./simulate";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export interface FundingRecord {
  label: "FORK";
  token: Address;
  to: Address;
  amount: string;
  donor: Address;
  donorKind: "eoa" | "contract";
  method: "anvil_impersonateAccount + transfer";
  txHash: Hex;
  blockNumber: string;
  scannedBlocks: string;
}

export async function fundFromHolder(rpcUrl: string, client: PublicClient, token: Address, to: Address, amount: bigint): Promise<FundingRecord> {
  await inspectFork(rpcUrl);
  const exclude = new Set([AAVE_V4_BASE.equitiesHub, AAVE_V4_BASE.mag7Spoke, AAVE_V4_BASE.treasurySpoke, AAVE_V4_BASE.equitiesUsdcTokenizationSpoke, "0x0000000000000000000000000000000000000000", to].map((a) => getAddress(a)));
  const head = await client.getBlockNumber();
  let donor: Address | null = null;
  let donorKind: FundingRecord["donorKind"] = "eoa";
  let scanned = "";
  for (let k = 0n; k < 6n && !donor; k++) {
    const toBlock = head - k * 9_000n;
    const fromBlock = toBlock - 8_999n;
    scanned = `${fromBlock}–${head}`;
    const logs = await client.getLogs({ address: token, event: TRANSFER, fromBlock, toBlock });
    const cands = [...new Set(logs.map((l) => l.args.to).filter((a): a is Address => Boolean(a)).map((a) => getAddress(a)))].filter((a) => !exclude.has(a));
    const bals = await client.multicall({ allowFailure: true, contracts: cands.map((a) => ({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [a] }) as const) });
    const rich = cands.map((a, i) => ({ a, b: bals[i]!.status === "success" ? (bals[i]!.result as bigint) : 0n })).filter((x) => x.b >= amount).sort((x, y) => (y.b > x.b ? 1 : -1));
    for (const x of rich) {
      const code = await client.getCode({ address: x.a });
      const kind = !code || code === "0x" ? "eoa" : code.startsWith("0xef0100") ? "eoa" : "contract";
      if (kind === "eoa") { donor = x.a; donorKind = "eoa"; break; }
      if (!donor) { donor = x.a; donorKind = "contract"; }
    }
  }
  if (!donor) throw new Error(`No holder with ≥ ${amount} of ${token} found in recent Transfer logs (${scanned}).`);
  await rpc(client, "anvil_impersonateAccount", [donor]);
  try {
    await rpc(client, "anvil_setBalance", [donor, toHex(10n ** 18n)]);
    const hash = (await rpc(client, "eth_sendTransaction", [{ from: donor, to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, amount] }) }])) as Hex;
    const rc = await waitReceipt(client, hash);
    if (rc.status !== "success") throw new Error(`fork funding transfer reverted (${hash})`);
    return { label: "FORK", token: getAddress(token), to: getAddress(to), amount: amount.toString(), donor, donorKind, method: "anvil_impersonateAccount + transfer", txHash: hash, blockNumber: rc.blockNumber.toString(), scannedBlocks: scanned };
  } finally {
    await rpc(client, "anvil_stopImpersonatingAccount", [donor]);
  }
}
