// Records REAL keyless CMC responses as clearly labeled fixtures for contract tests.
// Usage: node scripts/record-cmc-keyless.mjs   (no API key used or needed)
import { writeFileSync } from "node:fs";

const BASE = "https://pro-api.coinmarketcap.com/public-api";
const NVDAC = "0xb20000000000000000000078ee7ce2fE4908108C";
const jobs = [
  ["crypto-quotes-latest-v3.live.json", `/v3/cryptocurrency/quotes/latest?id=1027,3408,42461`],
  ["crypto-info-v2-nvdac.live.json", `/v2/cryptocurrency/info?address=${NVDAC}`],
  ["dex-token-nvdac.live.json", `/v1/dex/token?platform=base&address=${NVDAC}`],
];
for (const [file, path] of jobs) {
  const res = await fetch(BASE + path, { headers: { Accept: "application/json" } });
  const body = await res.json();
  const code = String(body?.status?.error_code ?? "");
  if (code !== "0") {
    console.error(`skip ${file}: HTTP ${res.status} error_code=${code} ${body?.status?.error_message ?? ""}`);
  } else {
    writeFileSync(
      `fixtures/cmc/${file}`,
      JSON.stringify({ _fixture: { kind: "recorded-live-response", endpoint: `/public-api${path}`, recordedAt: new Date().toISOString(), httpStatus: res.status, note: "FIXTURE: real keyless CMC response recorded for schema contract tests. Not used to render live UI." }, ...body }, null, 1),
    );
    console.log(`recorded ${file} credit_count=${body.status.credit_count}`);
  }
  await new Promise((r) => setTimeout(r, 4000));
}
