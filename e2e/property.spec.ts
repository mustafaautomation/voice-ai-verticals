import { expect, test } from "@playwright/test";

test("Bramblefen tickets, tours, and a sample drip", async ({ page }) => {
  await page.goto("/v/property");
  await expect(page.getByRole("heading", { name: "Leave for gas. A drip can wait until morning." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to Bramblefen" })).toBeVisible();
  await expect(page.getByText("not a real property manager").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/property-home.png", fullPage: true });

  await page.getByRole("link", { name: "Tickets" }).click();
  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
  await expect(page.getByText("LH-204").first()).toBeVisible();
  await expect(page.getByText("emergency").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/property-board.png", fullPage: true });

  await page.getByRole("button", { name: "Open sample drip ticket" }).click();
  await expect(page.getByRole("heading", { name: "Sample drip · GM-110" })).toBeVisible();

  await page.getByRole("link", { name: "Tours" }).click();
  await expect(page.getByRole("heading", { name: "Noor Adel" })).toBeVisible();
  await expect(page.getByText("LH-310").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/property-tours.png", fullPage: true });

  await page.getByRole("link", { name: "Calls" }).click();
  await page.getByRole("link", { name: "Maya Chen" }).click();
  await expect(page.getByText("call 911")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/property-call.png", fullPage: true });
});

test("Bramblefen fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v/property");
  await expect(page.getByRole("button", { name: "Talk to Bramblefen" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/property-mobile.png", fullPage: true });
});
