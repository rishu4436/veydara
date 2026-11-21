// Re-verifies every Base registry contract against (1) on-chain symbol()/decimals() via Base RPC
// and (2) CoinMarketCap's exact-contract listing via the keyless /v2/cryptocurrency/info?address=.
// Writes evidence to fixtures/chain/registry-verification.json. Sequential + delayed to respect
// the shared keyless rate pool. No API key used.
import { writeFileSync } from "node:fs";
import { createPublicClient, http, erc20Abi, getAddress } from "viem";
import { base } from "viem/chains";

const TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  AAPLc: "0xb200000000000000000000C2e324d24d7eEcd1fb",
  AMZNc: "0xb200000000000000000000d9192b6B456483C2E8",
  GOOGLc: "0xb2000000000000000000002D0BA3164cc74f58B7",
  METAc: "0xb2000000000000000000008bC8786B856E61707C",
  MSFTc: "0xB200000000000000000000Ab99cFa739E253872B",
  NVDAc: "0xb20000000000000000000078ee7ce2fE4908108C",
  TSLAc: "0xb2000000000000000000001e800a7f5189430cD0",
  SPCXc: "0xb2000000000000000000007b9fcbd005511aCBd5",
};
const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
const block = await client.getBlockNumber();
const out = { verifiedAt: new Date().toISOString(), baseBlock: block.toString(), results: {} };
for (const [sym, addr] of Object.entries(TOKENS)) {
  const a = getAddress(addr);
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: a, abi: erc20Abi, functionName: "symbol", blockNumber: block }),
    client.readContract({ address: a, abi: erc20Abi, functionName: "decimals", blockNumber: block }),
  ]);
  let cmc = null;
  for (let attempt = 0; attempt < 4 && !cmc; attempt++) {
    const r = await fetch(`https://pro-api.coinmarketcap.com/public-api/v2/cryptocurrency/info?address=${a}`, { headers: { Accept: "application/json" } });
    const j = await r.json();
    const code = String(j?.status?.error_code);
    if (code === "0") {
      const items = Object.values(j.data).flat();
      const exact = items.filter((it) => (it.contract_address ?? []).some((c) => c.contract_address.toLowerCase() === a.toLowerCase() && c.platform.name.toLowerCase() === "base"));
      cmc = exact.length === 1 ? { id: exact[0].id, name: exact[0].name, symbol: exact[0].symbol, slug: exact[0].slug } : { error: `exact matches: ${exact.length} of ${items.length}` };
    } else if (code === "1022" || r.status === 429) {
      console.error(`${sym}: keyless rate limit, waiting 65s`);
      await new Promise((res) => setTimeout(res, 65_000));
    } else {
      cmc = { error: `${code} ${j?.status?.error_message}` };
    }
  }
  out.results[sym] = { address: a, onchainSymbol: symbol, decimals: Number(decimals), symbolMatches: symbol === sym, cmc };
  console.log(sym, symbol, Number(decimals), JSON.stringify(cmc));
  await new Promise((res) => setTimeout(res, 3000));
}
writeFileSync("fixtures/chain/registry-verification.json", JSON.stringify(out, null, 1));
