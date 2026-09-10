import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { conversationPage } from "../src/domain/conversation-sync.js";
import { initialCursor } from "../src/domain/sync-cursor.js";
import type { StoredPlanningEntry } from "../src/contract/planning.js";
import { deliverBatches, readBatches } from "../src/companion/delivery.js";
import {
  bindingId,
  loadCompanionConfig,
  type CompanionConfig,
} from "../src/companion/config.js";
import {
  CompanionJournal,
  resolveAttempt,
  type CompanionState,
} from "../src/companion/state.js";

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
const cursor = initialCursor("owner-a", "plan-a", "conversation");
const initial: CompanionState = {
  version: 1,
  binding: "binding",
  cursor,
  queuedThrough: 0,
};
function entry(
  revision: number,
  author: "agent" | "human",
  operationId: string,
): StoredPlanningEntry {
  return {
    id: `entry-${revision}`,
    revision,
    author,
    operationId,
    createdAt: "2026-09-10T00:00:00.000Z",
    kind: author === "human" ? "answer" : "question",
    body: "Content",
    section: "Discussion",
  };
}

it("verifies paginated answers and queues a saved batch only once across page boundaries", async () => {
  const conversation = {
    planId: "plan-a",
    revision: 4,
    entries: [
      entry(1, "agent", "questions"),
      entry(2, "human", "answers"),
      entry(3, "human", "answers"),
      entry(4, "agent", "response"),
    ],
  };
  const read = vi.fn(async (from) =>
    conversationPage("owner-a", conversation, from, 2),
  );
  const batches = await readBatches("plan-a", cursor, read);
  const queue = vi.fn(async () => "receipt-1");
  const states: CompanionState[] = [];
  const result = await deliverBatches(
    initial,
    batches,
    async (value) => {
      states.push(value);
    },
    queue,
  );
  expect(read).toHaveBeenCalledTimes(2);
  expect(queue).toHaveBeenCalledTimes(1);
  expect(queue).toHaveBeenCalledWith(
    expect.objectContaining({
      operationId: "answers",
      through: expect.objectContaining({ revision: 3 }),
    }),
  );
  expect(states.find((value) => value.attempt)?.attempt).toMatchObject({
    operationId: "answers",
    through: { revision: 3 },
  });
  expect(result).toMatchObject({
    cursor: { revision: 4 },
    queuedThrough: 3,
    lastReceipt: "receipt-1",
  });
  expect(await readBatches("plan-a", result.cursor, read)).toEqual([]);
});

it("leaves an uncertain attempt durable and refuses automatic replay after a queue failure", async () => {
  const through = { revision: 1, digest: "sha256:answer" };
  let saved = initial;
  const queue = vi.fn(async () => {
    throw new Error("connection lost after enqueue");
  });
  const batches = [{ human: true, operationId: "answers", through }];
  await expect(
    deliverBatches(
      initial,
      batches,
      async (value) => {
        saved = value;
      },
      queue,
    ),
  ).rejects.toThrow("connection lost");
  expect(saved.attempt?.operationId).toBe("answers");
  await expect(
    deliverBatches(saved, batches, async () => {}, queue),
  ).rejects.toThrow("uncertain");
  expect(queue).toHaveBeenCalledTimes(1);
  expect(resolveAttempt(saved, "answers", "queued")).toMatchObject({
    cursor: through,
    queuedThrough: 1,
  });
  expect(resolveAttempt(saved, "answers", "not-queued").cursor).toEqual(cursor);
  expect(() => resolveAttempt(saved, "different", "queued")).toThrow(
    "does not match",
  );
});

it("does not enqueue if saving the attempt fails", async () => {
  const queue = vi.fn(async () => "receipt");
  await expect(
    deliverBatches(
      initial,
      [{ human: true, operationId: "answers", through: cursor }],
      async () => {
        throw new Error("disk full");
      },
      queue,
    ),
  ).rejects.toThrow("disk full");
  expect(queue).not.toHaveBeenCalled();
});

it("preserves uncertainty if the receipt cannot be saved after a successful enqueue", async () => {
  let persisted = initial;
  let writes = 0;
  const queue = vi.fn(async () => "accepted receipt");
  const batches = [{ human: true, operationId: "answers", through: cursor }];
  await expect(
    deliverBatches(
      initial,
      batches,
      async (value) => {
        if (++writes === 2)
          throw new Error("disk unavailable after queue acceptance");
        persisted = value;
      },
      queue,
    ),
  ).rejects.toThrow("disk unavailable");
  await expect(
    deliverBatches(persisted, batches, async () => {}, queue),
  ).rejects.toThrow("uncertain");
  expect(queue).toHaveBeenCalledTimes(1);
});

it("rejects altered, reset and non-progressing conversation pages before delivery", async () => {
  const page = conversationPage(
    "owner-a",
    { planId: "plan-a", revision: 1, entries: [entry(1, "human", "answers")] },
    cursor,
  );
  await expect(
    readBatches("plan-a", cursor, async () => ({
      ...page,
      entries: [{ ...page.entries[0]!, body: "Altered" }],
    })),
  ).rejects.toThrow("digest");
  await expect(
    readBatches("plan-a", cursor, async () => ({
      ...page,
      status: "reset_required",
    })),
  ).rejects.toThrow("history changed");
  await expect(
    readBatches("plan-a", cursor, async () => ({
      ...page,
      entries: [],
      cursor,
    })),
  ).rejects.toThrow("stopped before");
});

it("locks durable state and refuses reuse for another Codex thread", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-state-"));
  directories.push(directory);
  const config: CompanionConfig = {
    serverUrl: "https://plans.example",
    ownerId: "owner-a",
    planId: "plan-a",
    threadId: "00000000-0000-0000-0000-000000000001",
    stateDirectory: directory,
    cwd: directory,
    codexHome: directory,
    codexBinary: "codex",
    headersEnv: {},
  };
  const journal = new CompanionJournal(config);
  const unlock = await journal.lock();
  try {
    await expect(journal.lock()).rejects.toThrow("locked");
    await journal.write({ ...initial, binding: bindingId(config) });
    expect((await journal.read())?.cursor).toEqual(cursor);
    await expect(
      new CompanionJournal({
        ...config,
        threadId: "00000000-0000-0000-0000-000000000002",
      }).read(),
    ).rejects.toThrow("different");
  } finally {
    await unlock();
  }
});

it("rejects nonlocal HTTP and thread names instead of UUIDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-config-"));
  directories.push(directory);
  const path = join(directory, "config.json");
  const input = {
    serverUrl: "http://example.com",
    ownerId: "owner-a",
    planId: "plan-a",
    threadId: "00000000-0000-0000-0000-000000000001",
    cwd: directory,
    stateDirectory: directory,
    headersEnv: {},
  };
  await writeFile(path, JSON.stringify(input));
  await expect(loadCompanionConfig(path)).rejects.toThrow("HTTPS");
  await writeFile(
    path,
    JSON.stringify({
      ...input,
      serverUrl: "https://plans.example",
      threadId: "some session name",
    }),
  );
  await expect(loadCompanionConfig(path)).rejects.toThrow();
});
