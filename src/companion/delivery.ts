import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SyncCursor } from "../contract/sync.js";
import type { StoredPlanningEntry } from "../contract/planning.js";
import type { PlanningPage } from "../domain/conversation-sync.js";
import { digest } from "../domain/validate-plan.js";
import { sameCursor } from "../domain/sync-cursor.js";
import type { CompanionConfig } from "./config.js";
import type { CompanionState } from "./state.js";
import { codexEnvironment } from "./codex-target.js";

export interface DeliveryBatch {
  readonly operationId: string;
  readonly human: boolean;
  readonly through: SyncCursor;
}

export async function readBatches(
  planId: string,
  from: SyncCursor,
  read: (cursor: SyncCursor) => Promise<PlanningPage>,
): Promise<DeliveryBatch[]> {
  let cursor = from;
  let target: number | undefined;
  const batches: DeliveryBatch[] = [];
  do {
    const page = await read(cursor);
    if (
      page.planId !== planId ||
      page.status === "reset_required" ||
      !sameCursor(page.baseCursor, cursor)
    )
      throw new Error(
        "Conversation history changed. Stop and rebind after reviewing saved answers.",
      );
    target ??= page.headCursor.revision;
    let verified = cursor;
    for (const entry of page.entries) {
      if (entry.revision !== verified.revision + 1)
        throw new Error("Conversation revisions are not consecutive");
      verified = {
        revision: entry.revision,
        digest: digest({ previousDigest: verified.digest, entry }),
      };
      if (entry.revision <= target) appendBatch(batches, entry, verified);
    }
    if (!sameCursor(page.cursor, verified))
      throw new Error("Conversation digest verification failed");
    if (cursor.revision < target && verified.revision === cursor.revision)
      throw new Error("Conversation stopped before the advertised revision");
    cursor = verified;
  } while (cursor.revision < target);
  return batches;
}

function appendBatch(
  batches: DeliveryBatch[],
  entry: StoredPlanningEntry,
  cursor: SyncCursor,
) {
  const human = entry.author === "human";
  if (human && !entry.operationId)
    throw new Error("Human answer batch has no operation ID");
  const operationId = entry.operationId ?? entry.id;
  const last = batches.at(-1);
  const batch = { operationId, human, through: cursor };
  if (last?.operationId === operationId && last.human === human)
    batches[batches.length - 1] = batch;
  else batches.push(batch);
}

export async function deliverBatches(
  initial: CompanionState,
  batches: readonly DeliveryBatch[],
  save: (state: CompanionState) => Promise<void>,
  queue: (batch: DeliveryBatch) => Promise<string>,
) {
  if (initial.attempt)
    throw new Error(
      `Delivery outcome is uncertain for ${initial.attempt.operationId}. Resolve it before restarting.`,
    );
  let state = initial;
  for (const batch of batches) {
    if (batch.human) {
      await save({
        ...state,
        attempt: { operationId: batch.operationId, through: batch.through },
      });
      const receipt = await queue(batch);
      state = {
        ...state,
        cursor: batch.through,
        queuedThrough: batch.through.revision,
        lastReceipt: receipt,
      };
    } else state = { ...state, cursor: batch.through };
    await save(state);
  }
  return state;
}

export async function queueBatch(
  config: CompanionConfig,
  batch: DeliveryBatch,
): Promise<string> {
  const message = `Canvas answers saved. Use $irudd-plan to continue the existing planning discussion within its authorized scope. Plan: ${JSON.stringify(config.planId)}. Expected owner: ${JSON.stringify(config.ownerId)}. Answer batch: ${JSON.stringify(batch.operationId)}. Read new get_planning entries through revision ${batch.through.revision}; do not infer implementation or publication approval. A queue companion is delivering answers to this thread. After posting further questions, finish the turn instead of polling.`;
  const env = codexEnvironment(config);
  try {
    const { stdout } = await promisify(execFile)(
      config.codexBinary,
      ["queue", "--thread", config.threadId, "--message", message],
      {
        cwd: config.cwd,
        env,
        timeout: 30_000,
        maxBuffer: 64_000,
      },
    );
    const receipt = stdout.trim();
    if (
      !new RegExp(
        `^Queued message [a-f0-9-]+ for thread ${config.threadId}\\.$`,
        "i",
      ).test(receipt)
    )
      throw new Error("Unexpected queue receipt");
    return receipt;
  } catch {
    // Failure can occur after the queue commit. Never turn uncertainty into a retry.
    throw new Error(
      `Queue outcome is uncertain for ${batch.operationId}. Inspect the linked session before resolving this attempt.`,
    );
  }
}
