import { expect, test } from "@playwright/test";

test("Quillmere intake, matters, and conflicts", async ({ page }) => {
  await page.goto("/v/legal");
  await expect(page.getByRole("heading", { name: "Tell us the facts. Not what to do about them." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to intake" })).toBeVisible();
  await expect(page.getByText("not a real law firm").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/legal-home.png", fullPage: true });

  await page.getByRole("link", { name: "Matters" }).click();
  await expect(page.getByRole("heading", { name: "Matters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lena Ortiz" })).toBeVisible();
  await expect(page.getByText("priority callback").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/legal-board.png", fullPage: true });

  await page.getByRole("link", { name: "Conflicts" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByText("Maya Chen")).toBeVisible();
  await expect(page.getByText("Northline Logistics")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("represents Maya");
  await page.screenshot({ path: "docs/screenshots/legal-contacts.png", fullPage: true });

  await page.getByRole("link", { name: "Calls" }).click();
  await page.getByRole("link", { name: "Lena Ortiz" }).click();
  await expect(page.getByText("not a deadline opinion")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/legal-call.png", fullPage: true });
});

test("Quillmere fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v/legal");
  await expect(page.getByRole("button", { name: "Talk to intake" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/legal-mobile.png", fullPage: true });
});
