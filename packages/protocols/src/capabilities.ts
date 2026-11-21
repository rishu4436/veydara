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
      marketDiscovery: { implemented: false, note: "Addresses pinned from address book; reserve caps/LTV reads pending pinned V4 ABI (Phase 3)." },
      readPositions: { implemented: false, note: "Pending V4 Spoke ABI integration (Phase 3)." },
      quoteBorrow: { implemented: false, note: "Pending on-chain reserve config reads (Phase 3)." },
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
