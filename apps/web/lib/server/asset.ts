import { classifyToken, findVerified, makeBaseClient, normalizeEvmAddress, isSolanaAddress } from "@veydara/chains";
import { VeydaraError, usEquitySession, normalizeDecimal, type Provenance, type TokenRepresentation } from "@veydara/domain";
import { pickQuote, resolveContract, splitRwaPrices } from "@veydara/cmc";
import { aaveListingFor, readAaveFeed, AAVE_V4_BASE, AAVE_V4_BASE_SOURCE, type OracleReading } from "@veydara/protocols";
import { erc20Abi, getAddress } from "viem";
import { cmc } from "./cmc";
import { serverEnv } from "./env";

type Unavailable = { status: "unavailable"; code: string; reason: string };
type Avail<T> = ({ status: "ok" } & T) | Unavailable;

export interface AssetIntel {
  chain: "base" | "solana";
  address: string;
  identity: ReturnType<typeof classifyToken>;
  registry: TokenRepresentation | null;
  onchain: Avail<{ symbol: string; name: string; decimals: number; totalSupply: string; blockNumber: string }>;
  cmcListing: Avail<{ cmcId: number; name: string; symbol: string; slug: string; website: string[]; description: string | null; provenance: Provenance }>;
  cmcQuote: Avail<{ priceUsd: string; percentChange24h: number | null; volume24h: number | null; marketCap: number | null; lastUpdated: string | null; provenance: Provenance }>;
  dex: Avail<{ priceUsd: string | null; liquidityUsd: string | null; marketCapUsd: string | null; provenance: Provenance }>;
  rwa: Avail<{ underlying: string; aggregatePriceUsd: number | null; aggregateLastUpdated: string | null; issuerTokens: { symbol: string; issuerName: string | null; priceUsd: number | null; cmcId: number }[]; provenance: Provenance }>;
  aave: { listed: false; note: string } | { listed: true; symbol: string; hub: string; spoke: string; feed: string; oracle: Avail<OracleReading>; eligibility: "unknown"; note: string; source: typeof AAVE_V4_BASE_SOURCE };
  session: ReturnType<typeof usEquitySession> | null;
  priceDisagreement: { cmcVsOracleBps: number | null; flagged: boolean; note: string } | null;
}

const unavailable = (code: string, reason: string): Unavailable => ({ status: "unavailable", code, reason });

export async function assetIntel(chain: string, rawAddress: string): Promise<AssetIntel> {
  if (chain !== "base" && chain !== "solana") throw new VeydaraError("UNSUPPORTED_CHAIN", `Chain ${chain} not supported yet`);
  let address: string;
  if (chain === "base") address = normalizeEvmAddress(rawAddress).toLowerCase();
  else {
    if (!isSolanaAddress(rawAddress)) throw new VeydaraError("INVALID_ADDRESS", "Not a valid Solana mint");
    address = rawAddress.trim();
  }
  const registry = findVerified(chain, address) ?? null;
  const env = serverEnv();

  // 1. On-chain identity (Base): read symbol/name/decimals/totalSupply directly.
  let onchain: AssetIntel["onchain"] = unavailable("NOT_IMPLEMENTED", "On-chain metadata read is implemented for Base contracts only.");
  if (chain === "base") {
    try {
      const client = makeBaseClient(env.BASE_RPC_URL);
      const blockNumber = await client.getBlockNumber();
      const a = getAddress(address);
      const r = await client.multicall({
        contracts: [
          { address: a, abi: erc20Abi, functionName: "symbol" },
          { address: a, abi: erc20Abi, functionName: "name" },
          { address: a, abi: erc20Abi, functionName: "decimals" },
          { address: a, abi: erc20Abi, functionName: "totalSupply" },
        ],
        blockNumber,
        allowFailure: true,
      });
      if (r.every((x) => x.status === "success")) onchain = { status: "ok", symbol: String(r[0]!.result), name: String(r[1]!.result), decimals: Number(r[2]!.result), totalSupply: String(r[3]!.result), blockNumber: blockNumber.toString() };
      else onchain = unavailable("NOT_ERC20", "Contract did not answer the ERC-20 metadata calls at this block.");
    } catch (e) {
      onchain = unavailable("RPC_UNAVAILABLE", (e as Error).message.slice(0, 160));
    }
  }
  const identity = classifyToken({ chain, address, symbol: onchain.status === "ok" ? onchain.symbol : (registry?.symbol ?? null), name: onchain.status === "ok" ? onchain.name : (registry?.name ?? null), decimals: onchain.status === "ok" ? onchain.decimals : (registry?.decimals ?? null) });

  // 2. CMC listing by exact contract (keyless-capable), then quote.
  let cmcListing: AssetIntel["cmcListing"] = unavailable("SKIPPED", "Quarantined tokens are not researched.");
  let cmcQuote: AssetIntel["cmcQuote"] = unavailable("SKIPPED", "No CMC listing resolved.");
  if (identity.status === "verified" || identity.status === "unverified") {
    const info = await cmc().request("cryptoInfoV2", { address: chain === "base" ? getAddress(address) : address }, { feature: "asset.identity" });
    if (!info.ok) cmcListing = unavailable(info.error.code, info.error.message);
    else {
      const res = resolveContract(info.data.data, chain, address);
      if (res.status === "exact") {
        const item = Object.values(info.data.data).flatMap((v) => (Array.isArray(v) ? v : [v])).find((x) => x.id === res.cmcId)!;
        cmcListing = { status: "ok", cmcId: res.cmcId, name: res.name, symbol: res.symbol, slug: res.slug, website: item.urls?.website ?? [], description: item.description ?? null, provenance: info.provenance };
      } else cmcListing = unavailable(res.status.toUpperCase(), res.status === "mismatch" ? res.reason : res.status === "ambiguous" ? "Multiple CMC assets claim this contract; refusing to guess." : "Not listed on CMC.");
    }
    // Quote by the exact CMC id: from the live contract resolution, or the registry id that was
    // itself verified by exact-contract lookup (fixtures/chain/registry-verification.json).
    const quoteId = cmcListing.status === "ok" ? cmcListing.cmcId : (registry?.cmcId ?? null);
    if (quoteId !== null) {
      const q = await cmc().request("cryptoQuotesLatestV3", { id: String(quoteId) }, { feature: "asset.quote" });
      const data = q.ok ? q.data : q.stale?.data;
      const item = data?.data.find((x) => x.id === quoteId);
      const usd = item ? pickQuote(item, "USD") : null;
      if (usd?.price != null) {
        const prov = q.ok ? q.provenance : { ...q.provenance, freshness: "stale" as const, coverage: "complete" as const, fetchedAt: q.stale!.fetchedAt };
        cmcQuote = { status: "ok", priceUsd: normalizeDecimal(usd.price), percentChange24h: usd.percent_change_24h ?? null, volume24h: usd.volume_24h ?? null, marketCap: usd.market_cap ?? null, lastUpdated: usd.last_updated ?? null, provenance: { ...prov, observedAt: usd.last_updated ?? prov.observedAt } };
      } else cmcQuote = q.ok ? unavailable("NO_QUOTE", "CMC returned no USD quote for this id.") : unavailable(q.error.code, q.error.message);
    }
  }

  // 3. DEX liquidity context (keyless). DEX liquidity ≠ lending borrow liquidity.
  let dex: AssetIntel["dex"] = unavailable("SKIPPED", "Only researched for verified/unverified (non-spam) tokens.");
  if (identity.status === "verified" || identity.status === "unverified") {
    const d = await cmc().request("dexToken", { platform: chain, address }, { feature: "asset.dex" });
    dex = d.ok ? { status: "ok", priceUsd: d.data.data.p ?? null, liquidityUsd: d.data.data.liqUsd ?? null, marketCapUsd: d.data.data.mcap ?? null, provenance: d.provenance } : unavailable(d.error.code, d.error.message);
  }

  // 4. RWA aggregate vs issuer tokens (key required).
  let rwa: AssetIntel["rwa"] = unavailable("NOT_RWA", "Not a tokenized RWA in the verified registry.");
  const underlying = registry?.underlying;
  if (registry?.assetClass === "tokenized-equity" && underlying) {
    const r = await cmc().request("rwaQuotesLatest", { symbol: underlying.symbol }, { feature: "asset.rwa" });
    if (r.ok) {
      const item = r.data.data.rwa_assets.find((x) => x.symbol.toUpperCase() === underlying.symbol.toUpperCase());
      if (item) {
        const split = splitRwaPrices(item);
        rwa = { status: "ok", underlying: item.name, aggregatePriceUsd: split.aggregate.price, aggregateLastUpdated: split.aggregate.lastUpdated, issuerTokens: split.issuerTokens.map((t) => ({ symbol: t.symbol, issuerName: t.issuerName, priceUsd: t.price, cmcId: t.cmcId })), provenance: r.provenance };
      } else rwa = unavailable("NOT_FOUND", `CMC RWA quotes returned no asset for ${underlying.symbol}.`);
    } else rwa = unavailable(r.error.code, r.error.message);
  }

  // 5. Aave V4 listing + live protocol oracle.
  let aave: AssetIntel["aave"] = { listed: false, note: "This exact contract is not listed in the Aave V4 Base address book. No lending venue is assumed." };
  const listing = chain === "base" ? aaveListingFor(address) : null;
  let oracle: Avail<OracleReading> | null = null;
  if (listing) {
    try {
      const reading = await readAaveFeed(makeBaseClient(env.BASE_RPC_URL), listing.symbol);
      oracle = { status: "ok", ...reading };
    } catch (e) {
      oracle = unavailable("RPC_UNAVAILABLE", (e as Error).message.slice(0, 160));
    }
    aave = {
      listed: true,
      symbol: listing.symbol,
      hub: AAVE_V4_BASE.equitiesHub,
      spoke: AAVE_V4_BASE.mag7Spoke,
      feed: listing.feed,
      oracle,
      eligibility: "unknown",
      note: "Listed in the Aave V4 MAG7 spoke per the official address book. Borrow caps, LTV, pause state and your legal eligibility are NOT yet read — borrowing is not offered until they are verified on-chain.",
      source: AAVE_V4_BASE_SOURCE,
    };
  }

  let priceDisagreement: AssetIntel["priceDisagreement"] = null;
  if (cmcQuote.status === "ok" && oracle?.status === "ok") {
    const a = Number(cmcQuote.priceUsd);
    const b = Number(oracle.answer);
    const bps = b > 0 ? Math.round(((a - b) / b) * 10_000) : null;
    priceDisagreement = { cmcVsOracleBps: bps, flagged: bps !== null && Math.abs(bps) > 100, note: "CMC market price vs Aave protocol oracle. Risk math uses the oracle; disagreement is flagged, never averaged." };
  }

  return { chain, address, identity, registry, onchain, cmcListing, cmcQuote, dex, rwa, aave, session: registry?.assetClass === "tokenized-equity" ? usEquitySession(new Date()) : null, priceDisagreement };
}
