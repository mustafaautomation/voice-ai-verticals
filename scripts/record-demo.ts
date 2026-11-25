import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/demo-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/");
await pause(1200);
await page.getByRole("link", { name: "Open the HVAC demo" }).click();
await page.getByRole("heading", { name: "Leave if you smell gas. Book the rest." }).waitFor();
await pause(1400);
await page.getByRole("link", { name: "Dispatch board" }).click();
await page.getByRole("heading", { name: "Maya Chen" }).waitFor();
await pause(1400);
await page.getByRole("link", { name: "Texts" }).click();
await page.getByLabel("Callback number").fill("218-555-0173");
await pause(400);
await page.getByRole("button", { name: "Simulate missed call" }).click();
await page.getByRole("heading", { name: "To (218) 555-0173" }).first().waitFor();
await pause(1400);
await page.getByRole("link", { name: "Calls" }).click();
await page.getByRole("link", { name: "Lila Nguyen" }).click();
await page.getByText("Leave the building").waitFor();
await pause(1400);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
