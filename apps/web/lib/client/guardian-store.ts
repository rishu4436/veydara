"use client";
/**
 * In-app Guardian state: watched addresses, monitor-only policies and the deduplicated
 * alert inbox. Kept in this browser; when signed in with Ethereum, policies and alerts are
 * also persisted server-side (Postgres or the JSON fallback). Nothing is ever acted on.
 */
import { useSyncExternalStore } from "react";
import { authFetch } from "./auth-fetch";
import { DEFAULT_POLICIES, type Alert, type Policy } from "@veydara/protocols";

export interface InboxAlert extends Alert { firstSeen: string; lastSeen: string; acked: boolean; active: boolean }
interface State { watch: string[]; policies: Policy[]; inbox: InboxAlert[] }
const KEY = "veydara.guardian.v1";
const empty: State = { watch: [], policies: DEFAULT_POLICIES, inbox: [] };
let cache: State | null = null;
const subs = new Set<() => void>();

function read(): State {
  if (cache) return cache;
  if (typeof window === "undefined") return empty;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<State> | null;
    cache = { watch: j?.watch ?? [], policies: (j?.policies ?? DEFAULT_POLICIES).map((p) => ({ ...p, mode: "monitor" as const })), inbox: j?.inbox ?? [] };
  } catch {
    cache = empty;
  }
  return cache;
}
function write(s: State) {
  cache = s;
  localStorage.setItem(KEY, JSON.stringify(s));
  subs.forEach((f) => f());
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { cache = null; subs.forEach((f) => f()); } });

export function useGuardian(): State {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), read, () => empty);
}

let serverSync = false;
const push = (url: string, method: string, body: unknown) => {
  if (serverSync) authFetch(url, { method, body }).catch(() => null);
};

export const guardian = {
  /** Called once a SIWE session is known: pull server policies (if any), then mirror changes. */
  async attachServer(enabled: boolean) {
    serverSync = enabled;
    if (!enabled) return;
    try {
      const r = await authFetch<{ policies: Policy[]; stored: boolean }>("/api/guardian/policies");
      if (r.stored) write({ ...read(), policies: r.policies.map((p) => ({ ...p, mode: "monitor" })) });
      else push("/api/guardian/policies", "PUT", { policies: read().policies });
    } catch {
      serverSync = false;
    }
  },
  setWatch(watch: string[]) { write({ ...read(), watch: [...new Set(watch.map((a) => a.trim()).filter(Boolean))].slice(0, 5) }); },
  setPolicies(policies: Policy[]) { write({ ...read(), policies: policies.map((p) => ({ ...p, mode: "monitor" })) }); push("/api/guardian/policies", "PUT", { policies: read().policies }); },
  resetPolicies() { write({ ...read(), policies: DEFAULT_POLICIES }); push("/api/guardian/policies", "PUT", { policies: DEFAULT_POLICIES }); },
  /** Merge an evaluation: dedupe by key, keep first-seen, mark resolved ones inactive. */
  ingest(addresses: string[], alerts: Alert[]) {
    const s = read();
    const now = new Date().toISOString();
    const evaluated = new Set(addresses.map((a) => a.toLowerCase()));
    const byKey = new Map(s.inbox.map((a) => [a.key, a]));
    for (const a of s.inbox) if (evaluated.has(a.address.toLowerCase())) byKey.set(a.key, { ...a, active: false });
    for (const a of alerts) {
      const prev = byKey.get(a.key);
      byKey.set(a.key, { ...a, firstSeen: prev?.firstSeen ?? now, lastSeen: now, acked: prev?.acked ?? false, active: true });
    }
    write({ ...s, inbox: [...byKey.values()].sort((x, y) => (x.lastSeen < y.lastSeen ? 1 : -1)).slice(0, 100) });
    if (alerts.length) push("/api/guardian/alerts", "POST", { alerts });
  },
  ack(key: string) { const s = read(); write({ ...s, inbox: s.inbox.map((a) => (a.key === key ? { ...a, acked: true } : a)) }); push("/api/guardian/alerts", "PATCH", { key }); },
  clearResolved() { const s = read(); write({ ...s, inbox: s.inbox.filter((a) => a.active) }); },
};
