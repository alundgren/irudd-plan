import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
  Authenticator,
  CloudflareAccessVerifier,
} from "../auth/authentication.js";
import { PlanStore } from "../database/store.js";
import { PlanService } from "../domain/plan-service.js";
import { createMcpHttpServer } from "../mcp/server.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
await mkdir(dirname(config.databasePath), { recursive: true });

let ready = false;
const store = new PlanStore(config.databasePath, config.migrationsFolder);
await store.migrate();
await store.configureOwners(config.credentialMappings);
const verifier = new CloudflareAccessVerifier(
  config.accessIssuer,
  config.accessAudience,
  config.accessJwksUrl,
);
const authenticator = new Authenticator(verifier, store, "service");
const server = createMcpHttpServer(new PlanService(store), authenticator, {
  bodyLimitBytes: config.requestBodyLimitBytes,
  isReady: () => ready,
});

server.listen(config.port, config.host, () => {
  ready = true;
  console.log(`irudd-plan listening on http://${config.host}:${config.port}`);
});

let stopping = false;
const shutdown = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  ready = false;
  const timer = setTimeout(() => process.exit(1), 10_000).unref();
  server.close((error) => {
    clearTimeout(timer);
    if (error) {
      console.error(`Shutdown after ${signal} failed`, error);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
