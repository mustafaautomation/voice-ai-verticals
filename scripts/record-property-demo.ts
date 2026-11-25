import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/property-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/v/property/board");
await page.getByRole("heading", { name: "Tickets" }).waitFor();
await page.getByText("LH-204").first().waitFor();
await pause(1200);
await page.getByRole("button", { name: "Open sample drip ticket" }).click();
await page.getByRole("heading", { name: "Sample drip · GM-110" }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Tours" }).click();
await page.getByRole("heading", { name: "Noor Adel" }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Tickets" }).click();
await page.getByRole("heading", { name: "Tickets" }).waitFor();
await pause(900);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
