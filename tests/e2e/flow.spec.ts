import { expect, test } from "@playwright/test";
import { installMockWallet } from "./wallet-mock";

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

test("SIWE sign-in, multi-wallet proof, intent engine, Kamino and honest signing capabilities", async ({ page }) => {
  const w = await installMockWallet(page, { count: 2 });
  // Sign in with the first wallet (SIWE on Base chain id; no transaction).
  await page.goto("/account");
  await page.getByRole("button", { name: /Browser wallet · Base/ }).click();
  await expect(page.getByTestId("connected-address")).toHaveText(w.accounts[0]!.address);
  await page.getByRole("button", { name: "Sign in with Ethereum" }).click();
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
  await expect(page.getByTestId("mainnet-signing")).toContainText("Mainnet signing (Base 8453) is disabled");
  // Session cookie is HttpOnly + SameSite=Strict; CSRF cookie is readable.
  const cookies = await page.context().cookies();
  const sess = cookies.find((c) => c.name.endsWith("veydara_session"))!;
  expect(sess.httpOnly).toBe(true);
  expect(sess.sameSite).toBe("Strict");
  expect(cookies.some((c) => c.name.endsWith("veydara_csrf") && !c.httpOnly)).toBe(true);
  // A mutating call without the CSRF header is refused.
  const noCsrf = await page.evaluate(async () => (await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status);
  expect(noCsrf).toBe(403);

  // Link a second wallet with its own SIWE proof.
  await w.use(1);
  await expect(page.getByTestId("connected-address")).toHaveText(w.accounts[1]!.address);
  await page.getByRole("button", { name: "Prove & link this wallet" }).click();
  const list = page.getByRole("list", { name: "Proven wallets" });
  await expect(list.getByRole("listitem")).toHaveCount(2);

  // Intent engine → constrained Solver Arena on the fixture position.
  await page.goto(`/strategies?address=${WALLET}`);
  await page.getByLabel("Describe your goal").fill("borrow max usdc, survive a 40% drop, keep hf above 1.5, buy a boat");
  await page.getByRole("button", { name: /Parse → constrain → solve/ }).click();
  await expect(page.getByTestId("intent-outcome")).toHaveText("solved");
  await expect(page.getByText(/Not understood \(ignored\): “buy a boat”/)).toBeVisible();
  await expect(page.getByText(/HF ≥ 1\.6667/).first()).toBeVisible();
  await expect(page.getByRole("table", { name: "Constrained solver arena" }).getByText("chosen")).toBeVisible();
  await page.getByLabel("Describe your goal").fill("survive a 95% crash");
  await page.getByRole("button", { name: /Parse → constrain → solve/ }).click();
  await expect(page.getByRole("list", { name: "Parse errors" })).toContainText("outside the allowed range");

  // Kamino (Solana) read-only adapter on the recorded snapshot.
  await page.goto("/kamino");
  await expect(page.getByRole("table", { name: "Kamino reserves" }).getByText("NVDAx")).toBeVisible();
  await page.getByRole("button", { name: "use a public sample borrower" }).click();
  await expect(page.getByTestId("kamino-distance").first()).toHaveText(/%$/);

  // Proof Center lists the intent solve; persisted policies survive for the signed-in user.
  await page.goto("/proof");
  await expect(page.getByRole("region", { name: "Intent solves" }).getByText("solved").first()).toBeVisible();
});
