/**
 * Capability badges must reflect backend reality (spec §2.E).
 * The UI never renders a badge string directly from product copy; it renders
 * the status computed by the server-side capability resolver.
 */
export type CapabilityStatus = "live-verified" | "read-only" | "fork-testnet" | "simulation" | "unavailable";

export interface Capability {
  id: string;
  label: string;
  pillar: "discover" | "alpha" | "execute" | "guardian" | "platform";
  status: CapabilityStatus;
  /** Exact reason when not live, e.g. "CMC_API_KEY not configured". */
  reason: string;
  /** What would change the status. */
  unlock?: string;
  evidence?: string;
  checkedAt: string;
}

export const CAPABILITY_LABEL: Record<CapabilityStatus, string> = {
  "live-verified": "Live verified",
  "read-only": "Read-only",
  "fork-testnet": "Fork/testnet",
  simulation: "Simulation",
  unavailable: "Unavailable",
};
