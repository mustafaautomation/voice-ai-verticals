import { expect, test } from "@playwright/test";

test("clinic front desk, schedule, and masked chart", async ({ page }) => {
  await page.goto("/v/clinic");
  await expect(page.getByRole("heading", { name: "Name and date of birth before any visit." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to the front desk" })).toBeVisible();
  await expect(page.getByText("Portfolio demo").first()).toBeVisible();
  await expect(page.getByText("no real PHI").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/clinic-home.png", fullPage: true });

  await page.getByRole("link", { name: "Schedule" }).click();
  await expect(page.getByRole("heading", { name: "Dr. Amira Solano" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/clinic-board.png", fullPage: true });

  await page.getByRole("link", { name: "Calls" }).click();
  await page.getByRole("link", { name: "Maya Chen" }).click();
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(page.locator(".transcript-block")).not.toContainText("1984-03-14");
  await expect(page.locator(".transcript-block")).toContainText("**/**/1984");
  await expect(page.locator(".transcript-block")).toContainText("(608) ***-0141");
  await page.screenshot({ path: "docs/screenshots/clinic-call.png", fullPage: true });

  await page.goto("/v/clinic/patients");
  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible();
  await expect(page.getByText("**/**/1984")).toBeVisible();
  await expect(page.getByText("••••0441")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("1984-03-14");
  await page.screenshot({ path: "docs/screenshots/clinic-patients.png", fullPage: true });

  await page.goto("/v/clinic/audit");
  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
  await expect(page.getByText("verify_identity").first()).toBeVisible();
});

test("clinic pages fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v/clinic");
  await expect(page.getByRole("button", { name: "Talk to the front desk" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/clinic-mobile.png", fullPage: true });
  await page.goto("/v/clinic/board");
  await expect(page.getByRole("heading", { name: "Lena Cho, NP" })).toBeVisible();
});
