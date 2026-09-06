import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
  Authenticator,
  CloudflareAccessVerifier,
} from "../auth/authentication.js";
import { RetentionStore } from "../database/retention-store.js";
import {
  PlanRetention,
  startRetentionWorker,
} from "../domain/plan-retention.js";
import { PlanStore } from "../database/store.js";
import { PlanService } from "../domain/plan-service.js";
import { GitHubAppReader, GitHubConnection } from "../github/github-app.js";
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
const serviceAuthenticator = new Authenticator(verifier, store, "service");
const browserAuthenticator = new Authenticator(verifier, store, "browser");
const github =
  config.github === undefined
    ? undefined
    : new GitHubConnection(
        config.github.installations,
        new GitHubAppReader(
          config.github.appId,
          config.github.privateKey,
          config.github.apiUrl,
        ),
      );
const service = new PlanService(
  store,
  undefined,
  {
    maxAssetBytes: config.maxAssetBytes,
    maxSourceBytes: config.maxAssetSourceBytes,
    maxOwnerStorageBytes: config.maxOwnerAssetStorageBytes,
  },
  github,
  config.publicBaseUrl,
);
const server = createMcpHttpServer(service, serviceAuthenticator, {
  bodyLimitBytes: config.requestBodyLimitBytes,
  browserAuthenticator,
  clientAssetsDirectory: config.clientAssetsDirectory,
  isReady: () => ready,
});

server.listen(config.port, config.host, () => {
  ready = true;
  console.log(`irudd-plan listening on http://${config.host}:${config.port}`);
});

const stopRetention = startRetentionWorker(
  new PlanRetention(
    new RetentionStore(config.databasePath),
    github,
    undefined,
    service.updates,
  ),
  (error) =>
    console.error(
      "Retention batch failed; pending work will be retried",
      error,
    ),
);

let stopping = false;
const shutdown = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  stopRetention();
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
