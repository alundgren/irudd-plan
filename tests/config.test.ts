import { describe, expect, it } from "vite-plus/test";

import { loadConfig } from "../src/server/config.js";
import { issuer, mappings } from "./test-service.js";

const base = {
  CF_ACCESS_ISSUER: issuer,
  CF_ACCESS_AUDIENCE: "audience",
  OWNER_MAPPINGS_JSON: JSON.stringify(mappings),
};

describe("server configuration", () => {
  it("uses separate browser and MCP Access audiences when configured", () => {
    expect(loadConfig(base).browserAccessAudience).toBe("audience");
    const config = loadConfig({
      ...base,
      CF_ACCESS_BROWSER_AUDIENCE: "browser-audience",
    });
    expect(config.accessAudience).toBe("audience");
    expect(config.browserAccessAudience).toBe("browser-audience");
    expect(() =>
      loadConfig({ ...base, CF_ACCESS_BROWSER_AUDIENCE: "" }),
    ).toThrow(/required/);
  });
  it("keeps GitHub optional but requires its secret and mappings together", () => {
    expect(loadConfig(base).github).toBeUndefined();
    expect(() => loadConfig({ ...base, GITHUB_APP_ID: "123" })).toThrow(
      /must be set together/,
    );
  });

  it("parses operator-approved installations without credentials in the mapping", () => {
    const config = loadConfig({
      ...base,
      PUBLIC_BASE_URL: "https://plans.example/",
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "line-one\\nline-two",
      OWNER_GITHUB_INSTALLATIONS_JSON: JSON.stringify([
        {
          ownerId: "owner-a",
          installationId: 456,
          repositories: [{ owner: "example", name: "project" }],
        },
      ]),
    });
    expect(config.publicBaseUrl).toBe("https://plans.example");
    expect(config.github).toMatchObject({
      appId: "123",
      privateKey: "line-one\nline-two",
      installations: [
        {
          ownerId: "owner-a",
          installationId: 456,
          repositories: [{ owner: "example", name: "project" }],
        },
      ],
    });
  });
});
