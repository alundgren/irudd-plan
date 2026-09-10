import { afterEach, expect, it, vi } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { startTestServer } from "./test-service.js";
import { tenItemPlan, fixtureAssetUpload } from "./fixture.js";
import { PlanningDelivery } from "../src/domain/planning-delivery.js";
import {
  CompanionClient,
  CompanionHttpError,
} from "../src/companion/client.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function setup() {
  const plan = tenItemPlan();
  const running = await startTestServer(undefined, 0, async (service) => {
    await service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
    await service.write("owner-a", {
      operationId: "initial",
      expectedVersion: null,
      plan,
    });
  });
  cleanup.push(running.close);
  return { ...running, planId: plan.planId };
}

it("streams committed conversation updates, enforces one companion, and clears presence on disconnect", async () => {
  const running = await setup();
  const controller = new AbortController();
  const connectionId = randomUUID();
  const url = `${running.url}/companion/plans/${running.planId}/events`;
  const headers = {
    authorization: "Bearer token-a",
    "x-irudd-connection": connectionId,
    "x-irudd-thread": randomUUID(),
  };
  const response = await fetch(url, { headers, signal: controller.signal });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  cleanup.push(async () => {
    controller.abort();
    await reader.cancel().catch(() => {});
  });
  const first = new TextDecoder().decode((await reader.read()).value);
  expect(first).toContain('"revision":0');
  expect(first).toContain('"connected":true');
  const competing = await fetch(url, {
    headers: { ...headers, "x-irudd-connection": randomUUID() },
  });
  expect(competing.status).toBe(409);
  await competing.body?.cancel();
  const page = await running.service.getPlanning("owner-a", running.planId);
  await running.service.appendPlanning(
    "owner-a",
    {
      contractVersion: "v1",
      planId: running.planId,
      operationId: "answers",
      expectedRevision: page.cursor.revision,
      expectedDigest: page.cursor.digest,
      entries: [
        {
          id: "answer",
          kind: "note",
          section: "Discussion",
          body: "A saved answer",
        },
      ],
    },
    "human",
  );
  const update = new TextDecoder().decode((await reader.read()).value);
  expect(update).toContain('"revision":1');
  expect(update).not.toContain("A saved answer");
  controller.abort();
  await reader.cancel().catch(() => {});
  await expect
    .poll(
      () => running.service.delivery.get("owner-a", running.planId)?.connected,
    )
    .toBe(false);
});

it("keeps companion APIs service-authenticated, owner-scoped, and bound to the active connection", async () => {
  const running = await setup();
  const root = `${running.url}/companion/plans/${running.planId}`;
  for (const [token, expected] of [
    ["browser-a", 401],
    ["token-b", 404],
    ["expired", 401],
  ] as const) {
    const response = await fetch(`${root}/planning`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(expected);
    await response.body?.cancel();
  }
  const report = await fetch(`${root}/delivery`, {
    method: "POST",
    headers: {
      authorization: "Bearer token-a",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      connectionId: randomUUID(),
      state: "queued",
      queuedThrough: 1,
    }),
  });
  expect(report.status).toBe(409);
  await report.body?.cancel();
});

it("expires an unresponsive companion without claiming the agent is running", () => {
  const delivery = new PlanningDelivery();
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const close = delivery.connect("owner", "plan", "connection", "thread");
  now = 46_000;
  expect(delivery.get("owner", "plan")?.connected).toBe(false);
  const newerClose = delivery.connect("owner", "plan", "new", "thread");
  expect(() =>
    delivery.report("owner", "plan", "connection", "queued", 1),
  ).toThrow("no longer active");
  close();
  expect(delivery.get("owner", "plan")?.connected).toBe(true);
  delivery.report("owner", "plan", "new", "uncertain", 7);
  newerClose();
  expect(delivery.get("owner", "plan")).toMatchObject({
    connected: false,
    state: "uncertain",
    queuedThrough: 7,
  });
});

it("revoked credentials close an existing stream before delivering another update", async () => {
  const running = await setup();
  const controller = new AbortController();
  const response = await fetch(
    `${running.url}/companion/plans/${running.planId}/events`,
    {
      signal: controller.signal,
      headers: {
        authorization: "Bearer token-a",
        "x-irudd-connection": randomUUID(),
        "x-irudd-thread": randomUUID(),
      },
    },
  );
  const reader = response.body!.getReader();
  cleanup.push(async () => {
    controller.abort();
    await reader.cancel().catch(() => {});
  });
  await reader.read();
  running.expire("token-a");
  running.service.delivery.changed("owner-a", running.planId);
  expect((await reader.read()).done).toBe(true);
  expect(
    running.service.delivery.get("owner-a", running.planId)?.connected,
  ).toBe(false);
});

it("the companion client verifies the expected owner before it can read answers", async () => {
  const running = await setup();
  vi.stubEnv("QUEUE_TEST_AUTH", "Bearer token-a");
  const client = new CompanionClient({
    serverUrl: running.url,
    ownerId: "wrong-owner",
    planId: running.planId,
    threadId: randomUUID(),
    stateDirectory: "/tmp/unused",
    cwd: "/tmp",
    codexHome: "/tmp/unused",
    codexBinary: "codex",
    headersEnv: { Authorization: "QUEUE_TEST_AUTH" },
  });
  try {
    await expect(client.verify()).rejects.toThrow("Owner");
  } finally {
    vi.unstubAllEnvs();
  }
  expect(new CompanionHttpError(403).status).toBe(403);
});
