import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/ui-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/");
await page.getByRole("heading", { name: "One voice core. A dispatcher for every trade." }).waitFor();
await pause(1200);
await page.getByRole("link", { name: "Talk to Fennwick Comfort" }).click();
await page.getByRole("heading", { name: "Leave if you smell gas. Book the rest." }).waitFor();
await page.locator(".orb").first().waitFor();
await pause(900);
const stage = page.locator("#console");
await stage.evaluate((node) => node.setAttribute("data-state", "listening"));
await pause(700);
await stage.evaluate((node) => {
  node.setAttribute("data-state", "speaking");
  node.querySelector("#transcript")?.insertAdjacentHTML(
    "beforeend",
    "<li data-final='true'><b>Dispatch</b><span>Leave the building and call 911. I will not book a window.</span></li>",
  );
  node.querySelector("#tools")?.insertAdjacentHTML(
    "beforeend",
    "<li data-status='ok'><span class='name'>escalate_on_call</span><span class='state'>ok</span></li>",
  );
});
await page.getByText("escalate_on_call").waitFor();
await pause(1400);
await page.goto("http://127.0.0.1:4317/v/hvac/board");
await page.getByRole("heading", { name: "Maya Chen" }).waitFor();
await pause(1100);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
