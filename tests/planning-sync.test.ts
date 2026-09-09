import { expect, it } from "vite-plus/test";
import { PlanService } from "../src/domain/plan-service.js";
import { createTestStore } from "./test-service.js";
import { tenItemPlan, fixtureAssetUpload } from "./fixture.js";
import { digest } from "../src/domain/validate-plan.js";
import type { SyncCursor } from "../src/contract/sync.js";
import { applyPlanningPage } from "../src/web/planning-replica.js";

async function setup() {
  const service = new PlanService(await createTestStore());
  const plan = tenItemPlan();
  await service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await service.write("owner-a", {
    operationId: "create",
    expectedVersion: null,
    plan,
  });
  return {
    service,
    plan,
    request: { contractVersion: "v1" as const, planId: plan.planId },
  };
}

it("pages a specification at a fixed revision, then transfers only changed records", async () => {
  const { service, plan, request } = await setup();
  const first = await service.syncPlan("owner-a", { ...request, limit: 2 });
  if (first.status === "reset_required") throw new Error("Unexpected reset");
  expect(first.changes).toHaveLength(2);
  const oldCursor = first.targetCursor;
  const changed = { ...plan.items[0]!, goal: "Changed after first page" };
  const receipt = await service.patch("owner-a", {
    ...request,
    operationId: "edit",
    expectedVersion: 1,
    expectedDigest: oldCursor.digest,
    items: [changed],
  });
  let page = first;
  const received = [...first.changes];
  while (page.nextPageToken) {
    const next = await service.syncPlan("owner-a", {
      ...request,
      pageToken: page.nextPageToken,
      limit: 2,
    });
    if (next.status === "reset_required") throw new Error("Unexpected reset");
    expect(next.targetCursor).toEqual(oldCursor);
    expect(next.offset).toBe(page.nextOffset);
    expect(next.changes.length).toBeLessThanOrEqual(2);
    received.push(...next.changes);
    page = next;
  }
  expect(
    received
      .filter(
        (change) => change.kind === "upsert" && change.collection === "items",
      )
      .map((change) => (change.kind === "upsert" ? change.value : null)),
  ).toEqual(plan.items);
  const next = await service.syncPlan("owner-a", {
    ...request,
    cursor: oldCursor,
  });
  if (next.status === "reset_required") throw new Error("Unexpected reset");
  expect(next.changes).toEqual([
    { kind: "upsert", collection: "items", value: changed },
  ]);
  expect(next.targetCursor).toEqual(receipt.cursor);
  const idle = await service.syncPlan("owner-a", {
    ...request,
    cursor: next.targetCursor,
  });
  expect(idle).toMatchObject({
    status: "unchanged",
    changes: [],
    nextPageToken: null,
  });
  const lookup = await service.operation("owner-a", "edit");
  expect(lookup).toMatchObject({
    status: "recorded",
    requestDigest: receipt.requestDigest,
    result: { version: 2 },
  });
  expect(await service.operation("owner-b", "edit")).toEqual({
    status: "unknown",
    operationId: "edit",
  });
});

it("detects divergent and future cursors, invalid pages and stale writes without sending a full plan", async () => {
  const { service, plan, request } = await setup();
  for (const cursor of [
    { revision: 1, digest: "sha256:" + "0".repeat(64) },
    { revision: 99, digest: digest(plan) },
  ]) {
    const result = await service.syncPlan("owner-a", { ...request, cursor });
    expect(result.status).toBe("reset_required");
    expect(result).not.toHaveProperty("changes");
    expect(result).not.toHaveProperty("plan");
  }
  expect(
    await service.syncPlan("owner-a", { ...request, pageToken: "broken" }),
  ).toMatchObject({ status: "reset_required" });
  const first = await service.syncPlan("owner-a", { ...request, limit: 1 });
  if (first.status === "reset_required" || !first.nextPageToken)
    throw new Error("Missing page");
  const replay = await service.syncPlan("owner-a", {
    ...request,
    pageToken: first.nextPageToken,
    limit: 1,
  });
  expect(
    await service.syncPlan("owner-a", {
      ...request,
      pageToken: first.nextPageToken,
      limit: 1,
    }),
  ).toEqual(replay);
  await expect(
    service.patch("owner-a", {
      ...request,
      operationId: "wrong",
      expectedVersion: 1,
      expectedDigest: "sha256:" + "0".repeat(64),
      epicGoal: "Wrong",
    }),
  ).rejects.toMatchObject({ code: "SYNC_REQUIRED" });
  expect((await service.current("owner-a", plan.planId))!.version).toBe(1);
});

it("pages conversation history, verifies the digest chain and recovers with an explicit reset", async () => {
  const { service, plan, request } = await setup();
  const empty = await service.getPlanning("owner-a", plan.planId);
  const batch = {
    ...request,
    operationId: "questions",
    expectedRevision: 0,
    expectedDigest: empty.cursor.digest,
    entries: Array.from({ length: 30 }, (_, index) => ({
      id: `q${index}`,
      section: "Questions",
      kind: "question" as const,
      body: `Question ${index}`,
    })),
  };
  const receipt = await service.appendPlanning("owner-a", batch, "agent");
  expect(receipt.operationId).toBe("questions");
  const first = await service.getPlanning("owner-a", plan.planId);
  expect(first.entries).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(first.cursor.revision).toBe(25);
  const replica = await applyPlanningPage(plan.planId, undefined, first);
  expect(await applyPlanningPage(plan.planId, replica, first)).toBe(replica);
  const last = await service.getPlanning("owner-a", plan.planId, first.cursor);
  const complete = await applyPlanningPage(plan.planId, replica, last);
  expect(complete.entries).toHaveLength(30);
  expect(complete.cursor).toEqual(receipt.cursor);
  expect(
    await service.getPlanning("owner-a", plan.planId, complete.cursor),
  ).toMatchObject({ status: "unchanged", entries: [], hasMore: false });
  const corrupt: SyncCursor = {
    ...complete.cursor,
    digest: empty.cursor.digest,
  };
  expect(
    await service.getPlanning("owner-a", plan.planId, corrupt),
  ).toMatchObject({ status: "reset_required", entries: [] });
  expect(
    await service.getPlanning("owner-a", plan.planId, {
      ...complete.cursor,
      revision: 31,
    }),
  ).toMatchObject({ status: "reset_required", entries: [] });
  await expect(
    service.appendPlanning(
      "owner-a",
      {
        ...batch,
        operationId: "divergent",
        expectedRevision: 30,
        expectedDigest: corrupt.digest,
      },
      "agent",
    ),
  ).rejects.toMatchObject({ code: "SYNC_REQUIRED" });
  await expect(
    applyPlanningPage(plan.planId, undefined, last),
  ).rejects.toThrow();
  const modified = {
    ...first,
    entries: first.entries.map((entry, index) =>
      index ? entry : { ...entry, body: "Corrupted" },
    ),
  };
  await expect(
    applyPlanningPage(plan.planId, undefined, modified),
  ).rejects.toThrow();
  expect(await service.appendPlanning("owner-a", batch, "agent")).toMatchObject(
    { cursor: complete.cursor, replayed: true },
  );
  expect(await service.operation("owner-a", "questions")).toMatchObject({
    status: "recorded",
    requestDigest: receipt.requestDigest,
    result: { cursor: complete.cursor },
  });
});

it("represents removals and ordering without resending unchanged item bodies", async () => {
  const { service, plan, request } = await setup();
  const cursor = { revision: 1, digest: digest(plan) };
  const updated = { ...plan, items: [...plan.items].reverse() };
  await service.write("owner-a", {
    operationId: "reorder",
    expectedVersion: 1,
    plan: updated,
  });
  const result = await service.syncPlan("owner-a", { ...request, cursor });
  expect(result).toMatchObject({
    changes: [
      {
        kind: "order",
        collection: "items",
        ids: updated.items.map((item) => item.id),
      },
    ],
  });
});

it("detects another database history even when its revision number matches", async () => {
  const { service, plan, request } = await setup();
  const first = await service.getPlanning("owner-a", plan.planId);
  const batch = {
    ...request,
    operationId: "branch-question",
    expectedRevision: 0,
    expectedDigest: first.cursor.digest,
    entries: [
      {
        id: "q",
        section: "Scope",
        kind: "question" as const,
        body: "Original question",
      },
    ],
  };
  const original = await service.appendPlanning("owner-a", batch, "agent");
  const restored = new PlanService(await createTestStore());
  await restored.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await restored.write("owner-a", {
    operationId: "create",
    expectedVersion: null,
    plan: { ...plan, epicGoal: "A divergent restored specification" },
  });
  await restored.appendPlanning(
    "owner-a",
    {
      ...batch,
      entries: [{ ...batch.entries[0]!, body: "A different question" }],
    },
    "agent",
  );
  expect(
    await restored.getPlanning("owner-a", plan.planId, original.cursor),
  ).toMatchObject({ status: "reset_required", entries: [] });
  expect(
    await restored.syncPlan("owner-a", {
      ...request,
      cursor: { revision: 1, digest: digest(plan) },
    }),
  ).toMatchObject({ status: "reset_required" });
  expect(
    (await restored.getPlanning("owner-a", plan.planId)).entries[0]!.body,
  ).toBe("A different question");
});
