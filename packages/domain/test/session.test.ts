import { describe, expect, it } from "vitest";
import { usEquitySession } from "../src";

describe("US equity session", () => {
  it("open on a regular Friday afternoon ET", () => {
    const s = usEquitySession(new Date("2026-11-20T18:00:00Z")); // 13:00 ET (EST)
    expect(s.status).toBe("open");
    expect(s.nextClose).toBe("2026-11-20T21:00:00.000Z");
  });
  it("closed on Saturday with next open Monday 09:30 ET", () => {
    const s = usEquitySession(new Date("2026-11-21T08:00:00Z"));
    expect(s.status).toBe("closed");
    expect(s.reason).toBe("Weekend");
    expect(s.nextOpen).toBe("2026-11-23T14:30:00.000Z");
  });
  it("Thanksgiving is closed and the next day is an early close", () => {
    expect(usEquitySession(new Date("2026-11-26T16:00:00Z")).reason).toBe("NYSE holiday");
    const fri = usEquitySession(new Date("2026-11-27T15:00:00Z"));
    expect(fri.status).toBe("early-close-open");
    expect(fri.nextClose).toBe("2026-11-27T18:00:00.000Z");
  });
  it("handles DST (summer open = 13:30 UTC)", () => {
    const s = usEquitySession(new Date("2026-07-06T12:00:00Z"));
    expect(s.nextOpen).toBe("2026-07-06T13:30:00.000Z");
  });
});
