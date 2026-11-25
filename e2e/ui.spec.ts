import { expect, test } from "@playwright/test";

test("orb states and a split tool timeline", async ({ page }) => {
  await page.goto("/v/hvac");
  const stage = page.locator("#console");
  await expect(stage.locator(".orb")).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to dispatch" })).toBeVisible();
  for (const state of ["idle", "connecting", "listening", "speaking", "error"]) {
    await stage.evaluate((node, next) => {
      node.setAttribute("data-state", next);
    }, state);
    await page.screenshot({ path: `docs/screenshots/orb-${state}.png`, clip: { x: 620, y: 80, width: 560, height: 640 } });
  }
  await stage.evaluate((node) => {
    node.setAttribute("data-state", "listening");
    const transcript = node.querySelector("#transcript");
    const tools = node.querySelector("#tools");
    transcript?.insertAdjacentHTML("beforeend", "<li data-role='user' data-final='true'><b>You</b><span>The furnace died.</span></li>");
    tools?.insertAdjacentHTML("beforeend", "<li data-status='ok'><span class='name'>check_windows</span><span class='state'>ok</span></li>");
  });
  await expect(page.locator("#tools .name")).toHaveText("check_windows");
  await expect(page.locator("#transcript")).not.toContainText("check_windows");
  await page.screenshot({ path: "docs/screenshots/hvac-stage-live.png" });
});

test("reduced motion stops the orb loop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v/hvac");
  const animation = await page.locator(".orb").evaluate((node) => {
    const view = globalThis as unknown as { getComputedStyle: (el: unknown) => { animationName: string } };
    return view.getComputedStyle(node).animationName;
  });
  expect(animation === "none" || animation === "").toBeTruthy();
  await page.locator("#console").evaluate((node) => node.setAttribute("data-state", "speaking"));
  await expect(page.locator("#talk .label")).toHaveText("Dispatch is speaking…");
});

test("boards fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/v/hvac", "/v/hvac/board"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => {
      const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: "docs/screenshots/hvac-board-mobile.png", fullPage: true });
});
