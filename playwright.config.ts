import { defineConfig, devices } from "@playwright/test";

const port = 43173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "rm -f data/e2e.sqlite data/e2e.sqlite-shm data/e2e.sqlite-wal && tsx src/server.ts",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      DATABASE_PATH: "./data/e2e.sqlite",
      SEED_ON_BOOT: "true",
      VAPI_WEBHOOK_SECRET: "e2e-webhook-secret",
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      SMS_PROVIDER: "mock",
      TRANSFER_NUMBER: "+12185550148",
      ON_CALL_NUMBER: "+12185550190",
    },
  },
});
