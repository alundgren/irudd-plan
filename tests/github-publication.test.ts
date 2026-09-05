import { createServer } from "node:http";

import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { IruddMcpClient } from "../src/client/mcp-client.js";
import { PlanError } from "../src/contract/errors.js";
import { PlanService } from "../src/domain/plan-service.js";
import {
  GitHubConnection,
  GitHubAppReader,
  type GitHubReader,
  type VerifiedGitHubRepository,
} from "../src/github/github-app.js";
import { clonePlan, fixtureAssetUpload, tenItemPlan } from "./fixture.js";
import { createTestStore, startTestServer } from "./test-service.js";

class FakeGitHubReader implements GitHubReader {
  revoked = false;
  workState = "open";
  visibility: "public" | "private" = "public";

  async repository(
    _installationId: number,
    owner: string,
    name: string,
  ): Promise<VerifiedGitHubRepository> {
    if (this.revoked) {
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "GitHub installation access was denied",
      );
    }
    return {
      id: `${owner.toLowerCase()}/${name.toLowerCase()}`,
      owner,
      name,
      visibility: name === "private" ? "private" : this.visibility,
      url: `https://github.com/${owner}/${name}`,
    };
  }

  async work(
    _installationId: number,
    repository: VerifiedGitHubRepository,
    type: "issue" | "pull_request",
    number: number,
  ) {
    if (this.revoked) {
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "GitHub installation access was denied",
      );
    }
    return {
      nodeId: `${repository.id}:${type}:${number}`,
      databaseId: String(10_000 + number),
      type,
      number,
      url: `${repository.url}/${type === "issue" ? "issues" : "pull"}/${number}`,
      state: this.workState,
      observedAt: "2026-09-05T19:00:00.000Z",
    };
  }
}

function connection(reader: GitHubReader) {
  return new GitHubConnection(
    [
      {
        ownerId: "owner-a",
        installationId: 101,
        repositories: [
          { owner: "example", name: "project" },
          { owner: "example", name: "private" },
        ],
      },
      {
        ownerId: "owner-b",
        installationId: 202,
        repositories: [{ owner: "other", name: "project" }],
      },
    ],
    reader,
  );
}

const active: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(active.splice(0).map((value) => value.close()));
});

describe("GitHub verification and publication", () => {
  it("uses an expiring installation token for GitHub reads", async () => {
    const keyPair = await generateKeyPair("RS256", { extractable: true });
    const privateKey = await exportPKCS8(keyPair.privateKey);
    let tokenRequests = 0;
    let repositoryRequests = 0;
    const github = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/app/installations/500/access_tokens") {
        response.writeHead(500).end("{}");
        return;
      }
      if (request.url === "/app/installations/501/access_tokens") {
        response.end("{");
        return;
      }
      if (request.url === "/app/installations/101/access_tokens") {
        tokenRequests += 1;
        expect(request.method).toBe("POST");
        expect(request.headers.authorization).toMatch(/^Bearer ey/);
        response.end(
          JSON.stringify({
            token: "installation-token",
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          }),
        );
        return;
      }
      if (request.url?.startsWith("/repos/example/")) {
        if (request.url === "/repos/example/invalid-json") {
          response.end("{");
          return;
        }
        const workMatch = request.url.match(
          /^\/repos\/example\/project\/(issues|pulls)\/(\d+)$/,
        );
        if (workMatch?.[1] !== undefined && workMatch[2] !== undefined) {
          const workNumber = Number(workMatch[2]);
          const invalidIds: Record<number, unknown> = {
            1: undefined,
            2: null,
            3: "not-a-number",
            4: 0,
            5: Number.MAX_SAFE_INTEGER + 1,
          };
          const body: Record<string, unknown> = {
            id: invalidIds[workNumber],
            node_id: `node-${workNumber}`,
            number: workNumber,
            html_url: `https://github.com/example/project/${workMatch[1]}/${workNumber}`,
            state: "open",
          };
          response.end(JSON.stringify(body));
          return;
        }
        expect(request.headers.authorization).toBe("Bearer installation-token");
        const name = request.url.slice("/repos/example/".length);
        if (name === "project") repositoryRequests += 1;
        const body: Record<string, unknown> = {
          id: 42,
          name,
          owner: { login: "example" },
          private: false,
          html_url: `https://github.com/example/${name}`,
        };
        if (name === "missing-private") delete body.private;
        if (name === "null-private") body.private = null;
        if (name === "missing-id") delete body.id;
        response.end(JSON.stringify(body));
        return;
      }
      response.writeHead(404).end("{}");
    });
    await new Promise<void>((resolve) =>
      github.listen(0, "127.0.0.1", resolve),
    );
    const address = github.address();
    if (address === null || typeof address === "string") {
      throw new Error("Missing GitHub test address");
    }
    try {
      const reader = new GitHubAppReader(
        "1234",
        privateKey,
        `http://127.0.0.1:${address.port}`,
      );
      await reader.repository(101, "example", "project");
      await reader.repository(101, "example", "project");
      for (const name of ["missing-private", "null-private", "missing-id"]) {
        await expect(
          reader.repository(101, "example", name),
        ).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
      }
      const repository = await reader.repository(101, "example", "project");
      for (const type of ["issue", "pull_request"] as const) {
        for (const workNumber of [1, 2, 3, 4, 5]) {
          await expect(
            reader.work(101, repository, type, workNumber),
          ).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
        }
      }
      await expect(
        reader.repository(500, "example", "project"),
      ).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
      await expect(
        reader.repository(501, "example", "project"),
      ).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
      await expect(
        reader.repository(101, "example", "invalid-json"),
      ).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
      expect(tokenRequests).toBe(1);
      expect(repositoryRequests).toBe(3);
    } finally {
      await new Promise<void>((resolve, reject) =>
        github.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("requires configured owner access and a verified public repository", async () => {
    const reader = new FakeGitHubReader();
    const running = await startTestServer(
      undefined,
      0,
      undefined,
      connection(reader),
    );
    active.push(running);
    const publicPlan = tenItemPlan("public-plan");
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(publicPlan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "create-public",
      expectedVersion: null,
      plan: publicPlan,
    });
    await expect(
      running.service.publish("owner-a", {
        contractVersion: "v1",
        planId: publicPlan.planId,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_NOT_ALLOWED" });
    await expect(
      running.service.verifyRepository("owner-b", {
        contractVersion: "v1",
        planId: publicPlan.planId,
      }),
    ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });

    const forged = {
      ...tenItemPlan("forged-plan"),
      repository: {
        provider: "github" as const,
        owner: "not-allowed",
        name: "project",
      },
    };
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(forged.planId),
    );
    await running.service.write("owner-a", {
      operationId: "create-forged",
      expectedVersion: null,
      plan: forged,
    });
    await expect(
      running.service.verifyRepository("owner-a", {
        contractVersion: "v1",
        planId: forged.planId,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_ACCESS_DENIED" });

    const privatePlan = {
      ...tenItemPlan("private-repository-plan"),
      repository: {
        provider: "github" as const,
        owner: "example",
        name: "private",
      },
    };
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(privatePlan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "create-private",
      expectedVersion: null,
      plan: privatePlan,
    });
    await running.service.verifyRepository("owner-a", {
      contractVersion: "v1",
      planId: privatePlan.planId,
    });
    await expect(
      running.service.write("owner-a", {
        operationId: "rebind-private",
        expectedVersion: 1,
        plan: {
          ...clonePlan(privatePlan),
          repository: {
            provider: "github",
            owner: "example",
            name: "project",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PLAN_CONFLICT" });
    await expect(
      running.service.publish("owner-a", {
        contractVersion: "v1",
        planId: privatePlan.planId,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_NOT_ALLOWED" });
  });

  it("associates several links idempotently and rejects revoked access", async () => {
    const reader = new FakeGitHubReader();
    const store = await createTestStore();
    const service = new PlanService(
      store,
      undefined,
      undefined,
      connection(reader),
    );
    const plan = tenItemPlan("linked-plan");
    await service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
    await service.write("owner-a", {
      operationId: "create-linked",
      expectedVersion: null,
      plan,
    });
    await service.verifyRepository("owner-a", {
      contractVersion: "v1",
      planId: plan.planId,
    });
    const issueRequest = {
      contractVersion: "v1" as const,
      planId: plan.planId,
      itemId: "item-1",
      type: "issue" as const,
      number: 8,
    };
    await service.associateGitHubWork("owner-a", issueRequest);
    reader.workState = "closed";
    await service.associateGitHubWork("owner-a", issueRequest);
    await service.associateGitHubWork("owner-a", {
      ...issueRequest,
      type: "pull_request",
      number: 16,
    });
    await expect(
      store.listGitHubWork("owner-a", plan.planId),
    ).resolves.toMatchObject([
      { number: 8, state: "closed", itemId: "item-1" },
      { number: 16, type: "pull_request" },
    ]);
    await expect(
      service.associateGitHubWork("owner-a", {
        ...issueRequest,
        itemId: "missing",
      }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    reader.revoked = true;
    await expect(
      service.associateGitHubWork("owner-a", issueRequest),
    ).rejects.toMatchObject({
      code: "GITHUB_ACCESS_DENIED",
    });
  });

  it("serves only published current documents, assets, and events anonymously", async () => {
    const reader = new FakeGitHubReader();
    const running = await startTestServer(
      undefined,
      0,
      undefined,
      connection(reader),
    );
    active.push(running);
    const plan = tenItemPlan("anonymous-plan");
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(plan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "anonymous-create",
      expectedVersion: null,
      plan,
    });
    const publicRoot = `${running.url}/public/plans/owner-a/${plan.planId}`;
    expect((await fetch(`${publicRoot}/document`)).status).toBe(404);
    expect((await fetch(`${publicRoot}/events`)).status).toBe(404);
    expect(
      (
        await fetch(
          `${publicRoot}/assets/asset-contract?digest=${encodeURIComponent(plan.assets[0]!.digest)}`,
        )
      ).status,
    ).toBe(404);
    const directOrigin = await fetch(`${running.url}/api/plans/${plan.planId}`);
    expect(directOrigin.status).toBe(401);
    expect(await directOrigin.text()).not.toContain(plan.epicGoal);
    expect(
      (
        await fetch(
          `${running.url}/api/plans/${plan.planId}/assets/asset-contract?digest=${encodeURIComponent(plan.assets[0]!.digest)}`,
        )
      ).status,
    ).toBe(401);

    await running.service.verifyRepository("owner-a", {
      contractVersion: "v1",
      planId: plan.planId,
    });
    await running.service.publish("owner-a", {
      contractVersion: "v1",
      planId: plan.planId,
    });
    const first = await fetch(`${publicRoot}/document`);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("public, no-cache");
    await expect(first.json()).resolves.toMatchObject({
      version: 1,
      access: { published: true, repositoryVisibility: "public" },
    });
    const asset = await fetch(
      `${publicRoot}/assets/asset-contract?digest=${encodeURIComponent(plan.assets[0]!.digest)}`,
    );
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, no-cache");
    expect((await fetch(`${publicRoot}/items/item-1`)).status).toBe(200);
    const eventController = new AbortController();
    const events = await fetch(`${publicRoot}/events`, {
      signal: eventController.signal,
    });
    expect(events.status).toBe(200);
    expect(events.headers.get("cache-control")).toBe("public, no-cache");
    eventController.abort();

    const revised = {
      ...clonePlan(plan),
      epicGoal: "The public current revision",
      assets: [],
      contexts: plan.contexts.map((context) => ({
        ...context,
        assetIds: [],
      })),
      decisions: plan.decisions.map((decision) => ({
        ...decision,
        assetIds: [],
      })),
      items: plan.items.map((item) => ({
        ...item,
        requiredAssetIds: [],
      })),
    };
    await running.service.write("owner-a", {
      operationId: "anonymous-update",
      expectedVersion: 1,
      plan: revised,
    });
    await expect(
      (await fetch(`${publicRoot}/document`)).json(),
    ).resolves.toMatchObject({
      version: 2,
      plan: { epicGoal: revised.epicGoal },
      access: { published: true },
    });
    expect(
      (
        await fetch(
          `${publicRoot}/assets/asset-contract?digest=${encodeURIComponent(plan.assets[0]!.digest)}`,
        )
      ).status,
    ).toBe(404);

    const accessUpdates: number[] = [];
    const unsubscribe = running.service.updates.subscribe(
      "owner-a",
      plan.planId,
      (update) => accessUpdates.push(update.version),
    );
    reader.visibility = "private";
    await expect(
      running.service.publish("owner-a", {
        contractVersion: "v1",
        planId: plan.planId,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_NOT_ALLOWED" });
    unsubscribe();
    expect(accessUpdates).toContain(2);
    await expect(
      running.service.current("owner-a", plan.planId),
    ).resolves.toMatchObject({
      access: { published: false, repositoryVisibility: "private" },
    });
    await expect(
      running.service.getGitHubReference("owner-a", {
        contractVersion: "v1",
        planId: plan.planId,
        itemId: "item-1",
      }),
    ).resolves.toMatchObject({
      publicationStatus: "private",
      humanUrl: "https://plans.example/plans/anonymous-plan/items/item-1",
    });
    expect((await fetch(`${publicRoot}/document`)).status).toBe(404);
  });

  it("exposes MCP actions and returns stable GitHub text for a selected item", async () => {
    const reader = new FakeGitHubReader();
    const running = await startTestServer(
      undefined,
      0,
      undefined,
      connection(reader),
    );
    active.push(running);
    const plan = tenItemPlan("mcp-publication");
    await running.service.uploadAsset(
      "owner-a",
      fixtureAssetUpload(plan.planId),
    );
    await running.service.write("owner-a", {
      operationId: "mcp-publication-create",
      expectedVersion: null,
      plan,
    });
    const client = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-a");
    await client.connect();
    await client.callTool("verify_github_repository", {
      contractVersion: "v1",
      planId: plan.planId,
    });
    await expect(
      client.callTool("associate_github_work", {
        contractVersion: "v1",
        planId: plan.planId,
        type: "issue",
        number: 8,
        installationId: 202,
        repositoryUrl: "https://github.com/other/project",
      }),
    ).resolves.toMatchObject({ isError: true });
    await client.callTool("associate_github_work", {
      contractVersion: "v1",
      planId: plan.planId,
      itemId: "item-1",
      type: "issue",
      number: 8,
    });
    await client.callTool("publish_plan", {
      contractVersion: "v1",
      planId: plan.planId,
    });
    const reference = await client.callTool<{
      structuredContent: {
        githubText: string;
        humanUrl: string;
        resourceUri: string;
      };
    }>("get_github_reference", {
      contractVersion: "v1",
      planId: plan.planId,
      itemId: "item-1",
    });
    expect(reference.structuredContent.humanUrl).toBe(
      "https://plans.example/public/plans/owner-a/mcp-publication/items/item-1",
    );
    expect(reference.structuredContent.resourceUri).toBe(
      "irudd-plan://plans/mcp-publication/items/item-1",
    );
    expect(reference.structuredContent.githubText).toContain("Complete task 1");
    expect(reference.structuredContent.githubText).not.toContain(
      "Sibling specification",
    );
    await client.close();
  });
});
