import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/clinic-video", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

await page.goto("http://127.0.0.1:4317/v/clinic");
await page.getByRole("heading", { name: "Name and date of birth before any visit." }).waitFor();
await pause(1200);
await page.getByRole("link", { name: "Schedule" }).click();
await page.getByRole("heading", { name: "Dr. Amira Solano" }).waitFor();
await pause(1200);
await page.getByRole("link", { name: "Patients" }).click();
await page.getByText("**/**/1984").waitFor();
await pause(1200);
await page.getByRole("link", { name: "Calls" }).click();
await page.getByRole("link", { name: "Maya Chen" }).click();
await page.locator(".transcript-block").waitFor();
await pause(1200);
await page.goto("http://127.0.0.1:4317/v/clinic/audit");
await page.getByRole("heading", { name: "Audit" }).waitFor();
await pause(1000);
const video = page.video();
await context.close();
await browser.close();
if (video) console.log(await video.path());
