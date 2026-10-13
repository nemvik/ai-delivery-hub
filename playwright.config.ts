import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15000,
    baseURL: "http://127.0.0.1:4317",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:4317",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      HUB_DATA_DIR: resolve(".test-data/e2e-" + Date.now()),
      HUB_PORT: "4317",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
