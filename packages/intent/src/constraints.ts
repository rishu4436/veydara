/**
 * Capital Intent Engine — typed, bounded constraints.
 * Every numeric field has hard bounds; anything outside them is rejected (never silently clamped),
 * except the VEYDARA policy floor, which is enforced upward and recorded as a note.
 */
import { z } from "zod";

export const EQUITY_SYMBOLS = ["AAPLc", "AMZNc", "GOOGLc", "METAc", "MSFTc", "NVDAc", "TSLAc", "SPCXc"] as const;
export type EquitySymbol = (typeof EQUITY_SYMBOLS)[number];

export const BOUNDS = {
  minHealthFactor: { min: 1.0, max: 10 },
  policyFloorHealthFactor: 1.25,
  borrowAmountUsd: { min: 1, max: 10_000_000 },
  survivesDropPct: { min: 1, max: 90 },
  maxAprPct: { min: 0.01, max: 100 },
  horizonDays: { min: 1, max: 365 },
  collateralCount: { max: 8 },
} as const;

export const ConstraintsSchema = z
  .object({
    goal: z.enum(["borrow", "protect"]),
    borrowAsset: z.literal("USDC"),
    /** null = "as much as the constraints allow". */
    borrowAmountUsd: z.number().min(BOUNDS.borrowAmountUsd.min).max(BOUNDS.borrowAmountUsd.max).nullable(),
    /** Empty = use every eligible collateral (existing position + wallet). */
    collateral: z.array(z.enum(EQUITY_SYMBOLS)).max(BOUNDS.collateralCount.max),
    minHealthFactor: z.number().min(BOUNDS.minHealthFactor.min).max(BOUNDS.minHealthFactor.max),
    survivesDropPct: z.number().min(BOUNDS.survivesDropPct.min).max(BOUNDS.survivesDropPct.max).nullable(),
    /** After this equity gap, HF must stay ≥ the Spoke target HF (1.24). */
    gapPct: z.number().min(BOUNDS.survivesDropPct.min).max(BOUNDS.survivesDropPct.max).nullable(),
    maxAprPct: z.number().min(BOUNDS.maxAprPct.min).max(BOUNDS.maxAprPct.max).nullable(),
    horizonDays: z.number().int().min(BOUNDS.horizonDays.min).max(BOUNDS.horizonDays.max),
  })
  .strict();
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const DEFAULT_CONSTRAINTS: Constraints = {
  goal: "borrow",
  borrowAsset: "USDC",
  borrowAmountUsd: null,
  collateral: [],
  minHealthFactor: BOUNDS.policyFloorHealthFactor,
  survivesDropPct: null,
  gapPct: null,
  maxAprPct: null,
  horizonDays: 30,
};

/** Spoke target HF used to restore liquidated positions (Aave V4 MAG7 Spoke liquidation config). */
export const SPOKE_TARGET_HF = 1.24;

/** The single HF a plan must reach to satisfy every risk constraint at once. */
export function effectiveTargetHf(c: Constraints): { hf: number; binding: string } {
  const cands: { hf: number; why: string }[] = [
    { hf: BOUNDS.policyFloorHealthFactor, why: "VEYDARA policy floor 1.25" },
    { hf: c.minHealthFactor, why: `requested HF ≥ ${c.minHealthFactor}` },
  ];
  // A uniform collateral drop of d scales HF by (1−d); liquidation at HF 1 ⇒ HF_now ≥ 1/(1−d).
  if (c.survivesDropPct !== null) cands.push({ hf: 1 / (1 - c.survivesDropPct / 100), why: `survive a ${c.survivesDropPct}% drop ⇒ HF ≥ 1/(1−${c.survivesDropPct / 100})` });
  if (c.gapPct !== null) cands.push({ hf: SPOKE_TARGET_HF / (1 - c.gapPct / 100), why: `stay ≥ Spoke target ${SPOKE_TARGET_HF} after a ${c.gapPct}% gap ⇒ HF ≥ ${SPOKE_TARGET_HF}/(1−${c.gapPct / 100})` });
  const best = cands.reduce((a, b) => (b.hf > a.hf ? b : a));
  return { hf: Math.ceil(best.hf * 10_000) / 10_000, binding: best.why };
}

export const PRESETS: Record<string, { label: string; description: string; constraints: Partial<Constraints> }> = {
  fortress: { label: "Fortress", description: "Borrow only what survives a 50% equity drawdown.", constraints: { survivesDropPct: 50 } },
  "gap-proof": { label: "Gap-proof", description: "Stay above the Spoke target HF after a 20% Monday gap.", constraints: { gapPct: 20 } },
  balanced: { label: "Balanced", description: "Survive a 35% drawdown; APR under 15%.", constraints: { survivesDropPct: 35, maxAprPct: 15 } },
  "policy-floor": { label: "Policy floor", description: "Maximum borrow allowed by VEYDARA's HF 1.25 floor.", constraints: { minHealthFactor: 1.25 } },
  protect: { label: "Protect", description: "No new debt; report how far the position is from every risk constraint.", constraints: { goal: "protect", survivesDropPct: 35 } },
};
