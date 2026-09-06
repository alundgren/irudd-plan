import { defineConfig } from "@playwright/test";

const endpoint = process.env.IRUDD_SMOKE_URL;
if (endpoint && !process.env.IRUDD_BROWSER_STATE)
  throw new Error(
    "IRUDD_BROWSER_STATE must name a private browser storage-state file",
  );

export default defineConfig({
  testDir: "tests/smoke",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: endpoint ?? "http://127.0.0.1:4173",
    ...(endpoint
      ? { storageState: process.env.IRUDD_BROWSER_STATE! }
      : { extraHTTPHeaders: { authorization: "Bearer browser-a" } }),
    screenshot: "off",
    trace: "off",
  },
  ...(endpoint
    ? {}
    : {
        webServer: {
          command: "vp run build:client && vp run test:browser:server",
          port: 4173,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }),
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
