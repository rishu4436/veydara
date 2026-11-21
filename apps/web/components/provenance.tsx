"use client";

import type { Provenance } from "@veydara/domain";
import { useState } from "react";
import { FreshnessDot } from "./badge";
import { timeAgo } from "@/lib/client/api";

const SRC: Record<Provenance["source"], string> = {
  "cmc-pro": "CoinMarketCap Pro API",
  "cmc-keyless": "CoinMarketCap keyless API",
  "base-rpc": "Base RPC",
  "solana-rpc": "Solana RPC",
  "chainlink-feed": "Chainlink feed (Aave oracle)",
  "aave-address-book": "Aave address book",
  "aave-v4-spoke": "Aave V4 Spoke (on-chain)",
  "veydara-model": "VEYDARA deterministic model",
  "anvil-fork": "FORK — local anvil (chain 31337)",
  fixture: "FIXTURE",
  "user-input": "User input",
};

/** Inline, expandable provenance: every number can answer "where did this come from?". */
export function ProvenanceChip({ p }: { p: Provenance }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-raised">
        <FreshnessDot freshness={p.freshness} label={`${SRC[p.source]} · ${timeAgo(p.observedAt ?? p.fetchedAt)}`} />
      </button>
      {open && (
        <span role="dialog" className="absolute left-0 top-7 z-30 w-80 rounded-xl border border-line bg-raised p-3 text-left text-[11px] leading-5 shadow-2xl">
          <Row k="Source" v={SRC[p.source]} />
          <Row k="Endpoint / contract" v={p.endpointOrContract} mono />
          {p.assetId && <Row k="Asset id" v={p.assetId} mono />}
          {p.chainId !== undefined && <Row k="Chain" v={String(p.chainId)} />}
          {p.blockNumber && <Row k="Block / slot" v={p.blockNumber} mono />}
          <Row k="Observed" v={p.observedAt ?? "unknown"} mono />
          <Row k="Fetched" v={p.fetchedAt} mono />
          <Row k="Freshness" v={p.freshness} />
          <Row k="Simulated" v={p.isSimulated ? "YES" : "no"} />
        </span>
      )}
    </span>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <span className="flex justify-between gap-3">
      <span className="text-faint">{k}</span>
      <span className={`truncate text-right text-fg ${mono ? "font-mono" : ""}`} title={v}>
        {v}
      </span>
    </span>
  );
}
