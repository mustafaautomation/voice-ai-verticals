import { expect, test } from "@playwright/test";

test("Larkglass board, menu, and a sample ticket", async ({ page }) => {
  await page.goto("/v/restaurant");
  await expect(page.getByRole("heading", { name: "A table, a ticket, and the allergy on the dupe." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to Larkglass" })).toBeVisible();
  await expect(page.getByText("not a real restaurant").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/restaurant-home.png", fullPage: true });

  await page.getByRole("link", { name: "Board" }).click();
  await expect(page.getByRole("heading", { name: "Kitchen board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(page.getByText("sesame")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/restaurant-board.png", fullPage: true });

  await page.getByRole("button", { name: "Fire sample ticket" }).click();
  await expect(page.getByRole("heading", { name: "Walk-in Demo" })).toBeVisible();
  await expect(page.getByText("Nothing was charged")).toBeVisible();

  await page.getByRole("link", { name: "Menu" }).click();
  await expect(page.getByRole("heading", { name: "Cider chicken" })).toBeVisible();
  await expect(page.getByText("contains fish")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/restaurant-menu.png", fullPage: true });

  await page.getByRole("link", { name: "Calls" }).click();
  await page.getByRole("link", { name: "Maya Chen" }).click();
  await expect(page.getByText("can't say the plate is safe")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/restaurant-call.png", fullPage: true });
});

test("Larkglass fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v/restaurant");
  await expect(page.getByRole("button", { name: "Talk to Larkglass" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/restaurant-mobile.png", fullPage: true });
});
