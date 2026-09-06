import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { PlanError } from "../src/contract/errors.js";
import { PlanStore } from "../src/database/store.js";
import { RetentionStore } from "../src/database/retention-store.js";
import { PlanService } from "../src/domain/plan-service.js";
import { PlanRetention } from "../src/domain/plan-retention.js";
import { DAY_MS } from "../src/domain/retention-status.js";
import {
  GitHubConnection,
  type GitHubReader,
} from "../src/github/github-app.js";
import { fixtureAssetUpload, tenItemPlan } from "./fixture.js";
import { mappings, startTestServer } from "./test-service.js";
import { IruddMcpClient } from "../src/client/mcp-client.js";

async function setup() {
  const filename = join(
    await mkdtemp(join(tmpdir(), "retention-")),
    "plans.db",
  );
  let time = Date.parse("2026-01-01T00:00:00Z");
  const now = () => new Date(time);
  const store = new PlanStore(filename, resolve("drizzle"), now);
  await store.migrate();
  await store.configureOwners(mappings);
  const states = new Map<
    number,
    { state: string; closedAt?: string; draft?: boolean }
  >();
  let failure: Error | undefined;
  let calls = 0;
  let onWork: (() => Promise<void>) | undefined;
  const reader: GitHubReader = {
    async repository(_installation, owner, name) {
      if (failure !== undefined) throw failure;
      return {
        id: "42",
        owner,
        name,
        visibility: "public",
        url: `https://github.com/${owner}/${name}`,
      };
    },
    async work(_installation, repo, type, number) {
      calls += 1;
      await onWork?.();
      if (failure !== undefined) throw failure;
      return {
        nodeId: `node-${number}`,
        databaseId: String(number),
        type,
        number,
        url: `${repo.url}/issues/${number}`,
        observedAt: now().toISOString(),
        ...(states.get(number) ?? { state: "open" }),
      };
    },
  };
  const github = new GitHubConnection(
    [
      {
        ownerId: "owner-a",
        installationId: 1,
        repositories: [{ owner: "example", name: "project" }],
      },
    ],
    reader,
  );
  const service = new PlanService(store, undefined, undefined, github);
  const retentionStore = new RetentionStore(filename);
  const worker = new PlanRetention(
    retentionStore,
    github,
    now,
    service.updates,
  );
  const create = async (id = "plan") => {
    const plan = tenItemPlan(id);
    await service.uploadAsset("owner-a", fixtureAssetUpload(id));
    const request = {
      operationId: `create-${id}`,
      expectedVersion: null,
      plan,
    };
    await service.write("owner-a", request);
    return request;
  };
  const attach = async (
    number = 1,
    type: "issue" | "pull_request" = "issue",
    planId = "plan",
  ) => {
    await service.verifyRepository("owner-a", {
      contractVersion: "v1",
      planId,
    });
    await service.associateGitHubWork("owner-a", {
      contractVersion: "v1",
      planId,
      type,
      number,
    });
  };
  const sql = (query: string) => {
    const db = new DatabaseSync(filename);
    try {
      return db.prepare(query).all();
    } finally {
      db.close();
    }
  };
  return {
    filename,
    now,
    store,
    service,
    states,
    worker,
    retentionStore,
    github,
    create,
    attach,
    sql,
    day: (day: number) => {
      time = Date.parse("2026-01-01T00:00:00Z") + day * DAY_MS;
    },
    fail: (error?: Error) => {
      failure = error;
    },
    onWork: (callback?: () => Promise<void>) => {
      onWork = callback;
    },
    calls: () => calls,
  };
}

const current = (f: Awaited<ReturnType<typeof setup>>, id = "plan") =>
  f.service.current("owner-a", id);

describe("plan retention", () => {
  it("expires a never-attached plan at creation plus 30 days despite edits, reads and retries", async () => {
    const f = await setup();
    const request = await f.create();
    f.day(29);
    await f.service.write("owner-a", {
      ...request,
      expectedVersion: 1,
      operationId: "edit",
    });
    await f.service.write("owner-a", request);
    expect((await current(f))?.retention.expiresAt).toBe(
      "2026-01-31T00:00:00.000Z",
    );
    await f.worker.runBatch();
    expect(await current(f)).toBeDefined();
    f.day(30);
    await f.worker.runBatch();
    expect(await current(f)).toBeUndefined();
    expect(f.calls()).toBe(0);
    await expect(f.store.write("owner-a", request)).rejects.toMatchObject({
      code: "PLAN_NOT_FOUND",
    });
    await expect(
      f.store.write("owner-a", { ...request, operationId: "replacement" }),
    ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    await expect(
      f.store.write("owner-a", {
        ...request,
        operationId: "late-edit",
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    await expect(
      f.service.uploadAsset("owner-a", fixtureAssetUpload("plan")),
    ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
  });

  it("keeps the complete plan while one of two links is open, including a draft PR", async () => {
    const f = await setup();
    await f.create();
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    f.states.set(2, { state: "open", draft: true });
    await f.attach(1);
    await f.attach(2, "pull_request");
    f.day(60);
    await f.worker.runBatch();
    expect((await current(f))?.retention).toMatchObject({
      status: "retained",
      expiresAt: null,
    });
    expect(f.sql("SELECT * FROM plan_revisions")).toHaveLength(1);
    expect(f.sql("SELECT * FROM asset_objects")).toHaveLength(1);
  });

  it("starts inactivity at the latest closure and treats merged PRs as inactive", async () => {
    const f = await setup();
    await f.create();
    await f.attach(1);
    await f.attach(2, "pull_request");
    f.states.set(1, { state: "closed", closedAt: "2026-01-02T00:00:00Z" });
    f.states.set(2, { state: "merged", closedAt: "2026-01-11T00:00:00Z" });
    f.day(39);
    await f.worker.runBatch();
    expect((await current(f))?.retention).toMatchObject({
      status: "scheduled",
      inactiveSince: "2026-01-11T00:00:00.000Z",
      expiresAt: "2026-02-10T00:00:00.000Z",
    });
    f.day(40);
    const before = f.calls();
    await f.worker.runBatch();
    expect(f.calls() - before).toBe(4);
    expect(await current(f)).toBeUndefined();
  });

  it("cancels expiry on reopen and calculates a fresh period on reclose", async () => {
    const f = await setup();
    await f.create();
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    await f.attach();
    f.day(29);
    await f.worker.runBatch();
    f.states.set(1, { state: "open" });
    f.day(30);
    await f.worker.runBatch();
    expect((await current(f))?.retention.status).toBe("retained");
    f.day(31);
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    await f.worker.runBatch();
    expect((await current(f))?.retention.expiresAt).toBe(
      "2026-03-03T00:00:00.000Z",
    );
    f.day(60);
    await f.worker.runBatch();
    expect(await current(f)).toBeDefined();
    f.day(61);
    await f.worker.runBatch();
    expect(await current(f)).toBeUndefined();
  });

  it("cancels a never-attached expiry when open work is attached near deletion", async () => {
    const f = await setup();
    await f.create();
    f.day(30);
    await f.attach();
    await f.worker.runBatch();
    expect((await current(f))?.retention).toMatchObject({
      status: "retained",
      expiresAt: null,
    });
  });

  it.each([
    new PlanError(
      "GITHUB_ACCESS_DENIED",
      "GitHub installation access was denied",
    ),
    new PlanError("GITHUB_WORK_NOT_FOUND", "GitHub returned 404"),
    new PlanError(
      "GITHUB_UNAVAILABLE",
      "GitHub rate limit prevents verification",
    ),
    new Error("network failure with private transport details"),
  ])("retains content on failed GitHub verification: %s", async (failure) => {
    const f = await setup();
    await f.create();
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    await f.attach();
    f.day(31);
    f.fail(failure);
    await f.worker.runBatch();
    expect((await current(f))?.retention).toMatchObject({
      status: "unknown",
      expiresAt: null,
    });
    expect((await current(f))?.retention.reason).not.toContain(
      "private transport details",
    );
    expect(f.sql("SELECT * FROM deleted_plans")).toHaveLength(0);
    f.fail();
    f.day(32);
    await f.worker.runBatch();
    expect(await current(f)).toBeUndefined();
  });

  it("retains when credentials are missing or closure time is unreliable", async () => {
    const f = await setup();
    await f.create();
    await f.attach();
    f.day(40);
    await new PlanRetention(f.retentionStore, undefined, f.now).runBatch();
    expect((await current(f))?.retention).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("not configured"),
    });
    for (const closedAt of [undefined, "invalid", "2099-01-01T00:00:00Z"]) {
      f.states.set(1, {
        state: "closed",
        ...(closedAt === undefined ? {} : { closedAt }),
      });
      await f.attach();
      await f.worker.runBatch();
      expect((await current(f))?.retention).toMatchObject({
        status: "unknown",
        expiresAt: null,
      });
    }
  });

  it("retains if the final revalidation fails or observes reopening", async () => {
    for (const reopen of [false, true]) {
      const f = await setup();
      await f.create();
      f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
      await f.attach();
      f.day(31);
      const initial = f.calls();
      f.onWork(async () => {
        if (f.calls() === initial + 2) {
          if (reopen) f.states.set(1, { state: "open" });
          else f.fail(new Error("network"));
        }
      });
      await f.worker.runBatch();
      expect((await current(f))?.retention.status).toBe(
        reopen ? "retained" : "unknown",
      );
    }
  });

  it("invalidates deletion if an attachment commits during verification", async () => {
    const f = await setup();
    await f.create();
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    await f.attach();
    f.day(31);
    f.onWork(async () => {
      f.onWork();
      await f.attach(2);
    });
    expect((await f.worker.runBatch())[0]?.result).toBe("changed");
    expect(await current(f)).toBeDefined();
    await f.worker.runBatch();
    expect((await current(f))?.retention.status).toBe("retained");
  });

  it("invalidates deletion for a concurrent revision and rejects an attachment after deletion", async () => {
    const f = await setup();
    const request = await f.create();
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    await f.attach();
    f.day(31);
    f.onWork(async () => {
      f.onWork();
      await f.service.write("owner-a", {
        ...request,
        expectedVersion: 1,
        operationId: "concurrent",
      });
    });
    expect((await f.worker.runBatch())[0]?.result).toBe("changed");
    expect((await current(f))?.version).toBe(2);
    await f.worker.runBatch();
    await expect(f.attach(2)).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
  });

  it("rolls back an interrupted cleanup and resumes after restart with bounded batches", async () => {
    const f = await setup();
    await f.create("a");
    await f.create("b");
    f.day(31);
    f.sql(
      "CREATE TRIGGER interrupt_cleanup BEFORE DELETE ON asset_objects BEGIN SELECT RAISE(ABORT, 'simulated process interruption'); END",
    );
    await expect(f.worker.runBatch(1)).rejects.toThrow();
    expect(f.sql("SELECT * FROM plans")).toHaveLength(2);
    expect(f.sql("SELECT * FROM plan_revisions")).toHaveLength(2);
    expect(f.sql("SELECT * FROM deleted_plans")).toHaveLength(0);
    f.sql("DROP TRIGGER interrupt_cleanup");
    const restarted = new PlanRetention(
      new RetentionStore(f.filename),
      f.github,
      f.now,
    );
    expect(await restarted.runBatch(1)).toHaveLength(1);
    expect(f.sql("SELECT * FROM plans")).toHaveLength(1);
    await restarted.runBatch(1);
    expect(f.sql("SELECT * FROM plans")).toHaveLength(0);
    expect(f.sql("SELECT * FROM asset_objects")).toHaveLength(0);
  });

  it("deletes revisions, associations and all owned asset bytes while preserving retained copies", async () => {
    const f = await setup();
    const request = await f.create();
    await f.create("retained");
    await f.service.write("owner-a", {
      ...request,
      expectedVersion: 1,
      operationId: "revision",
    });
    f.states.set(1, { state: "closed", closedAt: f.now().toISOString() });
    await f.attach(1);
    await f.attach(2, "issue", "retained");
    f.day(31);
    await f.worker.runBatch();
    for (const table of [
      "plan_revisions",
      "github_work_links",
      "asset_objects",
      "assets",
      "work_items",
      "shared_contexts",
      "decisions",
      "acceptance_criteria",
    ]) {
      expect(
        f.sql(`SELECT * FROM ${table} WHERE plan_id = 'plan'`),
      ).toHaveLength(0);
      expect(
        f.sql(`SELECT * FROM ${table} WHERE plan_id = 'retained'`).length,
      ).toBeGreaterThan(0);
    }
    const descriptor = request.plan.assets[0]!;
    await expect(
      f.service.getAsset("owner-a", {
        contractVersion: "v1",
        planId: "retained",
        assetId: descriptor.id,
        digest: descriptor.digest,
        content: "rendered",
      }),
    ).resolves.toBeDefined();
  });

  it("shows retention in owner and MCP results and makes expired public and MCP URLs unavailable", async () => {
    const f = await setup();
    const request = await f.create();
    await f.service.verifyRepository("owner-a", {
      contractVersion: "v1",
      planId: "plan",
    });
    await f.service.publish("owner-a", {
      contractVersion: "v1",
      planId: "plan",
    });
    const server = await startTestServer(f.filename, 0, undefined, f.github);
    const client = new IruddMcpClient(new URL(`${server.url}/mcp`), "token-a");
    try {
      await client.connect();
      const owner = await fetch(`${server.url}/api/plans/plan`, {
        headers: { authorization: "Bearer browser-a" },
      });
      expect(await owner.json()).toMatchObject({
        retention: {
          status: "scheduled",
          expiresAt: "2026-01-31T00:00:00.000Z",
        },
      });
      expect(await f.service.getOverview("owner-a", "plan")).toMatchObject({
        retention: { status: "scheduled" },
      });
      const publicUrl = `${server.url}/public/plans/owner-a/plan`;
      expect(
        await (await fetch(`${publicUrl}/document`)).json(),
      ).not.toHaveProperty("retention");
      f.day(31);
      await f.worker.runBatch();
      await f.create("other");
      for (const suffix of [
        "",
        "/document",
        "/events",
        "/items/item-1",
        `/assets/asset-contract?digest=${encodeURIComponent(request.plan.assets[0]!.digest)}`,
      ]) {
        const response = await fetch(`${publicUrl}${suffix}`);
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(request.plan.epicGoal);
      }
      expect(
        await client.callTool("get_github_reference", {
          contractVersion: "v1",
          planId: "plan",
        }),
      ).toMatchObject({ isError: true });
      expect(
        await f.service.checkPacket("owner-a", {
          contractVersion: "v1",
          planId: "plan",
          itemId: "item-1",
          packetVersion: "old",
        }),
      ).toEqual({ status: "unavailable" });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
