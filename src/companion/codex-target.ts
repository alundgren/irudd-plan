import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { CompanionConfig } from "./config.js";

export function codexEnvironment(config: CompanionConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: config.codexHome,
  };
  for (const variable of Object.values(config.headersEnv)) delete env[variable];
  return env;
}

/** Read stored metadata through Codex. Never resume or start the target thread. */
export async function verifyCodexTarget(config: CompanionConfig) {
  const expectedCwd = await realpath(config.cwd);
  const { child, lines } = startTargetReader(config);
  try {
    const thread = await readStoredThread({ child, lines }, config.threadId);
    if (
      thread.id !== config.threadId ||
      thread.archived ||
      (await realpath(thread.cwd)) !== expectedCwd
    )
      throw new Error(
        "Codex thread is archived or its working directory does not match the configured target",
      );
  } finally {
    lines.close();
    child.stdin.end();
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }
  }
}

function startTargetReader(config: CompanionConfig) {
  const child = spawn(config.codexBinary, ["app-server", "--stdio"], {
    cwd: config.cwd,
    env: codexEnvironment(config),
    stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = createInterface({ input: child.stdout });
  return { child, lines };
}

function readStoredThread(
  { child, lines }: ReturnType<typeof startTargetReader>,
  threadId: string,
) {
  return new Promise<{
    id: string;
    cwd: string;
    archived?: boolean;
  }>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Codex target verification timed out")),
      20_000,
    );
    const settle = (
      error?: Error,
      value?: { id: string; cwd: string; archived?: boolean },
    ) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    child.once("error", () =>
      settle(new Error("Unable to start Codex for target verification")),
    );
    child.once("exit", () =>
      settle(new Error("Codex closed before target verification")),
    );
    child.stdin.on("error", () =>
      settle(new Error("Codex input connection failed")),
    );
    const send = (value: unknown) =>
      child.stdin.write(`${JSON.stringify(value)}\n`);
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line) as {
          id?: number;
          error?: unknown;
          result?: {
            thread?: { id: string; cwd: string; archived?: boolean };
          };
        };
        if (event.error)
          return settle(
            new Error(
              "Codex rejected target lookup. Check thread ID, version and Codex home.",
            ),
          );
        if (event.id === 1) {
          send({ method: "initialized" });
          send({
            id: 2,
            method: "thread/read",
            params: { threadId: threadId, includeTurns: false },
          });
        } else if (event.id === 2) {
          if (!event.result?.thread)
            return settle(new Error("Codex returned no thread metadata"));
          settle(undefined, event.result.thread);
        }
      } catch {
        settle(new Error("Invalid Codex target response"));
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "irudd-plan-companion", version: "1" },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
