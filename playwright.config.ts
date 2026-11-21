import { rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E on a CONTROLLED dataset: VEYDARA_DATASET=fixture serves the committed, labelled
 * Base recordings (fixtures/chain) and the committed fork evidence (fixtures/fork).
 * The fork RPC is pointed at a closed port so no live fork is ever touched.
 *
 * E2E_FORK=1 runs tests/e2e-fork instead: the user-wallet signing flow against a LOCAL anvil fork
 * (`pnpm fork` must be running). It is opt-in and never runs in CI (CI has no fork).
 */
const FORK = process.env.E2E_FORK === "1";
const PORT = Number(process.env.E2E_PORT ?? (FORK ? 3101 : 3100));
// Fresh JSON store per run (sessions, proofs) so results are deterministic.
const E2E_DATA_FILE = `/tmp/veydara-e2e-${FORK ? "fork" : "fixture"}/data.json`;
if (!process.env.TEST_WORKER_INDEX) rmSync(E2E_DATA_FILE, { force: true });
const env: Record<string, string> = FORK
  ? { VEYDARA_DATA_FILE: E2E_DATA_FILE, CMC_API_KEY: "" }
  : { VEYDARA_DATASET: "fixture", FORK_RPC_URL: "http://127.0.0.1:9", VEYDARA_DATA_FILE: E2E_DATA_FILE, CMC_API_KEY: "" };
export default defineConfig({
  testDir: FORK ? "tests/e2e-fork" : "tests/e2e",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm --filter @veydara/web exec next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/dataset`,
    timeout: 120_000,
    reuseExistingServer: false,
    env,
  },
});
