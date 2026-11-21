import { NextResponse } from "next/server";
import { VeydaraError } from "@veydara/domain";

const buckets = new Map<string, { tokens: number; at: number }>();

/** Small in-memory token bucket per client IP + route (abuse protection for upstream budgets). */
export function rateLimit(req: Request, route: string, perMinute = 30): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${route}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests to VEYDARA API; slow down." } }, { status: 429 });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return null;
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof VeydaraError) {
    const status = e.code === "INVALID_ADDRESS" || e.code === "UNSUPPORTED_CHAIN" ? 400 : e.code === "RPC_UNAVAILABLE" ? 503 : 502;
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
  }
  console.error(e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}
