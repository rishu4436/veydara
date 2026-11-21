"use client";

import type { SessionState } from "@veydara/domain";

/**
 * RWA Risk Clock (Phase 1 slice): underlying-market session + protocol oracle age.
 * Gap-stress and loan headroom arrive with the borrowing engine (Phase 3).
 */
export function RiskClock({ session, oracleUpdatedAt, oracleAgeSec }: { session: SessionState; oracleUpdatedAt: string | null; oracleAgeSec: number | null }) {
  const now = Date.now();
  const nextOpen = session.nextOpen ? Date.parse(session.nextOpen) : null;
  const nextClose = session.nextClose ? Date.parse(session.nextClose) : null;
  const open = session.status !== "closed";
  const hrs = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
  // Ring: 7-day horizon, fraction until next state change
  const target = open ? nextClose : nextOpen;
  const frac = target ? Math.min(1, Math.max(0, (target - now) / (7 * 86_400_000))) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="@container"><div className="grid items-center gap-6 @md:grid-cols-[150px_1fr]">
      <svg viewBox="0 0 140 140" className="h-[150px] w-[150px]" role="img" aria-label={`US equity market ${open ? "open" : "closed"}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-line)" strokeWidth="8" />
        <circle cx="70" cy="70" r={R} fill="none" stroke={open ? "var(--color-mint)" : "var(--color-amber)"} strokeWidth="8" strokeDasharray={`${C * frac} ${C}`} strokeLinecap="round" transform="rotate(-90 70 70)" />
        <text x="70" y="66" textAnchor="middle" className="fill-[var(--color-fg)] font-display" fontSize="17">{open ? "OPEN" : "CLOSED"}</text>
        <text x="70" y="86" textAnchor="middle" fill="var(--color-muted)" fontSize="9.5">US equities</text>
      </svg>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px]">
        <div>
          <dt className="text-faint">Session</dt>
          <dd>{session.reason}</dd>
        </div>
        <div>
          <dt className="text-faint">Now (New York)</dt>
          <dd className="num font-mono text-[12px]">{session.etNow}</dd>
        </div>
        <div>
          <dt className="text-faint">{open ? "Closes in" : "Reopens in"}</dt>
          <dd className="num">{target ? hrs(target - now) : "unknown"}</dd>
        </div>
        <div>
          <dt className="text-faint">{open ? "Close (your time)" : "Next open (your time)"}</dt>
          <dd className="num text-[12px]">{target ? new Date(target).toLocaleString() : "—"}</dd>
        </div>
        <div>
          <dt className="text-faint">Aave oracle last update</dt>
          <dd className="num text-[12px]">{oracleUpdatedAt ? new Date(oracleUpdatedAt).toLocaleString() : "unavailable"}</dd>
        </div>
        <div>
          <dt className="text-faint">Oracle age</dt>
          <dd className="num">{oracleAgeSec !== null ? hrs(oracleAgeSec * 1000) : "—"}</dd>
        </div>
        <p className="col-span-2 text-[11px] leading-4 text-faint">
          The token trades on-chain 24/7 while the underlying market follows NYSE hours. A large oracle age while the market is closed can be expected behaviour for a 24/5 feed; the feed&apos;s published schedule is not yet verified in VEYDARA, so the raw age is shown without a malfunction verdict. Calendar: NYSE 2026.
        </p>
      </dl>
    </div></div>
  );
}
