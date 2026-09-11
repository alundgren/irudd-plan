import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${process.env.BROWSER_PORT ?? 4173}`,
    extraHTTPHeaders: { authorization: "Bearer browser-a" },
    screenshot: "only-on-failure",
    trace: process.env.UI_PROOF === "1" ? "off" : "retain-on-failure",
  },
  webServer: {
    command: "vp run build:client && vp run test:browser:server",
    port: Number(process.env.BROWSER_PORT ?? 4173),
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
