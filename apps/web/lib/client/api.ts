import type { Capability } from "@veydara/domain";

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const body = (await r.json().catch(() => null)) as T & { error?: { code: string; message: string } };
  if (!r.ok) throw new Error(body?.error ? `${body.error.code}: ${body.error.message}` : `HTTP ${r.status}`);
  return body;
}

export type CapabilitiesResponse = { capabilities: Capability[]; generatedAt: string };

export function shortAddr(a: string, n = 4) {
  if (a.length <= 2 * n + 3) return a;
  return `${a.slice(0, n + (a.startsWith("0x") ? 2 : 0))}…${a.slice(-n)}`;
}

export function fmtUsd(s: string | null | undefined, opts: { compact?: boolean } = {}) {
  if (s === null || s === undefined) return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: opts.compact ? "compact" : "standard", maximumFractionDigits: n < 1 && n > 0 ? 6 : 2 }).format(n);
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
