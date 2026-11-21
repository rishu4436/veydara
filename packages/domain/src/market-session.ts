/**
 * US equity market session calculator for the RWA Risk Clock.
 * Regular session 09:30–16:00 America/New_York, Mon–Fri, excluding NYSE holidays.
 * Holiday/early-close calendar from https://www.nyse.com/markets/hours-calendars
 * (2026 entries; re-verify yearly — see docs/SOURCES-AND-CLAIMS.md).
 * Underlying-market sessions are NOT the same as token or oracle availability:
 * tokens trade 24/7 on-chain while the Aave equity feeds follow their own schedule.
 */
export const NYSE_HOLIDAYS_2026 = ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"];
export const NYSE_EARLY_CLOSE_2026 = ["2026-11-27", "2026-12-24"]; // 13:00 ET

export interface SessionState {
  status: "open" | "closed" | "early-close-open";
  reason: string;
  etNow: string;
  nextOpen: string | null; // ISO UTC
  nextClose: string | null; // ISO UTC
  calendarCoverage: "2026";
}

function etParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday as string };
}

/** Convert an ET wall-clock time on a date to a UTC Date (handles DST by probing offset). */
export function etToUtc(date: string, hour: number, minute: number): Date {
  const guess = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  for (const offset of [4, 5]) {
    const cand = new Date(guess.getTime() + offset * 3_600_000);
    const p = etParts(cand);
    if (p.date === date && p.hour === hour && p.minute === minute) return cand;
  }
  return new Date(guess.getTime() + 5 * 3_600_000);
}

function isTradingDay(date: string, weekday: string) {
  return !["Sat", "Sun"].includes(weekday) && !NYSE_HOLIDAYS_2026.includes(date);
}

export function usEquitySession(now: Date): SessionState {
  const p = etParts(now);
  const etNow = `${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET`;
  const mins = p.hour * 60 + p.minute;
  const early = NYSE_EARLY_CLOSE_2026.includes(p.date);
  const closeMin = early ? 13 * 60 : 16 * 60;
  if (isTradingDay(p.date, p.weekday) && mins >= 570 && mins < closeMin) {
    return { status: early ? "early-close-open" : "open", reason: early ? "Regular session (early close 13:00 ET)" : "Regular session", etNow, nextOpen: null, nextClose: etToUtc(p.date, early ? 13 : 16, 0).toISOString(), calendarCoverage: "2026" };
  }
  // find next open
  let reason = "Outside regular hours";
  if (["Sat", "Sun"].includes(p.weekday)) reason = "Weekend";
  else if (NYSE_HOLIDAYS_2026.includes(p.date)) reason = "NYSE holiday";
  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const q = etParts(d);
    if (!isTradingDay(q.date, q.weekday)) continue;
    const open = etToUtc(q.date, 9, 30);
    if (open.getTime() > now.getTime()) {
      const ec = NYSE_EARLY_CLOSE_2026.includes(q.date);
      return { status: "closed", reason, etNow, nextOpen: open.toISOString(), nextClose: etToUtc(q.date, ec ? 13 : 16, 0).toISOString(), calendarCoverage: "2026" };
    }
  }
  return { status: "closed", reason, etNow, nextOpen: null, nextClose: null, calendarCoverage: "2026" };
}
