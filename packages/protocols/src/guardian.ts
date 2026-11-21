/**
 * Guardian basics — pure, deterministic functions:
 *  - riskRadar: scores one Aave V4 position on seven axes from block-pinned facts;
 *  - evaluatePolicies: in-app alert rules. Monitor-only: an alert never triggers an action.
 * Thresholds are explicit and documented in docs/FINANCIAL-MODELS.md §Guardian.
 */
import { MAX_UINT256 } from "./aave-v4-math";

export type RiskLevel = "none" | "low" | "elevated" | "high" | "critical";
export interface RadarAxis { id: "health" | "distance" | "gap" | "oracle" | "concentration" | "capacity" | "rate"; label: string; score: number; level: RiskLevel; value: string; detail: string }
export interface RadarInput {
  healthFactorWad: string;
  drawdownToLiquidationBps: string | null;
  /** HF after the −10 % uniform equity gap scenario (Parallel Futures). */
  gap10HealthFactorWad: string | null;
  /** Oldest collateral oracle update age (s) and whether the US equity market is open now. */
  oracleMaxAgeSeconds: number | null;
  marketOpen: boolean;
  /** Largest single collateral share of collateral value, 0–1. */
  largestCollateralShare: number | null;
  /** Borrowed reserve: spoke debt / draw cap, 0–1 (null if uncapped or no debt). */
  drawCapUtilisation: number | null;
  borrowAprBps: number | null;
}
export interface Radar { axes: RadarAxis[]; overall: RiskLevel; score: number; hasDebt: boolean }

const lvl = (s: number): RiskLevel => (s <= 0 ? "none" : s < 25 ? "low" : s < 50 ? "elevated" : s < 85 ? "high" : "critical");
const hf = (w: string | null) => (w === null || BigInt(w) === MAX_UINT256 ? null : Number(BigInt(w) / 10n ** 12n) / 1e6);
const band = (v: number, steps: [number, number][], last: number) => {
  for (const [lim, s] of steps) if (v >= lim) return s;
  return last;
};

export function riskRadar(x: RadarInput): Radar {
  const h = hf(x.healthFactorWad);
  const hasDebt = h !== null;
  const axes: RadarAxis[] = [];
  const add = (a: Omit<RadarAxis, "level">) => axes.push({ ...a, level: lvl(a.score) });
  add({ id: "health", label: "Health factor", score: !hasDebt ? 0 : band(h!, [[2, 10], [1.5, 30], [1.25, 55], [1.05, 80]], 95), value: hasDebt ? h!.toFixed(3) : "∞", detail: hasDebt ? "Spoke HF; liquidatable below 1.00" : "No debt — cannot be liquidated" });
  const dd = x.drawdownToLiquidationBps === null ? null : Number(x.drawdownToLiquidationBps) / 100;
  add({ id: "distance", label: "Distance to liquidation", score: dd === null ? 0 : band(dd, [[50, 10], [30, 30], [15, 55], [5, 80]], 95), value: dd === null ? "—" : `${dd.toFixed(1)}%`, detail: "Uniform collateral fall that would bring HF to 1.00" });
  const g = hf(x.gap10HealthFactorWad);
  add({ id: "gap", label: "Monday-gap stress", score: !hasDebt || g === null ? 0 : band(g, [[1.5, 10], [1.24, 40], [1, 75]], 95), value: g === null ? "—" : g.toFixed(3), detail: "HF if tokenized equities reopen 10 % lower (oracles hold the last close while markets are shut)" });
  const ageH = x.oracleMaxAgeSeconds === null ? null : x.oracleMaxAgeSeconds / 3600;
  add({ id: "oracle", label: "Oracle freshness", score: ageH === null ? 50 : x.marketOpen ? band(-ageH, [[-1, 5], [-6, 70]], 90) : 20, value: ageH === null ? "unknown" : `${ageH.toFixed(1)} h`, detail: ageH === null ? "Feed age unavailable" : x.marketOpen ? "Market open: feeds should update within the hour" : "Market closed: feeds hold the last close by design — gap risk applies" });
  const c = x.largestCollateralShare;
  add({ id: "concentration", label: "Concentration", score: c === null ? 0 : band(-c, [[-0.5, 10], [-0.8, 40]], 60), value: c === null ? "—" : `${Math.round(c * 100)}%`, detail: "Largest single collateral's share of collateral value" });
  const u = x.drawCapUtilisation;
  add({ id: "capacity", label: "Borrow capacity", score: u === null ? 0 : band(-u, [[-0.7, 10], [-0.9, 40]], 70), value: u === null ? "—" : `${Math.round(u * 100)}%`, detail: "Spoke debt vs draw cap for the borrowed reserve (new borrows fail at 100 %)" });
  const r = x.borrowAprBps === null ? null : x.borrowAprBps / 100;
  add({ id: "rate", label: "Borrow rate", score: !hasDebt || r === null ? 0 : band(-r, [[-5, 10], [-10, 35]], 60), value: r === null ? "—" : `${r.toFixed(2)}%`, detail: "Drawn rate × (1 + risk premium)" });
  const score = Math.max(...axes.map((a) => a.score));
  return { axes, overall: lvl(score), score, hasDebt };
}

/* ---------------------------------- Policies ---------------------------------- */
export type PolicyKind = "hf-below" | "drawdown-below" | "gap-hf-below" | "oracle-stale-hours" | "radar-at-least";
export interface Policy { id: string; kind: PolicyKind; threshold: number; enabled: boolean; mode: "monitor" }
export const POLICY_KINDS: Record<PolicyKind, { label: string; unit: string; help: string }> = {
  "hf-below": { label: "Health factor below", unit: "HF", help: "Fires when the Spoke HF is below the threshold." },
  "drawdown-below": { label: "Distance to liquidation below", unit: "%", help: "Fires when a uniform fall of less than this % would liquidate." },
  "gap-hf-below": { label: "Monday-gap HF below", unit: "HF", help: "Fires when a −10 % reopening gap would take HF below the threshold." },
  "oracle-stale-hours": { label: "Oracle stale while market open", unit: "h", help: "Fires when a collateral feed is older than this during US market hours." },
  "radar-at-least": { label: "Radar score at least", unit: "/100", help: "Fires when the overall radar score reaches the threshold." },
};
export const DEFAULT_POLICIES: Policy[] = [
  { id: "p-hf", kind: "hf-below", threshold: 1.5, enabled: true, mode: "monitor" },
  { id: "p-dd", kind: "drawdown-below", threshold: 20, enabled: true, mode: "monitor" },
  { id: "p-gap", kind: "gap-hf-below", threshold: 1.24, enabled: true, mode: "monitor" },
  { id: "p-oracle", kind: "oracle-stale-hours", threshold: 2, enabled: true, mode: "monitor" },
  { id: "p-radar", kind: "radar-at-least", threshold: 85, enabled: false, mode: "monitor" },
];

export interface Alert { key: string; policyId: string; kind: PolicyKind; address: string; severity: "info" | "warning" | "critical"; title: string; detail: string; observed: string; threshold: string; blockNumber: string; mode: "monitor"; action: "none (monitor-only)" }

export function evaluatePolicies(address: string, blockNumber: string, input: RadarInput, radar: Radar, policies: Policy[]): Alert[] {
  const out: Alert[] = [];
  const h = hf(input.healthFactorWad);
  const fire = (p: Policy, ok: boolean, observed: string, title: string, detail: string, severity: Alert["severity"]) => {
    if (!ok) return;
    out.push({ key: `${p.id}:${address.toLowerCase()}`, policyId: p.id, kind: p.kind, address, severity, title, detail, observed, threshold: String(p.threshold), blockNumber, mode: "monitor", action: "none (monitor-only)" });
  };
  for (const p of policies) {
    if (!p.enabled || p.mode !== "monitor") continue;
    if (p.kind === "hf-below") fire(p, h !== null && h < p.threshold, h?.toFixed(3) ?? "∞", `Health factor ${h?.toFixed(3)} < ${p.threshold}`, "Repaying debt or adding collateral raises HF. VEYDARA takes no action.", h !== null && h < 1.1 ? "critical" : "warning");
    if (p.kind === "drawdown-below" && input.drawdownToLiquidationBps !== null) {
      const dd = Number(input.drawdownToLiquidationBps) / 100;
      fire(p, dd < p.threshold, `${dd.toFixed(1)}%`, `A ${dd.toFixed(1)}% collateral fall would liquidate`, "Distance to liquidation below your policy.", dd < 5 ? "critical" : "warning");
    }
    if (p.kind === "gap-hf-below") {
      const g = hf(input.gap10HealthFactorWad);
      fire(p, h !== null && g !== null && g < p.threshold, g?.toFixed(3) ?? "—", `A −10% reopening gap → HF ${g?.toFixed(3)}`, "Equity oracles hold the last close while markets are shut; a gap lands all at once.", g !== null && g < 1 ? "critical" : "warning");
    }
    if (p.kind === "oracle-stale-hours" && input.oracleMaxAgeSeconds !== null) {
      const ageH = input.oracleMaxAgeSeconds / 3600;
      fire(p, input.marketOpen && ageH > p.threshold, `${ageH.toFixed(1)} h`, `Collateral oracle ${ageH.toFixed(1)} h old during market hours`, "Feeds normally update within the hour while US markets are open.", "warning");
    }
    if (p.kind === "radar-at-least") fire(p, radar.score >= p.threshold, String(radar.score), `Radar score ${radar.score} ≥ ${p.threshold}`, `Overall level: ${radar.overall}.`, radar.score >= 95 ? "critical" : "warning");
  }
  return out;
}
