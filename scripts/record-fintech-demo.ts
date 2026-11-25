import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/fintech-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/v/fintech");
await page.getByRole("heading", { name: "Last four. Never the whole card." }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Cases" }).first().click();
await page.getByRole("heading", { name: "Cases" }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Accounts" }).click();
await page.getByText("••••4412").waitFor();
await pause(1100);
await page.getByRole("link", { name: "Cases" }).first().click();
await page.getByRole("button", { name: "Simulate outbound reminder" }).click();
await page.getByText("attempt to collect a debt").waitFor();
await pause(1100);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
