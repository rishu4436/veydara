import { expect, test } from "@playwright/test";

/** wallet → analysis → risk → simulation → proof, on the controlled fixture dataset. */
const WALLET = "0x5771e9CD1F225eBdE88D4815587C38899604AC2a"; // public borrower recorded in fixtures/chain/aave-v4-positions.live.json (HF 6.6438)

test("wallet → analysis → risk → simulation → proof", async ({ page }) => {
  // 1. Wallet: enter a watch-only Base address.
  await page.goto("/positions");
  await expect(page.getByTestId("fixture-banner")).toBeVisible();
  await page.locator("#aave-addr").fill(WALLET);
  await page.getByRole("button", { name: "Read" }).click();
  await expect(page).toHaveURL(new RegExp(`address=${WALLET}`));

  // 2. Analysis: Spoke health factor and VEYDARA's exact bigint recomputation.
  await expect(page.getByText("6.644").first()).toBeVisible();
  await expect(page.getByText(/recomputation matches exactly/)).toBeVisible();
  await expect(page.getByText("Parallel Futures").first()).toBeVisible();

  // 3. Risk: radar + a monitor-only policy that fires.
  await page.goto(`/guardian?address=${WALLET}`);
  await expect(page.getByText(/Risk radar · 0x5771/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Risk radar, overall/ })).toBeVisible();
  const thr = page.getByLabel("Threshold for Health factor below");
  await thr.fill("7");
  await page.getByRole("button", { name: "Evaluate now" }).click();
  const alert = page.getByRole("list", { name: "Alerts" }).getByText(/Health factor 6\.644 < 7/);
  await expect(alert).toBeVisible();
  await expect(page.getByText("none (monitor-only)", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Alerts \(1 active\)/ })).toBeVisible();

  // 4. Simulation: Solver Arena verdicts from the independent verifier, then Parallel Futures.
  await page.goto(`/strategies?address=${WALLET}`);
  await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Rejected by verifier").first()).toBeVisible();
  await page.goto(`/futures?address=${WALLET}`);
  await expect(page.getByText(/Monday gap/).first()).toBeVisible();

  // 5. Proof: committed fork-execution evidence with FORK-labelled receipts.
  await page.goto("/proof");
  const fork = page.getByRole("region", { name: "Fork executions" });
  await expect(fork.getByRole("article", { name: /Lifecycle 1\/3/ })).toBeVisible();
  const hash = fork.getByRole("article", { name: /Lifecycle 1\/3/ }).getByTestId("fork-tx-hash").first();
  await expect(hash).toHaveText(/^0x[0-9a-f]{64}$/);
  await expect(fork.getByRole("article", { name: /REVERT DRILL/ }).getByText(/HealthFactorBelowThreshold/).first()).toBeVisible();
  await expect(fork.getByRole("article", { name: /Blocked/ }).getByText("blocked", { exact: true })).toBeVisible();
});

test("fork lab refuses honestly when no fork is running", async ({ page }) => {
  await page.goto("/fork");
  await expect(page.getByText(/Start a local fork with `pnpm fork`/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign & send/ })).toHaveCount(0);
});
