import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";
import { Schema } from "effect";

import { PlanError } from "../src/contract/errors.js";
import { PlanService } from "../src/domain/plan-service.js";
import { clonePlan, tenItemPlan } from "./fixture.js";
import { mappings, createTestStore } from "./test-service.js";
import { PlanStore } from "../src/database/store.js";
import { OwnerRecord } from "../src/database/schema.js";

describe("plan storage and packet versions", () => {
  it("keeps writes atomic, retryable, isolated, and packet-specific", async () => {
    const directory = await mkdtemp(join(tmpdir(), "irudd-plan-store-"));
    const filename = join(directory, "plans.db");
    const store = await createTestStore(filename);
    const service = new PlanService(store);
    const initialPlan = tenItemPlan();
    const created = await service.write("owner-a", {
      operationId: "operation-create",
      expectedVersion: null,
      plan: initialPlan,
    });
    expect(created.version).toBe(1);

    const replay = await service.write("owner-a", {
      operationId: "operation-create",
      expectedVersion: null,
      plan: initialPlan,
    });
    expect(replay).toMatchObject({ version: 1, replayed: true });
    await expect(
      service.write("owner-a", {
        operationId: "operation-create",
        expectedVersion: null,
        plan: { ...clonePlan(initialPlan), epicGoal: "Different request" },
      }),
    ).rejects.toMatchObject({ code: "OPERATION_MISMATCH" });
    await expect(
      service.getItem("owner-b", {
        contractVersion: "v1",
        planId: initialPlan.planId,
        itemId: "item-1",
      }),
    ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });

    const firstPacket = await service.getItem("owner-a", {
      contractVersion: "v1",
      planId: initialPlan.planId,
      itemId: "item-1",
    });
    const siblingEdit = clonePlan(initialPlan);
    const siblingChanged = {
      ...siblingEdit,
      items: siblingEdit.items.map((item, index) =>
        index === 1 ? { ...item, requirements: ["Changed sibling"] } : item,
      ),
    };
    await service.write("owner-a", {
      operationId: "operation-sibling",
      expectedVersion: 1,
      plan: siblingChanged,
    });
    const afterSibling = await service.getItem("owner-a", {
      contractVersion: "v1",
      planId: initialPlan.planId,
      itemId: "item-1",
    });
    expect(afterSibling.packetVersion).toBe(firstPacket.packetVersion);

    const decisionEdit = {
      ...clonePlan(siblingChanged),
      decisions: siblingChanged.decisions.map((decision, index) =>
        index === 0 ? { ...decision, body: "Use durable SQLite revisions." } : decision,
      ),
    };
    await service.write("owner-a", {
      operationId: "operation-decision",
      expectedVersion: 2,
      plan: decisionEdit,
    });
    const afterDecision = await service.getItem("owner-a", {
      contractVersion: "v1",
      planId: initialPlan.planId,
      itemId: "item-1",
    });
    expect(afterDecision.packetVersion).not.toBe(firstPacket.packetVersion);
    const getSpy = vi.spyOn(store, "get");
    await expect(
      service.checkPacket("owner-a", {
        contractVersion: "v1",
        planId: initialPlan.planId,
        itemId: "item-1",
        packetVersion: firstPacket.packetVersion,
      }),
    ).resolves.toMatchObject({ status: "changed", packetVersion: afterDecision.packetVersion });
    expect(getSpy).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();

    const listed = await store.list("owner-a");
    expect(listed[0]!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const stale = { ...clonePlan(decisionEdit), epicGoal: "This stale value must not commit" };
    await expect(
      service.write("owner-a", {
        operationId: "operation-stale",
        expectedVersion: 2,
        plan: stale,
      }),
    ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
    expect((await store.get("owner-a", initialPlan.planId))?.plan.epicGoal).toBe(
      initialPlan.epicGoal,
    );

    const left = { ...clonePlan(decisionEdit), epicGoal: "Concurrent result left" };
    const right = { ...clonePlan(decisionEdit), epicGoal: "Concurrent result right" };
    const results = await Promise.allSettled([
      service.write("owner-a", { operationId: "operation-left", expectedVersion: 3, plan: left }),
      service.write("owner-a", { operationId: "operation-right", expectedVersion: 3, plan: right }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(PlanError);
    expect(rejected.reason).toMatchObject({ code: "PLAN_CONFLICT" });
    expect((await store.get("owner-a", initialPlan.planId))?.version).toBe(4);
    const database = new DatabaseSync(filename);
    const revisionCount = database
      .prepare("select count(*) as count from plan_revisions where owner_id = ? and plan_id = ?")
      .get("owner-a", initialPlan.planId) as { count: number };
    const operationCount = database
      .prepare("select count(*) as count from operations where owner_id = ?")
      .get("owner-a") as { count: number };
    const itemCount = database
      .prepare("select count(*) as count from work_items where owner_id = ? and plan_id = ?")
      .get("owner-a", initialPlan.planId) as { count: number };
    database.close();
    expect({ revisionCount, operationCount, itemCount }).toEqual({
      revisionCount: { count: 4 },
      operationCount: { count: 4 },
      itemCount: { count: 10 },
    });
  });
});

describe("migrations", () => {
  it("creates the current schema, enforces owner identity, and can run twice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "irudd-plan-upgrade-"));
    const filename = join(directory, "upgrade.db");
    const store = new PlanStore(filename, resolve("drizzle"));
    await store.migrate();
    await store.migrate();
    await store.configureOwners(mappings);
    await expect(
      store.write("missing-owner", {
        operationId: "foreign-key-check",
        expectedVersion: null,
        plan: tenItemPlan("foreign-key-check"),
      }),
    ).rejects.toThrow();
    const database = new DatabaseSync(filename);
    expect(() => database.exec("insert into owners (id) values (NULL)")).toThrow();
    const row = database
      .prepare("select id, created_at as createdAt from owners limit 1")
      .get() as {
      id: string;
      createdAt: string;
    };
    database.close();
    expect(
      Schema.decodeUnknownSync(OwnerRecord)({
        id: row.id,
        createdAt: row.createdAt,
      }),
    ).toMatchObject({ id: row.id });
  });
});
