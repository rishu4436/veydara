/**
 * Protocol adapter capability registry (spec §2.C). A capability is only
 * "true" when code + verified addresses + tests exist for it.
 */
export type AdapterCapability =
  | "marketDiscovery"
  | "readPositions"
  | "quoteBorrow"
  | "deposit"
  | "borrow"
  | "repay"
  | "withdraw"
  | "refinance"
  | "flashMigration"
  | "swap"
  | "exit"
  | "oracleRead";

export interface AdapterDescriptor {
  id: string;
  name: string;
  chain: string;
  capabilities: Partial<Record<AdapterCapability, { implemented: boolean; note: string }>>;
  sources: string[];
}

export const ADAPTERS: AdapterDescriptor[] = [
  {
    id: "aave-v4-base-equities",
    name: "Aave V4 — Equities Hub (Base)",
    chain: "base",
    capabilities: {
      oracleRead: { implemented: true, note: "Live Chainlink feed reads for MAG7 spoke assets (packages/protocols/src/oracle.ts)." },
      marketDiscovery: { implemented: true, note: "Live block-pinned reads of all MAG7 spoke reserves: collateral factor, liquidation bonus/fee, collateral risk, paused/frozen/borrowable, add/draw caps, hub liquidity, drawn rate, spoke oracle price (aave-v4-reads.ts; ABIs pinned to aave/aave-v4@4885a7ad)." },
      readPositions: { implemented: true, note: "Per-user supplied/debt/collateral flags + getUserAccountData; VEYDARA's bigint health factor reproduces the Spoke's value exactly on recorded live positions." },
      quoteBorrow: { implemented: true, note: "Deterministic max-borrow / liquidation price / APR math (aave-v4-math.ts) + Solver Arena with independent verifier. Simulation only — no transaction is built or sent." },
      deposit: { implemented: true, note: "FORK ONLY: supply + setUsingAsCollateral via packages/execution on a local anvil fork (chain 31337). No mainnet path exists." },
      borrow: { implemented: true, note: "FORK ONLY: borrow via packages/execution; verifier + snapshot simulation first." },
      repay: { implemented: true, note: "FORK ONLY: exact-amount approval + repay; partial repay reconciled." },
      withdraw: { implemented: true, note: "FORK ONLY: withdraw with HF re-check." },
    },
    sources: ["https://github.com/bgd-labs/aave-address-book/blob/967c772c19c63c8728c2a3bcf34f6bd5b0ff9abe/src/AaveV4Base.sol"],
  },
  {
    id: "kamino-solana",
    name: "Kamino Lend (Solana)",
    chain: "solana",
    capabilities: {
      marketDiscovery: { implemented: true, note: "Read-only: verified xStocks market (5wJeMr…ua) loaded with @kamino-finance/klend-sdk 14.0.0 — reserves, LTV, liquidation threshold, caps, APYs, oracle prices." },
      readPositions: { implemented: true, note: "Read-only: a wallet's obligations on the xStocks market (deposits, borrows, LTV, liquidation LTV, distance to liquidation)." },
      deposit: { implemented: false, note: "Not built: no Solana fork/simulation pipeline yet." },
      borrow: { implemented: false, note: "Not built." },
    },
    sources: ["https://docs.kamino.com/build/developers/multiply/operations/deposit-xstocks", "https://www.npmjs.com/package/@kamino-finance/klend-sdk"],
  },
  {
    id: "morpho",
    name: "Morpho",
    chain: "base",
    capabilities: { marketDiscovery: { implemented: false, note: "Researched, not built: Morpho Blue (variable) and Midnight (fixed) list curator-run USDC markets on Base against AAPLc, GOOGLc, NVDAc, METAc, SPCXc (Steakhouse-curated, Sept 2026). Market ids and oracles are not yet pinned from Morpho's own API, so nothing is shown; see docs/PROTOCOL-ADAPTERS.md." } },
    sources: ["https://www.altcoinbuzz.io/morpho-opens-borrowing-against-coinbase-stock-tokens-on-base", "https://kitchen.steakhouse.financial/p/defi-markets-update-2026-09-22"],
  },
  {
    id: "lista-bnb",
    name: "Lista (BNB Chain)",
    chain: "bnb",
    capabilities: { marketDiscovery: { implemented: false, note: "Blocked: Lista Lending accepts Binance bStocks (not Coinbase B20 or xStocks) on BNB Chain with Atlas Oracle pricing (docs.bsc.lista.org). BNB Chain is outside VEYDARA's chain set (Base, Solana) and no BNB reads exist yet; see docs/PROTOCOL-ADAPTERS.md." } },
    sources: ["https://docs.bsc.lista.org/introduction/lista-lending/bstocks", "https://blog.lista.org/introducing-bstocks-as-collateral"],
  },
];
