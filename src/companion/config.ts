import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Schema } from "effect";
import { decode } from "../contract/plan.js";
import { digest } from "../domain/validate-plan.js";

const Text = Schema.String.check(Schema.isMinLength(1));
const Config = Schema.Struct({
  serverUrl: Text,
  ownerId: Text,
  planId: Text,
  threadId: Schema.String.check(
    Schema.isPattern(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    ),
  ),
  stateDirectory: Text,
  cwd: Text,
  codexHome: Schema.optionalKey(Text),
  codexBinary: Schema.optionalKey(Text),
  headersEnv: Schema.Record(Schema.String, Text),
});

export type CompanionConfig = ReturnType<typeof normalize>;

function normalize(input: typeof Config.Type) {
  const url = new URL(input.serverUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "serverUrl must be an origin without credentials, query or path",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Use HTTPS, or HTTP on localhost for tests");
  const config = {
    ...input,
    serverUrl: url.origin,
    codexHome:
      input.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"),
    codexBinary: input.codexBinary ?? "codex",
  };
  for (const path of [config.stateDirectory, config.cwd, config.codexHome])
    if (!isAbsolute(path))
      throw new Error(
        "State, working directory and Codex home paths must be absolute",
      );
  if (config.codexBinary !== "codex" && !isAbsolute(config.codexBinary))
    throw new Error("codexBinary must be codex or an absolute executable path");
  return config;
}

export async function loadCompanionConfig(path: string) {
  return normalize(decode(Config, JSON.parse(await readFile(path, "utf8"))));
}

export function bindingId(config: CompanionConfig) {
  return digest({
    server: config.serverUrl,
    owner: config.ownerId,
    plan: config.planId,
    thread: config.threadId,
    home: config.codexHome,
    cwd: config.cwd,
    binary: config.codexBinary,
  });
}

export function companionHeaders(config: CompanionConfig) {
  const headers: Record<string, string> = {};
  for (const [name, variable] of Object.entries(config.headersEnv)) {
    const value = process.env[variable];
    if (!value)
      throw new Error(`Missing credential environment variable: ${variable}`);
    headers[name] = value;
  }
  return headers;
}
