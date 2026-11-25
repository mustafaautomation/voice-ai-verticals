import { expect, test } from "@playwright/test";

test("Wrenline desk, accounts, and reminder", async ({ page }) => {
  await page.goto("/v/fintech");
  await expect(page.getByRole("heading", { name: "Last four. Never the whole card." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to Wrenline" })).toBeVisible();
  await expect(page.getByText("not a bank").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/fintech-home.png", fullPage: true });

  await page.getByRole("link", { name: "Cases" }).click();
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate outbound reminder" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/fintech-board.png", fullPage: true });

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page.getByText("••••4412")).toBeVisible();
  await expect(page.getByText("Do not discuss")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("4111111111111111");
  await page.screenshot({ path: "docs/screenshots/fintech-accounts.png", fullPage: true });

  await page.getByRole("link", { name: "Cases" }).click();
  await page.getByRole("button", { name: "Simulate outbound reminder" }).click();
  await expect(page.getByText("attempt to collect a debt")).toBeVisible();
  await expect(page.locator(".transcript-block")).toContainText("does not");
  await page.screenshot({ path: "docs/screenshots/fintech-call.png", fullPage: true });
});

test("Wrenline fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v/fintech");
  await expect(page.getByRole("button", { name: "Talk to Wrenline" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/fintech-mobile.png", fullPage: true });
});
