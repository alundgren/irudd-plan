import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { CompanionClient, CompanionHttpError } from "./client.js";
import { bindingId, type CompanionConfig } from "./config.js";
import { deliverBatches, queueBatch, readBatches } from "./delivery.js";
import { CompanionJournal, type CompanionState } from "./state.js";
import { verifyCodexTarget } from "./codex-target.js";

export async function initializeCompanion(
  config: CompanionConfig,
  journal: CompanionJournal,
) {
  if (await journal.read())
    throw new Error(
      "Already initialized. Use run to preserve the saved cursor.",
    );
  const client = new CompanionClient(config);
  await client.verify();
  await verifyCodexTarget(config);
  const page = await client.page();
  if (page.planId !== config.planId || page.status === "reset_required")
    throw new Error("Cannot establish a conversation baseline");
  await journal.write({
    version: 1,
    binding: bindingId(config),
    cursor: page.headCursor,
    queuedThrough: 0,
  });
  console.log(
    `Bound plan ${config.planId} to Codex thread ${config.threadId}. Only human entries after revision ${page.headCursor.revision} will be queued.`,
  );
}

export async function runCompanion(
  config: CompanionConfig,
  journal: CompanionJournal,
  signal: AbortSignal,
) {
  let state = await journal.read();
  if (!state)
    throw new Error(
      "Run init first to select the thread and exclude old answers.",
    );
  if (state.attempt)
    throw new Error(
      `Resolve uncertain operation ${state.attempt.operationId} before running.`,
    );
  const client = new CompanionClient(config);
  await client.verify();
  await verifyCodexTarget(config);
  let failures = 0;
  while (!signal.aborted) {
    const connectionId = randomUUID();
    let synchronized = false;
    try {
      for await (const event of client.events(connectionId, signal)) {
        if (signal.aborted) return;
        if (event.includes("event: planning-update")) {
          const line = event
            .split("\n")
            .find((value) => value.startsWith("data: "));
          if (!line) throw new Error("Planning event has no revision");
          const { revision, digest } = JSON.parse(line.slice(6)) as {
            revision: number;
            digest: string;
          };
          // Always reconcile the first event after reconnect to detect restored history.
          if (
            revision !== state.cursor.revision ||
            digest !== state.cursor.digest ||
            !synchronized
          ) {
            state = await deliverPending(
              config,
              journal,
              client,
              connectionId,
              state,
              signal,
            );
            synchronized = true;
          }
        }
        await client.report(
          connectionId,
          state.queuedThrough ? "queued" : "listening",
          state.queuedThrough,
        );
        failures = 0;
      }
    } catch (error) {
      const saved = await journal.read();
      if (saved?.attempt) {
        await client
          .report(connectionId, "uncertain", state.queuedThrough)
          .catch(() => {});
        throw error;
      }
      if (signal.aborted) return;
      if (error instanceof CompanionHttpError && error.status < 500)
        throw error;
      if (!isConnectionFailure(error)) throw error;
    }
    failures = Math.max(0, failures) + 1;
    console.log("Companion disconnected; reconnecting from the saved cursor.");
    await delay(
      Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)),
      undefined,
      { signal },
    ).catch(() => {});
  }
}

function isConnectionFailure(error: unknown) {
  return (
    error instanceof TypeError ||
    error instanceof CompanionHttpError ||
    (error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name))
  );
}

async function deliverPending(
  config: CompanionConfig,
  journal: CompanionJournal,
  client: CompanionClient,
  connectionId: string,
  state: CompanionState,
  signal: AbortSignal,
) {
  const batches = await readBatches(config.planId, state.cursor, (cursor) =>
    client.page(cursor),
  );
  try {
    return await deliverBatches(
      state,
      batches,
      (next) => journal.write(next),
      async (batch) => {
        if (signal.aborted)
          throw new Error(
            "Stopped before queue submission; review the recorded attempt",
          );
        // A recovered older connection must not enqueue after losing its claim.
        await client.report(
          connectionId,
          state.queuedThrough ? "queued" : "listening",
          state.queuedThrough,
        );
        const receipt = await queueBatch(config, batch);
        console.log(receipt);
        return receipt;
      },
    );
  } catch (error) {
    const saved = await journal.read();
    if (saved?.attempt)
      await client
        .report(connectionId, "uncertain", saved.queuedThrough)
        .catch(() => {});
    throw error;
  }
}
