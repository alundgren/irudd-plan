import { initialCursor } from "../src/domain/sync-cursor.js";
import { digest } from "../src/domain/validate-plan.js";
import { afterEach, expect, it } from "vite-plus/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlanService } from "../src/domain/plan-service.js";
import { createTestStore, startTestServer } from "./test-service.js";
import { tenItemPlan, fixtureAssetUpload } from "./fixture.js";
import type { AppendPlanningRequest } from "../src/contract/planning.js";
import { GitHubConnection } from "../src/github/github-app.js";
import { IruddMcpClient } from "../src/client/mcp-client.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

async function setup(filename?: string) {
  const store = await createTestStore(filename);
  const service = new PlanService(store);
  const plan = tenItemPlan();
  await service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await service.write("owner-a", {
    operationId: "initial",
    expectedVersion: null,
    plan,
  });
  return { store, service, plan };
}
function question(planId: string): AppendPlanningRequest {
  return {
    contractVersion: "v1",
    planId,
    operationId: "questions",
    expectedRevision: 0,
    expectedDigest: initialCursor("owner-a", planId, "conversation").digest,
    entries: [
      {
        id: "question-1",
        section: "Scope",
        kind: "question",
        body: "Which formats?",
        choices: ["CSV", "JSON"],
      },
    ],
  };
}

it("persists questions and human answers across sessions without changing implementation packets", async () => {
  const filename = join(await mkdtemp(join(tmpdir(), "planning-")), "plan.db");
  const { service, plan } = await setup(filename);
  const request = {
    contractVersion: "v1" as const,
    planId: plan.planId,
    itemId: plan.items[0]!.id,
  };
  const before = await service.getItem("owner-a", request);
  const initial = question(plan.planId);
  const batch = {
    ...initial,
    entries: [{ ...initial.entries[0]!, assets: plan.assets }],
  };
  await service.appendPlanning("owner-a", batch, "agent");
  const questionCursor = (await service.getPlanning("owner-a", plan.planId))
    .cursor;
  const answer = {
    ...batch,
    operationId: "answers",
    expectedDigest: questionCursor.digest,
    expectedRevision: 1,
    entries: [
      {
        id: "answer-1",
        section: "Scope",
        kind: "answer" as const,
        body: "CSV plus tabs",
        replyTo: "question-1",
      },
    ],
  };
  await service.appendPlanning("owner-a", answer, "human");
  const reopened = new PlanService(await createTestStore(filename));
  const conversation = await reopened.getPlanning("owner-a", plan.planId);
  expect(conversation.revision).toBe(2);
  expect(conversation.entries.map((entry) => entry.author)).toEqual([
    "agent",
    "human",
  ]);
  expect(conversation.entries[0]!.assets).toEqual(plan.assets);
  expect(
    (
      await reopened.getPlanning("owner-a", plan.planId, questionCursor)
    ).entries.map((entry) => entry.id),
  ).toEqual(["answer-1"]);
  expect(await reopened.getItem("owner-a", request)).toEqual(before);
  await expect(
    reopened.getPlanning("owner-b", plan.planId),
  ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
  await expect(
    reopened.appendPlanning("owner-b", batch, "agent"),
  ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
});

it("replays exact requests and rejects stale batches, duplicate IDs and forged answers atomically", async () => {
  const { service, plan } = await setup();
  const batch = question(plan.planId);
  await service.appendPlanning("owner-a", batch, "agent");
  const currentDigest = (await service.getPlanning("owner-a", plan.planId))
    .cursor.digest;
  expect(await service.appendPlanning("owner-a", batch, "agent")).toMatchObject(
    { revision: 1, replayed: true },
  );
  await expect(
    service.appendPlanning(
      "owner-a",
      { ...batch, expectedRevision: 1 },
      "agent",
    ),
  ).rejects.toMatchObject({ code: "OPERATION_MISMATCH" });
  await expect(
    service.appendPlanning(
      "owner-a",
      { ...batch, operationId: "stale" },
      "agent",
    ),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
  await expect(
    service.appendPlanning(
      "owner-a",
      {
        ...batch,
        operationId: "duplicate",
        expectedDigest: currentDigest,
        expectedRevision: 1,
        entries: [{ ...batch.entries[0]!, id: "new" }, batch.entries[0]!],
      },
      "agent",
    ),
  ).rejects.toMatchObject({ code: "DUPLICATE_ID" });
  await expect(
    service.appendPlanning(
      "owner-a",
      {
        ...batch,
        operationId: "forged",
        expectedDigest: currentDigest,
        expectedRevision: 1,
        entries: [
          {
            id: "fake",
            section: "Scope",
            kind: "answer",
            replyTo: "question-1",
            body: "Yes",
          },
        ],
      },
      "agent",
    ),
  ).rejects.toMatchObject({ code: "REQUEST_INVALID" });
  expect((await service.getPlanning("owner-a", plan.planId)).revision).toBe(1);
});

it("applies validated specification deltas while preserving unrelated records and replaying old operations", async () => {
  const { service, plan } = await setup();
  const request = {
    contractVersion: "v1" as const,
    planId: plan.planId,
    operationId: "delta",
    expectedVersion: 1,
    expectedDigest: digest(plan),
    items: [{ ...plan.items[0]!, goal: "Updated goal" }],
  };
  expect(await service.patch("owner-a", request)).toMatchObject({ version: 2 });
  const current = (await service.current("owner-a", plan.planId))!;
  expect(current.plan.items.slice(1)).toEqual(plan.items.slice(1));
  expect(current.plan.contexts).toEqual(plan.contexts);
  expect(current.plan.items[0]!.goal).toBe("Updated goal");
  await service.patch("owner-a", {
    ...request,
    operationId: "next",
    expectedVersion: 2,
    expectedDigest: digest(current.plan),
    epicGoal: "Next goal",
  });
  expect(await service.patch("owner-a", request)).toMatchObject({
    version: 2,
    replayed: true,
  });
  await expect(
    service.patch("owner-a", { ...request, operationId: "stale" }),
  ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
  await expect(
    service.patch("owner-a", { ...request, removeItemIds: [] }),
  ).rejects.toMatchObject({ code: "OPERATION_MISMATCH" });
  await expect(
    service.patch("owner-a", {
      ...request,
      operationId: "invalid",
      expectedVersion: 3,
      expectedDigest: digest(
        (await service.current("owner-a", plan.planId))!.plan,
      ),
      removeContextIds: [plan.contexts[0]!.id],
    }),
  ).rejects.toMatchObject({ code: "REFERENCE_MISSING" });
  expect((await service.current("owner-a", plan.planId))!.version).toBe(3);
});

it("connects authenticated MCP questions to browser answers and rejects cross-origin submissions", async () => {
  const server = await startTestServer();
  cleanup.push(server.close);
  const plan = tenItemPlan();
  await server.service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await server.service.write("owner-a", {
    operationId: "initial",
    expectedVersion: null,
    plan,
  });
  const client = new IruddMcpClient(new URL(`${server.url}/mcp`), "token-a");
  cleanup.unshift(() => client.close());
  await client.connect();
  const contract = await client.callTool<{
    structuredContent: { features: Record<string, boolean> };
  }>("get_contract", { contractVersion: "v1" });
  expect(contract.structuredContent.features.planningConversation).toBe(true);
  expect(contract.structuredContent.features.incrementalSync).toBe(true);
  const sync = await client.callTool<{
    structuredContent: { changes: unknown[] };
  }>("sync_plan", { contractVersion: "v1", planId: plan.planId, limit: 1 });
  expect(sync.structuredContent.changes).toHaveLength(1);
  await client.callTool("append_planning", question(plan.planId));
  const questionCursor = (
    await server.service.getPlanning("owner-a", plan.planId)
  ).cursor;
  const receipt = await client.callTool<{
    structuredContent: { status: string; result: { operationId: string } };
  }>("get_operation", { contractVersion: "v1", operationId: "questions" });
  expect(receipt.structuredContent).toMatchObject({
    status: "recorded",
    result: { operationId: "questions" },
  });
  const endpoint = `${server.url}/api/plans/${plan.planId}/planning`;
  const batch = {
    contractVersion: "v1",
    planId: plan.planId,
    operationId: "browser-answer",
    expectedDigest: questionCursor.digest,
    expectedRevision: 1,
    entries: [
      {
        id: "answer-1",
        section: "Scope",
        kind: "answer",
        replyTo: "question-1",
        body: "CSV",
      },
    ],
  };
  const headers = {
    "cf-access-jwt-assertion": "browser-a",
    "content-type": "application/json",
    "x-irudd-planning": "1",
  };
  expect(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "sec-fetch-site": "cross-site" },
        body: JSON.stringify(batch),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...batch, operationId: "stale" }),
      })
    ).status,
  ).toBe(409);
  const result = await client.callTool<{
    structuredContent: { entries: { author: string; body: string }[] };
  }>("get_planning", {
    contractVersion: "v1",
    planId: plan.planId,
    cursor: questionCursor,
  });
  expect(result.structuredContent.entries).toEqual([
    expect.objectContaining({ author: "human", body: "CSV" }),
  ]);
  expect(
    (await fetch(`${server.url}/public/plans/owner-a/${plan.planId}/planning`))
      .status,
  ).toBe(404);
});

it("keeps discussion and its private visual out of a published specification", async () => {
  const { store, plan } = await setup();
  const service = new PlanService(
    store,
    undefined,
    undefined,
    new GitHubConnection(
      [
        {
          ownerId: "owner-a",
          installationId: 1,
          repositories: [{ owner: "example", name: "project" }],
        },
      ],
      {
        async repository(_installationId, owner, name) {
          return {
            id: "public-repo",
            owner,
            name,
            visibility: "public",
            url: "https://github.com/example/project",
          };
        },
        async work() {
          throw new Error("No work lookup expected");
        },
      },
    ),
  );
  const visual = await service.uploadAsset("owner-a", {
    ...fixtureAssetUpload(plan.planId),
    assetId: "private-discussion",
  });
  const batch = question(plan.planId);
  await service.appendPlanning(
    "owner-a",
    {
      ...batch,
      entries: [
        {
          ...batch.entries[0]!,
          body: "Private alternative under discussion",
          assets: [visual],
        },
      ],
    },
    "agent",
  );
  const context = await service.getAgentContext("owner-a", plan.planId);
  await service.appendAgentContext("owner-a", {
    contractVersion: "v1",
    planId: plan.planId,
    operationId: "private-evidence",
    expectedRevision: context.cursor.revision,
    expectedDigest: context.cursor.digest,
    entries: [
      {
        id: "private-evidence",
        title: "Private repository findings",
        body: "Internal investigation and handoff details",
      },
    ],
  });
  await service.verifyRepository("owner-a", {
    contractVersion: "v1",
    planId: plan.planId,
  });
  await service.publish("owner-a", {
    contractVersion: "v1",
    planId: plan.planId,
  });
  const published = await service.publicCurrent("owner-a", plan.planId);
  expect(published!.plan.items).toEqual(plan.items);
  expect(published!.plan.decisions[0]).not.toHaveProperty("source");
  expect(published!.plan.contexts[0]).not.toHaveProperty("source");
  expect(published).not.toHaveProperty("entries");
  await expect(
    service.publicAsset("owner-a", plan.planId, visual.id, visual.digest),
  ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
  expect(
    (await service.getPlanning("owner-a", plan.planId)).entries[0]!.assets,
  ).toEqual([visual]);
});
