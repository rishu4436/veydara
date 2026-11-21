import type { CapabilityStatus, Freshness, VerificationStatus } from "@veydara/domain";
import { CAPABILITY_LABEL } from "@veydara/domain";

const capStyle: Record<CapabilityStatus, string> = {
  "live-verified": "text-mint border-mint/40 bg-mint/10",
  "read-only": "text-ice border-ice/40 bg-ice/10",
  "fork-testnet": "text-violet border-violet/40 bg-violet/10",
  simulation: "text-amber border-amber/40 bg-amber/10",
  unavailable: "text-muted border-line bg-raised",
};
const capGlyph: Record<CapabilityStatus, string> = { "live-verified": "●", "read-only": "◐", "fork-testnet": "◇", simulation: "◌", unavailable: "○" };

export function CapabilityBadge({ status, title }: { status: CapabilityStatus; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${capStyle[status]}`}>
      <span aria-hidden>{capGlyph[status]}</span>
      {CAPABILITY_LABEL[status]}
    </span>
  );
}

const idStyle: Record<VerificationStatus, [string, string]> = {
  verified: ["text-mint border-mint/40 bg-mint/10", "Verified contract"],
  unverified: ["text-amber border-amber/40 bg-amber/10", "Unverified"],
  "suspected-spam": ["text-danger border-danger/40 bg-danger/10", "Suspected spam"],
  impersonation: ["text-danger border-danger/40 bg-danger/10", "Impersonation risk"],
};

export function IdentityBadge({ status }: { status: VerificationStatus }) {
  const [cls, label] = idStyle[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

const freshStyle: Record<Freshness, [string, string]> = {
  live: ["bg-mint", "Live"],
  cached: ["bg-ice", "Cached"],
  stale: ["bg-amber", "Stale"],
  unavailable: ["bg-faint", "Unavailable"],
};

export function FreshnessDot({ freshness, label }: { freshness: Freshness; label?: string }) {
  const [dot, text] = freshStyle[freshness];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label ?? text}
    </span>
  );
}
