import { DatabaseSync } from "node:sqlite";
import { PlanStore } from "../src/database/store.js";
import { mappings } from "./test-service.js";
import { afterEach, expect, it } from "vite-plus/test";
import { cp, mkdtemp, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createTestStore, startTestServer } from "./test-service.js";
import { tenItemPlan, fixtureAssetUpload } from "./fixture.js";
import { PlanService } from "../src/domain/plan-service.js";
import { initialCursor } from "../src/domain/sync-cursor.js";
import { digest } from "../src/domain/validate-plan.js";
import { IruddMcpClient } from "../src/client/mcp-client.js";
import type { AgentContextPage } from "../src/domain/agent-context-sync.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function initialize(service: PlanService) {
  const plan = tenItemPlan();
  await service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await service.write("owner-a", {
    operationId: "initial",
    expectedVersion: null,
    plan,
  });
  return plan;
}
function batch(planId: string) {
  return {
    contractVersion: "v1" as const,
    planId,
    operationId: "evidence",
    expectedRevision: 0,
    expectedDigest: initialCursor("owner-a", planId, "agent-context").digest,
    entries: [
      {
        id: "finding",
        title: "Importer evidence",
        body: "Preserve tab-delimited input. src/import/read.ts\n".repeat(500),
      },
    ],
  };
}

it("persists independent context, pages corrections, and preserves legacy discussion and packet requirements", async () => {
  const filename = join(
    await mkdtemp(join(tmpdir(), "agent-context-")),
    "plans.db",
  );
  const service = new PlanService(await createTestStore(filename));
  const plan = await initialize(service);
  const itemRequest = {
    contractVersion: "v1" as const,
    planId: plan.planId,
    itemId: plan.items[0]!.id,
  };
  const before = await service.getItem("owner-a", itemRequest);
  const conversation = await service.getPlanning("owner-a", plan.planId);
  await service.appendPlanning(
    "owner-a",
    {
      contractVersion: "v1",
      planId: plan.planId,
      operationId: "legacy",
      expectedRevision: 0,
      expectedDigest: conversation.cursor.digest,
      entries: [
        {
          id: "legacy",
          section: "Repository evidence",
          kind: "note",
          body: "Legacy technical note remains readable",
        },
      ],
    },
    "agent",
  );
  const legacy = await service.getPlanning("owner-a", plan.planId);
  const request = batch(plan.planId);
  const first = await service.appendAgentContext("owner-a", request);
  await service.appendAgentContext("owner-a", {
    ...request,
    operationId: "correction",
    expectedRevision: first.revision,
    expectedDigest: first.cursor.digest,
    entries: [
      {
        id: "corrected",
        title: "Updated evidence",
        body: "Tabs and commas are supported",
        supersedes: "finding",
      },
    ],
  });
  const reopened = new PlanService(await createTestStore(filename));
  const page = await reopened.getAgentContext(
    "owner-a",
    plan.planId,
    undefined,
    1,
  );
  expect(page.entries).toHaveLength(1);
  expect(page.hasMore).toBe(true);
  const next = await reopened.getAgentContext(
    "owner-a",
    plan.planId,
    page.cursor,
    1,
  );
  expect(next.entries.map((entry) => entry.id)).toEqual(["corrected"]);
  expect(next.entries[0]).toMatchObject({
    author: "agent",
    supersedes: "finding",
  });
  expect(
    await reopened.getAgentContext("owner-a", plan.planId, next.cursor),
  ).toMatchObject({ status: "unchanged", entries: [] });
  expect(
    await reopened.getAgentContext("owner-a", plan.planId, legacy.cursor),
  ).toMatchObject({ status: "reset_required", entries: [] });
  expect(
    (await reopened.getAgentContextEntry("owner-a", plan.planId, "finding"))
      .body,
  ).toBe(request.entries[0]!.body);
  expect(await reopened.getPlanning("owner-a", plan.planId)).toEqual(legacy);
  expect(await reopened.getItem("owner-a", itemRequest)).toEqual(before);
  expect((await reopened.current("owner-a", plan.planId))!.plan).toEqual(plan);
  await reopened.patch("owner-a", {
    contractVersion: "v1",
    planId: plan.planId,
    operationId: "preserve-requirement",
    expectedVersion: 1,
    expectedDigest: digest(plan),
    items: [
      {
        ...plan.items[0]!,
        goal: "Preserve tab-delimited input while changing error handling",
      },
    ],
  });
  const packet = await reopened.getItem("owner-a", itemRequest);
  expect(packet.item.goal).toContain("Preserve tab-delimited input");
  expect(packet.contexts).toEqual(before.contexts);
  expect(packet.decisions).toEqual(before.decisions);
  expect(packet.assets).toEqual(before.assets);
  expect(packet.packetVersion).not.toBe(before.packetVersion);
});

it("enforces owner isolation, exact retries, cursor conflicts and atomic correction validation", async () => {
  const service = new PlanService(await createTestStore());
  const plan = await initialize(service);
  const request = batch(plan.planId);
  const receipt = await service.appendAgentContext("owner-a", request);
  expect(await service.appendAgentContext("owner-a", request)).toMatchObject({
    replayed: true,
    revision: 1,
  });
  expect(await service.operation("owner-a", request.operationId)).toMatchObject(
    { status: "recorded" },
  );
  await expect(
    service.appendAgentContext("owner-a", { ...request, entries: [] }),
  ).rejects.toMatchObject({ code: "OPERATION_MISMATCH" });
  await expect(
    service.appendAgentContext("owner-a", { ...request, operationId: "stale" }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
  const next = {
    ...request,
    operationId: "next",
    expectedRevision: 1,
    expectedDigest: receipt.cursor.digest,
  };
  await expect(
    service.appendAgentContext("owner-a", {
      ...next,
      expectedDigest: initialCursor("owner-a", plan.planId, "conversation")
        .digest,
    }),
  ).rejects.toMatchObject({ code: "SYNC_REQUIRED" });
  await expect(
    service.appendAgentContext("owner-a", {
      ...next,
      entries: [
        {
          id: "valid",
          title: "Valid",
          body: "A correction",
          supersedes: "finding",
        },
        {
          id: "invalid",
          title: "Invalid",
          body: "Missing target",
          supersedes: "missing",
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "REFERENCE_MISSING" });
  expect((await service.getAgentContext("owner-a", plan.planId)).revision).toBe(
    1,
  );
  await expect(
    service.appendAgentContext("owner-a", next),
  ).rejects.toMatchObject({ code: "DUPLICATE_ID" });
  await expect(
    service.getAgentContext("owner-b", plan.planId),
  ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
  await expect(
    service.appendAgentContext("owner-b", request),
  ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
  await expect(
    service.getAgentContextEntry("owner-b", plan.planId, "finding"),
  ).rejects.toMatchObject({ code: "REFERENCE_MISSING" });
  const correction = {
    id: "valid",
    title: "Valid",
    body: "A correction",
    supersedes: "finding",
  };
  await service.appendAgentContext("owner-a", {
    ...next,
    entries: [correction],
  });
  const head = await service.getAgentContext("owner-a", plan.planId);
  await expect(
    service.appendAgentContext("owner-a", {
      ...next,
      operationId: "fork",
      expectedRevision: 2,
      expectedDigest: head.cursor.digest,
      entries: [{ ...correction, id: "fork" }],
    }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
});

it("exposes authenticated MCP context and on-demand browser sources without publishing or allowing browser writes", async () => {
  const server = await startTestServer();
  cleanup.push(server.close);
  const plan = await initialize(server.service);
  const client = new IruddMcpClient(new URL(`${server.url}/mcp`), "token-a");
  await client.connect();
  cleanup.unshift(() => client.close());
  const contract = await client.callTool<{
    structuredContent: { features: { agentContext: boolean } };
  }>("get_contract", { contractVersion: "v1" });
  expect(contract.structuredContent.features.agentContext).toBe(true);
  await client.callTool("append_agent_context", batch(plan.planId));
  const result = await client.callTool<{ structuredContent: AgentContextPage }>(
    "get_agent_context",
    { contractVersion: "v1", planId: plan.planId, limit: 1 },
  );
  expect(result.structuredContent.entries).toHaveLength(1);
  const exact = await client.callTool<{ structuredContent: { id: string } }>(
    "get_agent_context_entry",
    { contractVersion: "v1", planId: plan.planId, entryId: "finding" },
  );
  expect(exact.structuredContent.id).toBe("finding");
  const empty = await server.service.getPlanning("owner-a", plan.planId);
  const request = {
    contractVersion: "v1" as const,
    planId: plan.planId,
    operationId: "recommendation",
    expectedRevision: 0,
    expectedDigest: empty.cursor.digest,
    entries: [
      {
        id: "recommendation",
        section: "Import behavior",
        kind: "note" as const,
        body: "Keep valid rows and report errors.",
        source: { entryId: "finding", label: "Existing importer behavior" },
      },
    ],
  };
  await client.callTool("append_planning", request);
  const headers = { "cf-access-jwt-assertion": "browser-a" };
  const url = `${server.url}/api/plans/${plan.planId}/agent-context/finding`;
  expect((await fetch(url, { headers })).status).toBe(200);
  expect(
    (await fetch(url, { headers: { "cf-access-jwt-assertion": "browser-b" } }))
      .status,
  ).toBe(404);
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(url, { headers, method: "POST" })).status).toBe(405);
  expect(
    (
      await fetch(
        `${server.url}/public/plans/owner-a/${plan.planId}/agent-context/finding`,
      )
    ).status,
  ).toBe(404);
  const human = await fetch(`${server.url}/api/plans/${plan.planId}/planning`, {
    headers,
  });
  const humanText = await human.text();
  expect(humanText).toContain("Existing importer behavior");
  expect(humanText).not.toContain("src/import/read.ts");
  const current = await server.service.getPlanning("owner-a", plan.planId);
  await expect(
    server.service.appendPlanning(
      "owner-a",
      {
        ...request,
        operationId: "bad-source",
        expectedRevision: 1,
        expectedDigest: current.cursor.digest,
        entries: [
          {
            ...request.entries[0]!,
            id: "bad",
            source: { entryId: "missing", label: "Unavailable" },
          },
        ],
      },
      "agent",
    ),
  ).rejects.toMatchObject({ code: "REFERENCE_MISSING" });
});

it("upgrades legacy storage without rewriting conversation and cascades context on plan deletion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "context-upgrade-"));
  const legacyMigrations = join(directory, "legacy-migrations");
  for (const name of await readdir("drizzle")) {
    if (!name.endsWith("_agent_context_entries"))
      await cp(join("drizzle", name), join(legacyMigrations, name), {
        recursive: true,
      });
  }
  const filename = join(directory, "plans.db");
  const legacyStore = new PlanStore(filename, legacyMigrations);
  await legacyStore.migrate();
  await legacyStore.configureOwners(mappings);
  const legacyService = new PlanService(legacyStore);
  const plan = await initialize(legacyService);
  const empty = await legacyService.getPlanning("owner-a", plan.planId);
  await legacyService.appendPlanning(
    "owner-a",
    {
      contractVersion: "v1",
      planId: plan.planId,
      operationId: "old-note",
      expectedRevision: 0,
      expectedDigest: empty.cursor.digest,
      entries: [
        {
          id: "old-note",
          section: "Repository evidence",
          kind: "note",
          body: "Keep this exact legacy note",
        },
      ],
    },
    "agent",
  );
  const before = await legacyService.getPlanning("owner-a", plan.planId);
  const upgraded = new PlanStore(filename, resolve("drizzle"));
  await upgraded.migrate();
  const service = new PlanService(upgraded);
  expect(await service.getPlanning("owner-a", plan.planId)).toEqual(before);
  await service.appendAgentContext("owner-a", batch(plan.planId));
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare("DELETE FROM plans WHERE owner_id = ? AND id = ?").run(
      "owner-a",
      plan.planId,
    );
    expect(
      db.prepare("SELECT count(*) AS count FROM agent_context_entries").get(),
    ).toMatchObject({ count: 0 });
  } finally {
    db.close();
  }
  await expect(
    service.getAgentContextEntry("owner-a", plan.planId, "finding"),
  ).rejects.toMatchObject({ code: "REFERENCE_MISSING" });
});
