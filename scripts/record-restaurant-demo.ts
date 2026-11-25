import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/restaurant-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/v/restaurant/board");
await page.getByRole("heading", { name: "Kitchen board" }).waitFor();
await pause(1200);
await page.getByText("sesame").waitFor();
await pause(900);
await page.getByRole("button", { name: "Fire sample ticket" }).click();
await page.getByRole("heading", { name: "Walk-in Demo" }).waitFor();
await pause(1200);
await page.getByRole("link", { name: "Menu" }).click();
await page.getByRole("heading", { name: "Cider chicken" }).waitFor();
await pause(1000);
await page.getByRole("link", { name: "Board" }).click();
await page.getByRole("heading", { name: "Kitchen board" }).waitFor();
await pause(1000);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
