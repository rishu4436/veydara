import { defineConfig, devices } from "@playwright/test";

/**
 * E2E on a CONTROLLED dataset: VEYDARA_DATASET=fixture serves the committed, labelled
 * Base recordings (fixtures/chain) and the committed fork evidence (fixtures/fork).
 * The fork RPC is pointed at a closed port so no live fork is ever touched.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "tests/e2e",
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
    env: { VEYDARA_DATASET: "fixture", FORK_RPC_URL: "http://127.0.0.1:9", FORK_RECORDS_DIR: "/tmp/veydara-e2e-empty-records", CMC_API_KEY: "" },
  },
});
