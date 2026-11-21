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
      deposit: { implemented: false, note: "Fork-only execution planned (Phase 4); no mainnet broadcast without owner approval." },
      borrow: { implemented: false, note: "Fork-only execution planned (Phase 4)." },
      repay: { implemented: false, note: "Phase 4." },
      withdraw: { implemented: false, note: "Phase 4." },
    },
    sources: ["https://github.com/bgd-labs/aave-address-book/blob/967c772c19c63c8728c2a3bcf34f6bd5b0ff9abe/src/AaveV4Base.sol"],
  },
  {
    id: "kamino-solana",
    name: "Kamino Lend (Solana)",
    chain: "solana",
    capabilities: { marketDiscovery: { implemented: false, note: "Not started: SDK/program and tokenized-equity market verification pending." } },
    sources: [],
  },
  {
    id: "morpho",
    name: "Morpho",
    chain: "base",
    capabilities: { marketDiscovery: { implemented: false, note: "Not started; only verified exact RWA markets may ever be shown as eligible." } },
    sources: [],
  },
  {
    id: "lista-bnb",
    name: "Lista (BNB Chain)",
    chain: "bnb",
    capabilities: { marketDiscovery: { implemented: false, note: "Not started." } },
    sources: [],
  },
];
