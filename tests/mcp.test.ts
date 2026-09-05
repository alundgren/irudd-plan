import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { clonePlan, tenItemPlan } from "./fixture.js";
import { startTestServer } from "./test-service.js";
import { IruddMcpClient } from "../src/client/mcp-client.js";

const activeServers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(activeServers.splice(0).map((server) => server.close()));
});

describe("authenticated MCP", () => {
  it("negotiates 2026-07-28, persists a plan, and returns a focused packet after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "irudd-plan-restart-"));
    const filename = join(directory, "plans.db");
    const first = await startTestServer(filename);
    activeServers.push(first);
    const client = new IruddMcpClient(new URL(`${first.url}/mcp`), "token-a");
    await expect(client.initialize()).resolves.toMatchObject({ protocolVersion: "2026-07-28" });
    await expect(client.listTools()).resolves.toMatchObject({
      tools: expect.arrayContaining([expect.objectContaining({ name: "write_plan" })]),
    });
    const plan = tenItemPlan();
    await client.callTool("write_plan", {
      operationId: "mcp-create",
      expectedVersion: null,
      plan,
    });
    await first.close();
    activeServers.splice(activeServers.indexOf(first), 1);

    const second = await startTestServer(filename);
    activeServers.push(second);
    const restarted = new IruddMcpClient(new URL(`${second.url}/mcp`), "token-a");
    await restarted.initialize();
    const result = await restarted.callTool<{
      isError?: boolean;
      structuredContent: {
        item: { id: string };
        epic: { index: unknown[] };
        contexts: Array<{ id: string }>;
        relatedContextIds: string[];
      };
    }>("get_work_item", {
      contractVersion: "v1",
      planId: plan.planId,
      itemId: "item-1",
    });
    expect(result.isError).not.toBe(true);
    const packet = result.structuredContent;
    expect(packet.item.id).toBe("item-1");
    expect(packet.epic.index).toHaveLength(10);
    expect(packet.contexts.map((value: { id: string }) => value.id).sort()).toEqual([
      "context-auth",
      "context-base",
    ]);
    expect(packet.relatedContextIds).toEqual(["context-optional"]);
    expect(JSON.stringify(packet)).not.toContain("Sibling specification 2");

    const sibling = await restarted.readResource<{ contents: Array<{ text: string }> }>(
      "irudd-plan://plans/plan-alpha/items/item-2",
    );
    expect(sibling.contents[0]!.text).toContain("Sibling specification 2");
  });

  it("rejects forged, expired, unknown, cross-owner, and incompatible requests", async () => {
    const running = await startTestServer();
    activeServers.push(running);
    for (const token of ["forged", "expired", "unknown"]) {
      const response = await fetch(`${running.url}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2026-07-28",
            capabilities: {},
            clientInfo: { name: "x", version: "1" },
          },
        }),
      });
      expect(response.status).toBe(401);
    }

    const clientA = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-a");
    await clientA.initialize();
    await clientA.callTool("write_plan", {
      operationId: "private-create",
      expectedVersion: null,
      plan: tenItemPlan("private-plan"),
    });
    const clientB = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-b");
    await clientB.initialize();
    const privateRead = await clientB.callTool("get_work_item", {
      contractVersion: "v1",
      planId: "private-plan",
      itemId: "item-1",
    });
    expect(privateRead).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PLAN_NOT_FOUND", message: "Plan is unavailable" } },
    });
    await expect(clientB.callTool("list_plans", { contractVersion: "v1" })).resolves.toMatchObject({
      structuredContent: [],
    });
    await expect(
      clientB.callTool("get_related_context", {
        contractVersion: "v1",
        planId: "private-plan",
        contextId: "context-auth",
      }),
    ).resolves.toMatchObject({ structuredContent: { error: { code: "PLAN_NOT_FOUND" } } });

    const unsupported = await clientA.callTool("get_work_item", {
      contractVersion: "v2",
      planId: "private-plan",
      itemId: "item-1",
    });
    expect(unsupported).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "CONTRACT_UNSUPPORTED" } },
    });

    const protocolResponse = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "x", version: "1" },
        },
      }),
    });
    expect(await protocolResponse.json()).toMatchObject({
      error: { data: { code: "MCP_PROTOCOL_UNSUPPORTED", supported: ["2026-07-28"] } },
    });
  });

  it("reports deleted and unavailable packets without returning stale content", async () => {
    const running = await startTestServer();
    activeServers.push(running);
    const client = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-a");
    await client.initialize();
    const plan = tenItemPlan("packet-checks");
    await client.callTool("write_plan", {
      operationId: "check-create",
      expectedVersion: null,
      plan,
    });
    const read = await client.callTool<{ structuredContent: { packetVersion: string } }>(
      "get_work_item",
      {
        contractVersion: "v1",
        planId: plan.planId,
        itemId: "item-2",
      },
    );
    const withoutItemSource = clonePlan(plan);
    const withoutItem = {
      ...withoutItemSource,
      items: withoutItemSource.items
        .filter((item) => item.id !== "item-2")
        .map((item) => (item.id === "item-1" ? { ...item, relatedItemIds: [] } : item)),
    };
    await client.callTool("write_plan", {
      operationId: "check-delete",
      expectedVersion: 1,
      plan: withoutItem,
    });
    const deleted = await client.callTool<{ structuredContent: { status: string } }>(
      "check_packet",
      {
        contractVersion: "v1",
        planId: plan.planId,
        itemId: "item-2",
        packetVersion: read.structuredContent.packetVersion,
      },
    );
    expect(deleted.structuredContent).toEqual({ status: "deleted" });
    const unavailable = await client.callTool<{ structuredContent: { status: string } }>(
      "check_packet",
      {
        contractVersion: "v1",
        planId: "missing",
        itemId: "item-2",
        packetVersion: read.structuredContent.packetVersion,
      },
    );
    expect(unavailable.structuredContent).toEqual({ status: "unavailable" });
  });
});
