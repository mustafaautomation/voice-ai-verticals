import { expect, test } from "@playwright/test";

test("platform landing and HVAC page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "One voice core. A dispatcher for every trade." })).toBeVisible();
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the HVAC demo" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/platform-landing.png", fullPage: true });

  await page.getByRole("link", { name: "Open the HVAC demo" }).click();
  await expect(page.getByRole("heading", { name: "Leave if you smell gas. Book the rest." })).toBeVisible();
  const talk = page.getByRole("button", { name: "Talk to dispatch" });
  await expect(talk).toBeVisible();
  await expect(page.getByText("Portfolio demo").first()).toBeVisible();
  await expect(page.getByText("fictional", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/hvac-home.png", fullPage: true });
});

test("dispatch board, call detail, and missed-call text", async ({ page }) => {
  await page.goto("/v/hvac/board");
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(page.getByText("Andre Brooks")).toBeVisible();
  await expect(page.getByText("Mock inbox", { exact: false })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/job-board.png", fullPage: true });

  await page.getByRole("link", { name: "Calls" }).click();
  await page.getByRole("link", { name: "Lila Nguyen" }).click();
  await expect(page.getByText("Leave the building")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/call-detail.png", fullPage: true });

  await page.goto("/v/hvac/messages");
  await page.getByLabel("Callback number").fill("218-555-0188");
  await page.getByRole("button", { name: "Simulate missed call" }).click();
  await expect(page.getByText("we missed your call").first()).toBeVisible();
  await expect(page.getByText("(218) 555-0188")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/messages.png", fullPage: true });
});

test("tool API booking shows up on the board", async ({ request, page }) => {
  const windows = await request.post("/v/hvac/vapi/tools/check_windows", {
    headers: { "x-vapi-secret": "e2e-webhook-secret" },
    data: { callId: "e2e_call", arguments: { jobType: "tune_up", priority: "routine", days: 7 } },
  });
  expect(windows.ok()).toBeTruthy();
  const start = (await windows.json()).result.windows[0].start as string;
  const booked = await request.post("/v/hvac/vapi/tools/book_job", {
    headers: { "x-vapi-secret": "e2e-webhook-secret" },
    data: {
      callId: "e2e_call",
      arguments: {
        windowStart: start,
        customerName: "E2E Caller",
        phone: "218-555-0144",
        address: "14 Lantern Court, Duluth, MN 55803",
        jobType: "tune_up",
        description: "annual furnace tune-up",
      },
    },
  });
  expect(booked.ok()).toBeTruthy();
  await page.goto("/v/hvac/board");
  await expect(page.getByRole("heading", { name: "E2E Caller" })).toBeVisible();
});

test("mobile landing does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/platform-mobile.png", fullPage: true });
  await page.goto("/v/hvac");
  await expect(page.getByRole("button", { name: "Talk to dispatch" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/hvac-mobile.png", fullPage: true });
});

test("call button shows the limit message", async ({ page }) => {
  await page.route("**/api/call-token", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ message: "You have used the 3 demo calls allowed per visitor in 24 hours." }),
    }),
  );
  await page.goto("/v/hvac");
  await page.getByRole("button", { name: "Talk to dispatch" }).click();
  await expect(page.locator("#status")).toContainText("3 demo calls");
  await expect(page.locator("#console")).toHaveAttribute("data-state", "limited");
});

test("search miss and customers", async ({ page }) => {
  await page.goto("/v/hvac/calls?q=no-such-person");
  await expect(page.getByText("No calls match that search.")).toBeVisible();
  await page.goto("/v/hvac/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByText("Priya Shah")).toBeVisible();
});
