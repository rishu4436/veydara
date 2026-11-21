import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { installMockWallet } from "../e2e/wallet-mock";

/**
 * FORK ONLY (opt-in: `pnpm fork` + `pnpm e2e:fork`). A SIWE-proven injected wallet adds/switches to the
 * local anvil fork (chain 31337) and signs the verified pipeline: supply+collateral+borrow, partial repay,
 * withdraw. Hashes are fork transactions. The test key is generated per run and never stored.
 */
test.setTimeout(240_000);

async function runPreset(page: Page, preset: RegExp) {
  await page.getByRole("button", { name: preset }).click();
  await page.getByRole("button", { name: /Prepare: validate/ }).click();
  await expect(page.getByText(/preview hash 0x[0-9a-f]{64}/)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/I reviewed this preview\. My wallet will sign/).check();
  await page.getByRole("button", { name: "Sign with my wallet on fork" }).click();
  const result = page.getByRole("region", { name: "Execution result" });
  await expect(result).toBeVisible({ timeout: 90_000 });
  await expect(result.getByText("signed by user wallet")).toBeVisible();
  await expect(result.getByText("executed", { exact: true })).toBeVisible();
  return result.getByTestId("fork-tx-hash").allInnerTexts();
}

test("user wallet signs the verified pipeline on the local fork", async ({ page }) => {
  const w = await installMockWallet(page, { count: 1 });
  await page.goto("/account");
  await page.getByRole("button", { name: /Browser wallet · Base/ }).click();
  await page.getByRole("button", { name: "Sign in with Ethereum" }).click();
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();

  await page.goto("/fork");
  await page.getByRole("radio", { name: /My wallet \(SIWE-proven\)/ }).check();
  await expect(page.getByTestId("wallet-signer")).toContainText(`Signing as ${w.accounts[0]!.address}`);
  await page.getByRole("button", { name: /Switch \/ add VEYDARA fork \(31337\)/ }).click();
  await expect.poll(() => w.state.chainId).toBe(31337);
  expect(w.state.added).toContain(31337); // added via wallet_addEthereumChain after a 4902

  await page.getByRole("button", { name: "Fund (impersonate holder)" }).click();
  await expect(page.getByText(/moved 1 NVDAc from existing holder/)).toBeVisible({ timeout: 90_000 });

  const h1 = await runPreset(page, /^1 · Supply 1 NVDAc/);
  const h2 = await runPreset(page, /^2 · Partial repay 10 USDC/);
  const h3 = await runPreset(page, /^3 · Withdraw 0\.2 NVDAc/);
  // Policy layer still applies to wallet signers: nothing is handed to the wallet.
  await page.getByRole("button", { name: /^Policy test/ }).click();
  await page.getByRole("button", { name: /Prepare: validate/ }).click();
  await expect(page.getByText(/Not signable:/)).toBeVisible({ timeout: 60_000 });

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/fork-wallet-hashes.json", JSON.stringify({ label: "FORK (anvil chain 31337)", wallet: w.accounts[0]!.address, lifecycle1: h1, repay: h2, withdraw: h3 }, null, 2));
});
