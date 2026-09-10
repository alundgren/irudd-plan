import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { decode } from "../contract/plan.js";
import { SyncCursor } from "../contract/sync.js";
import { bindingId, type CompanionConfig } from "./config.js";

const Attempt = Schema.Struct({
  operationId: Schema.String,
  through: SyncCursor,
});
const State = Schema.Struct({
  version: Schema.Literal(1),
  binding: Schema.String,
  cursor: SyncCursor,
  queuedThrough: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  lastReceipt: Schema.optionalKey(Schema.String),
  attempt: Schema.optionalKey(Attempt),
});
export type CompanionState = typeof State.Type;

export class CompanionJournal {
  constructor(private readonly config: CompanionConfig) {}

  async lock() {
    await mkdir(this.config.stateDirectory, { recursive: true, mode: 0o700 });
    const path = join(this.config.stateDirectory, "run.lock");
    const file = await open(path, "wx", 0o600).catch(() => {
      throw new Error(
        `Companion state is locked. Check that no companion is running before removing ${path}`,
      );
    });
    await file.writeFile(String(process.pid));
    return async () => {
      await file.close();
      await unlink(path);
    };
  }

  async read(): Promise<CompanionState | undefined> {
    let body: string;
    try {
      body = await readFile(
        join(this.config.stateDirectory, "state.json"),
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const state = decode(State, JSON.parse(body));
    if (state.binding !== bindingId(this.config))
      throw new Error(
        "State belongs to a different plan, owner or Codex target. Use a separate state directory.",
      );
    return state;
  }

  async write(state: CompanionState) {
    const path = join(this.config.stateDirectory, "state.json");
    const file = await open(`${path}.tmp`, "w", 0o600);
    try {
      await file.writeFile(JSON.stringify(state, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(`${path}.tmp`, path);
    const directory = await open(this.config.stateDirectory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}

export function resolveAttempt(
  state: CompanionState,
  operationId: string,
  outcome: "queued" | "not-queued",
): CompanionState {
  if (!state.attempt || state.attempt.operationId !== operationId)
    throw new Error("Operation ID does not match the uncertain attempt");
  const { attempt, ...rest } = state;
  return outcome === "queued"
    ? {
        ...rest,
        cursor: attempt.through,
        queuedThrough: attempt.through.revision,
      }
    : rest;
}
