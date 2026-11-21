#!/usr/bin/env node
/**
 * Probes which CMC endpoints the configured key can access, at minimal credit cost.
 * Reads CMC_API_KEY from process.env only. Never prints or writes the key.
 * Writes: fixtures/cmc/plan-probe.live.json and fixtures/cmc/<name>.pro.live.json (response bodies, labeled).
 */
import { writeFileSync } from "node:fs";
const KEY = process.env.CMC_API_KEY;
if (!KEY) { console.error("CMC_API_KEY not set"); process.exit(1); }
const BASE = "https://pro-api.coinmarketcap.com";
const out = { _fixture: { kind: "live-probe", note: "Recorded live from CMC Pro API with the project key (key not stored).", recordedAt: new Date().toISOString() }, keyInfo: null, probes: [] };
const save = process.argv.includes("--save");

async function call(name, path, params = {}, keep = true) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "X-CMC_PRO_API_KEY": KEY, Accept: "application/json" } });
  const j = await r.json().catch(() => null);
  const st = j?.status ?? {};
  const row = { name, path, params, http: r.status, error_code: st.error_code ?? null, error_message: st.error_message ?? null, credit_count: st.credit_count ?? null, accessible: r.ok && String(st.error_code ?? 0) === "0" };
  out.probes.push(row);
  console.log(`${row.accessible ? "OK " : "NO "} ${r.status} ${path} credits=${row.credit_count} ${row.error_message ?? ""}`);
  if (save && keep && row.accessible) writeFileSync(`fixtures/cmc/${name}.pro.live.json`, JSON.stringify({ _fixture: { kind: "live-recording", endpoint: path, params, recordedAt: new Date().toISOString(), note: "LIVE response recorded with the project key (key not stored). Point-in-time; not refreshed." }, ...j }, null, 1));
  return j;
}

const ki = await call("key-info", "/v1/key/info", {}, false);
out.keyInfo = { plan: ki?.data?.plan ?? null, usageMonth: ki?.data?.usage?.current_month ?? null, notice: ki?.status?.notice ?? null };

const map = await call("rwa-map", "/v5/real-world-assets/map", { limit: "5000" });
const nvda = map?.data?.rwa_assets?.find((a) => a.symbol === "NVDA");
const rid = String(nvda?.rwa_id ?? 2);
await call("rwa-info-nvda", "/v5/real-world-assets/info", { rwa_id: rid });
await call("rwa-quotes-latest-nvda", "/v5/real-world-assets/quotes/latest", { rwa_id: rid });
await call("rwa-quotes-historical-nvda", "/v5/real-world-assets/quotes/historical", { rwa_id: rid, count: "5" });
const il = await call("rwa-issuers-list", "/v5/real-world-assets/issuers/list", {});
const firstIssuer = il?.data?.issuers?.[0]?.issuer_id;
if (firstIssuer) await call("rwa-issuer-first", "/v5/real-world-assets/issuers", { issuer_id: firstIssuer });
await call("rwa-market-pairs", "/v5/real-world-assets/market-pairs/list", { rwa_id: rid, limit: "1" }, false);
await call("ohlcv-v5-nvdac-daily", "/v5/cryptocurrency/ohlcv/historical", { id: "42461", interval: "daily", count: "5" });
await call("ohlcv-v5-eth-hourly", "/v5/cryptocurrency/ohlcv/historical", { id: "1027", interval: "hourly", count: "5" });
await call("quotes-v3-eth", "/v3/cryptocurrency/quotes/latest", { id: "1027" }, false);
await call("dex-token-nvdac", "/v1/dex/token", { platform: "base", address: "0x04689a41629776563E6822F76f2e57D148d28513".toLowerCase() }, false);
await call("cmc-ai-map", "/v5/cmc-ai/coins/map", { crypto_id: "1" }, false);
await call("cmc-ai-latest", "/v5/cmc-ai/latest", { type: "top_news" });
writeFileSync("fixtures/cmc/plan-probe.live.json", JSON.stringify(out, null, 1));
console.log("total credits:", out.probes.reduce((s, p) => s + (p.credit_count ?? 0), 0));
