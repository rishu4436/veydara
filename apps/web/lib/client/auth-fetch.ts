"use client";

/** Read our CSRF cookie (`__Host-` prefixed over HTTPS) so mutating requests can echo it in X-CSRF-Token. */
export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.split("; ").find((c) => c.startsWith("__Host-veydara_csrf=") || c.startsWith("veydara_csrf="));
  return m ? decodeURIComponent(m.split("=")[1] ?? "") || null : null;
}

export async function authFetch<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(csrfToken() ? { "x-csrf-token": csrfToken()! } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw Object.assign(new Error(j.error?.message ?? `HTTP ${res.status}`), { code: j.error?.code, status: res.status });
  return j;
}
