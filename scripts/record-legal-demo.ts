import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/legal-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/v/legal");
await page.getByRole("heading", { name: "Tell us the facts. Not what to do about them." }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Matters" }).first().click();
await page.getByRole("heading", { name: "Matters" }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Conflicts" }).click();
await page.getByRole("heading", { name: "Clients" }).waitFor();
await pause(1100);
await page.getByRole("link", { name: "Calls" }).click();
await page.getByRole("link", { name: "Lena Ortiz" }).click();
await page.getByText("not a deadline opinion").waitFor();
await pause(1100);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
