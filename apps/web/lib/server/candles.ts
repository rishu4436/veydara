import { completeCandles, fromCmcKlineRows, INTERVAL_MS, detectGaps, type Candle } from "@veydara/quant";
import type { Provenance } from "@veydara/domain";
import { cmc } from "./cmc";

export const KLINE_INTERVALS = ["15min", "1h", "4h", "1d", "1w"] as const;
export type KlineInterval = (typeof KLINE_INTERVALS)[number];

/** CMC DEX K-line is keyed by token contract. Native assets map to their canonical wrapped token. */
export function klineTarget(chain: "base" | "solana", address: string): { platform: string; address: string; note: string | null } {
  if (address === "native") {
    return chain === "base"
      ? { platform: "base", address: "0x4200000000000000000000000000000000000006", note: "ETH candles use WETH on Base (canonical wrapped ETH)." }
      : { platform: "solana", address: "So11111111111111111111111111111111111111112", note: "SOL candles use the wrapped SOL mint." };
  }
  return { platform: chain, address: chain === "base" ? address.toLowerCase() : address, note: null };
}

export type CandleResult =
  | { status: "ok"; candles: Candle[]; droppedForming: number; gaps: number; provenance: Provenance; source: { endpoint: string; platform: string; address: string; interval: string; note: string | null; basis: string } }
  | { status: "unavailable"; code: string; reason: string };

export async function loadCandles(chain: "base" | "solana", address: string, interval: KlineInterval, limit: number, feature: string): Promise<CandleResult> {
  const t = klineTarget(chain, address);
  const r = await cmc().request("dexKlineCandles", { platform: t.platform, address: t.address, interval, limit: String(limit), unit: "usd" }, { feature });
  if (!r.ok) return { status: "unavailable", code: r.error.code, reason: r.error.message };
  const all = fromCmcKlineRows(r.data.data, INTERVAL_MS[interval]!);
  const candles = completeCandles(all);
  if (candles.length === 0) return { status: "unavailable", code: "EMPTY_HISTORY", reason: "CMC returned no closed DEX candles for this token and interval." };
  return {
    status: "ok",
    candles,
    droppedForming: all.length - candles.length,
    gaps: detectGaps(candles).length,
    provenance: r.provenance,
    source: { endpoint: "/v1/k-line/candles", platform: t.platform, address: t.address, interval, note: t.note, basis: "On-chain DEX trades of this exact token contract, aggregated by CMC (USD). Not the underlying stock's exchange price." },
  };
}
