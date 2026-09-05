import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Authenticator, TestAccessVerifier } from "../src/auth/authentication.js";
import type { CredentialMapping } from "../src/database/store.js";
import { PlanStore } from "../src/database/store.js";
import { PlanService } from "../src/domain/plan-service.js";
import { createMcpHttpServer } from "../src/mcp/server.js";

export const issuer = "https://example.cloudflareaccess.com";
export const mappings: ReadonlyArray<CredentialMapping> = [
  { issuer, claim: "common_name", value: "service-a", kind: "service", ownerId: "owner-a" },
  { issuer, claim: "common_name", value: "service-a-2", kind: "service", ownerId: "owner-a" },
  { issuer, claim: "common_name", value: "service-b", kind: "service", ownerId: "owner-b" },
  { issuer, claim: "email", value: "person@example.com", kind: "browser", ownerId: "owner-a" },
];

export async function createTestStore(filename?: string): Promise<PlanStore> {
  const directory =
    filename === undefined ? await mkdtemp(join(tmpdir(), "irudd-plan-")) : undefined;
  const store = new PlanStore(filename ?? join(directory!, "plans.db"), resolve("drizzle"));
  await store.migrate();
  await store.configureOwners(mappings);
  return store;
}

export async function startTestServer(filename?: string) {
  const store = await createTestStore(filename);
  const verifier = new TestAccessVerifier(
    new Map([
      ["token-a", { issuer, claims: { common_name: "service-a" } }],
      ["token-a-2", { issuer, claims: { common_name: "service-a-2" } }],
      ["token-b", { issuer, claims: { common_name: "service-b" } }],
      ["unknown", { issuer, claims: { common_name: "not-mapped" } }],
    ]),
    new Set(["expired"]),
  );
  const server = createMcpHttpServer(
    new PlanService(store),
    new Authenticator(verifier, store, "service"),
  );
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Missing test server address");
  return {
    store,
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      ),
  };
}
