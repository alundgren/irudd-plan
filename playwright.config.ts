import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 20_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    extraHTTPHeaders: { authorization: "Bearer browser-a" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "vp run build:client && vp run test:browser:server",
    port: 4173,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
