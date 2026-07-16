import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

dotenv.config({
  path: ".env.staging.local",
});

export default defineConfig({
  testDir: __dirname,
  testMatch: ["*.spec.ts"],
  timeout: 300_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "playwright-report",
      },
    ],
    [
      "json",
      {
        outputFile: "test-results/staging-e2e/results.json",
      },
    ],
  ],

  outputDir: "test-results/staging-e2e",

  use: {
    baseURL: process.env.BASE_URL,
    viewport: {
      width: 1440,
      height: 1200,
    },
    ignoreHTTPSErrors: false,
  },

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
});
