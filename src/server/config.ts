import { resolve } from "node:path";

import type { CredentialMapping } from "../database/store.js";
import type { GitHubInstallationMapping } from "../github/github-app.js";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly migrationsFolder: string;
  readonly requestBodyLimitBytes: number;
  readonly maxAssetBytes: number;
  readonly maxAssetSourceBytes: number;
  readonly maxOwnerAssetStorageBytes: number;
  readonly clientAssetsDirectory: string;
  readonly accessIssuer: string;
  readonly accessAudience: string;
  readonly browserAccessAudience: string;
  readonly accessJwksUrl: string;
  readonly credentialMappings: ReadonlyArray<CredentialMapping>;
  readonly publicBaseUrl: string;
  readonly github?: {
    readonly appId: string;
    readonly privateKey: string;
    readonly apiUrl: string;
    readonly installations: ReadonlyArray<GitHubInstallationMapping>;
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const accessIssuer = required(environment, "CF_ACCESS_ISSUER").replace(
    /\/$/,
    "",
  );
  requireHttpsUrl(accessIssuer, "CF_ACCESS_ISSUER");
  const rawMappings = JSON.parse(
    required(environment, "OWNER_MAPPINGS_JSON"),
  ) as unknown;
  if (!Array.isArray(rawMappings) || rawMappings.length === 0) {
    throw new Error("OWNER_MAPPINGS_JSON must contain at least one mapping");
  }
  const credentialMappings = rawMappings.map((value, index) =>
    parseMapping(value, index),
  );
  if (credentialMappings.some((mapping) => mapping.issuer !== accessIssuer)) {
    throw new Error("Every owner mapping issuer must match CF_ACCESS_ISSUER");
  }
  if (!credentialMappings.some((mapping) => mapping.kind === "service")) {
    throw new Error("OWNER_MAPPINGS_JSON must contain a service identity");
  }
  const accessJwksUrl =
    environment.CF_ACCESS_JWKS_URL ?? `${accessIssuer}/cdn-cgi/access/certs`;
  requireHttpsUrl(accessJwksUrl, "CF_ACCESS_JWKS_URL");
  const publicBaseUrl = environment.PUBLIC_BASE_URL ?? "http://localhost:3000";
  requireHttpUrl(publicBaseUrl, "PUBLIC_BASE_URL");
  const github = parseGitHub(environment);
  return {
    host: environment.HOST ?? "0.0.0.0",
    port: parseInteger(environment.PORT ?? "3000", "PORT"),
    databasePath: environment.DATABASE_PATH ?? "/data/irudd-plan.db",
    migrationsFolder: resolve(environment.MIGRATIONS_DIR ?? "drizzle"),
    requestBodyLimitBytes: parseInteger(
      environment.REQUEST_BODY_LIMIT_BYTES ?? "12000000",
      "REQUEST_BODY_LIMIT_BYTES",
    ),
    maxAssetBytes: parseInteger(
      environment.MAX_ASSET_BYTES ?? "5000000",
      "MAX_ASSET_BYTES",
    ),
    maxAssetSourceBytes: parseInteger(
      environment.MAX_ASSET_SOURCE_BYTES ?? "2000000",
      "MAX_ASSET_SOURCE_BYTES",
    ),
    maxOwnerAssetStorageBytes: parseInteger(
      environment.MAX_OWNER_ASSET_STORAGE_BYTES ?? "100000000",
      "MAX_OWNER_ASSET_STORAGE_BYTES",
    ),
    clientAssetsDirectory: resolve(
      environment.CLIENT_ASSETS_DIR ?? "dist/client/assets",
    ),
    accessIssuer,
    accessAudience: required(environment, "CF_ACCESS_AUDIENCE"),
    browserAccessAudience:
      environment.CF_ACCESS_BROWSER_AUDIENCE === undefined
        ? required(environment, "CF_ACCESS_AUDIENCE")
        : required(environment, "CF_ACCESS_BROWSER_AUDIENCE"),
    accessJwksUrl,
    credentialMappings,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    ...(github === undefined ? {} : { github }),
  };
}

function parseGitHub(environment: NodeJS.ProcessEnv): ServerConfig["github"] {
  const values = [
    environment.GITHUB_APP_ID,
    environment.GITHUB_APP_PRIVATE_KEY,
    environment.OWNER_GITHUB_INSTALLATIONS_JSON,
  ];
  if (values.every((value) => value === undefined)) return undefined;
  if (values.some((value) => value === undefined)) {
    throw new Error(
      "GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY and OWNER_GITHUB_INSTALLATIONS_JSON must be set together",
    );
  }
  const raw = JSON.parse(values[2]!) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "OWNER_GITHUB_INSTALLATIONS_JSON must contain at least one mapping",
    );
  }
  return {
    appId: requiredString(values[0], "GITHUB_APP_ID"),
    privateKey: requiredString(values[1], "GITHUB_APP_PRIVATE_KEY").replace(
      /\\n/g,
      "\n",
    ),
    apiUrl: (environment.GITHUB_API_URL ?? "https://api.github.com").replace(
      /\/$/,
      "",
    ),
    installations: raw.map(parseInstallation),
  };
}

function parseInstallation(
  value: unknown,
  index: number,
): GitHubInstallationMapping {
  if (value === null || typeof value !== "object") {
    throw new Error(`GitHub installation mapping ${index} must be an object`);
  }
  const mapping = value as Record<string, unknown>;
  const installationId = Number(mapping.installationId);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error(
      `GitHub installation mapping ${index} needs a positive installationId`,
    );
  }
  if (
    !Array.isArray(mapping.repositories) ||
    mapping.repositories.length === 0
  ) {
    throw new Error(`GitHub installation mapping ${index} needs repositories`);
  }
  return {
    ownerId: requiredString(
      mapping.ownerId,
      `GitHub installation mapping ${index} ownerId`,
    ),
    installationId,
    repositories: mapping.repositories.map((repository, repositoryIndex) => {
      if (repository === null || typeof repository !== "object") {
        throw new Error(
          `GitHub repository mapping ${index}.${repositoryIndex} must be an object`,
        );
      }
      const record = repository as Record<string, unknown>;
      return {
        owner: requiredString(
          record.owner,
          `GitHub repository mapping ${index}.${repositoryIndex} owner`,
        ),
        name: requiredString(
          record.name,
          `GitHub repository mapping ${index}.${repositoryIndex} name`,
        ),
      };
    }),
  };
}

function requireHttpsUrl(value: string, name: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
}

function requireHttpUrl(value: string, name: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
}

function parseMapping(value: unknown, index: number): CredentialMapping {
  if (value === null || typeof value !== "object") {
    throw new Error(`Owner mapping ${index} must be an object`);
  }
  const mapping = value as Record<string, unknown>;
  const claim = mapping.claim;
  const kind = mapping.kind;
  if (claim !== "common_name" && claim !== "sub" && claim !== "email") {
    throw new Error(`Owner mapping ${index} has an unsupported claim`);
  }
  if (kind !== "service" && kind !== "browser") {
    throw new Error(`Owner mapping ${index} has an unsupported kind`);
  }
  return {
    issuer: requiredString(
      mapping.issuer,
      `Owner mapping ${index} issuer`,
    ).replace(/\/$/, ""),
    claim,
    value: requiredString(mapping.value, `Owner mapping ${index} value`),
    kind,
    ownerId: requiredString(mapping.ownerId, `Owner mapping ${index} ownerId`),
  };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  return requiredString(environment[name], name);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseInteger(value: string, name: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new Error(`${name} must be a positive integer`);
  return result;
}
