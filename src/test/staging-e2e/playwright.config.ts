import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: __dirname,
  testMatch: ["creditCardSuccess.spec.ts"],
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results/staging-e2e",
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        video: "retain-on-failure",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        navigationTimeout: 60_000,
        actionTimeout: 30_000,
      },
    },
  ],
  use: {
    baseURL: process.env.BASE_URL,
    ignoreHTTPSErrors: false,
    viewport: { width: 1440, height: 1200 },
  },
});
