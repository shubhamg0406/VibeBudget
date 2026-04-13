import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: "npm run dev:test",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
