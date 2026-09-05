import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { clonePlan, tenItemPlan } from "./fixture.js";
import { startTestServer } from "./test-service.js";
import { IruddMcpClient } from "../src/client/mcp-client.js";
import { MCP_PROTOCOL_VERSION } from "../src/contract/plan.js";

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
    await expect(client.connect()).resolves.toMatchObject({
      supportedVersions: expect.arrayContaining(["2026-07-28"]),
    });
    await expect(client.listTools()).resolves.toMatchObject({
      tools: expect.arrayContaining([expect.objectContaining({ name: "write_plan" })]),
    });
    const plan = tenItemPlan();
    const writeResult = await client.callTool<{
      structuredContent: { resourceUri: string };
    }>("write_plan", {
      operationId: "mcp-create",
      expectedVersion: null,
      plan,
    });
    const overview = await client.readResource<{ contents: Array<{ text: string }> }>(
      writeResult.structuredContent.resourceUri,
    );
    expect(overview.contents[0]!.text).not.toContain("Sibling specification 2");
    await first.close();
    activeServers.splice(activeServers.indexOf(first), 1);

    const second = await startTestServer(filename);
    activeServers.push(second);
    const restarted = new IruddMcpClient(new URL(`${second.url}/mcp`), "token-a");
    await restarted.connect();
    const result = await restarted.callTool<{
      isError?: boolean;
      structuredContent: {
        item: { id: string };
        epic: { index: unknown[] };
        contexts: Array<{ id: string }>;
        relatedContextIds: string[];
        resourceUri: string;
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
    const currentItem = await restarted.readResource<{ contents: Array<{ text: string }> }>(
      packet.resourceUri,
    );
    expect(currentItem.contents[0]!.text).toContain('"itemId":"item-1"');

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
        headers: modernHeaders(token, "server/discover"),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: { _meta: modernMeta() },
        }),
      });
      expect(response.status).toBe(401);
    }

    const clientA = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-a");
    await clientA.connect();
    await clientA.callTool("write_plan", {
      operationId: "private-create",
      expectedVersion: null,
      plan: tenItemPlan("private-plan"),
    });
    const clientB = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-b");
    await clientB.connect();
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
      headers: modernHeaders("token-a", "server/discover", "2099-01-01"),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: { _meta: modernMeta("2099-01-01") },
      }),
    });
    expect(await protocolResponse.json()).toMatchObject({
      error: { data: { supported: ["2026-07-28"] } },
    });
  });

  it("emits modern wire fields and rejects routing-header mismatches", async () => {
    const running = await startTestServer();
    activeServers.push(running);
    const discovery = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: modernHeaders("token-a", "server/discover"),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: { _meta: modernMeta() },
      }),
    });
    expect(await discovery.json()).toMatchObject({
      result: {
        resultType: "complete",
        ttlMs: 0,
        cacheScope: "private",
        supportedVersions: expect.arrayContaining([MCP_PROTOCOL_VERSION]),
      },
    });

    const mismatch = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: modernHeaders("token-a", "resources/list"),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: { _meta: modernMeta() },
      }),
    });
    expect(await mismatch.json()).toMatchObject({ error: { code: -32020 } });

    const nameMismatch = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: {
        ...modernHeaders("token-a", "tools/call"),
        "mcp-name": "list_plans",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_work_item",
          arguments: { contractVersion: "v1", planId: "x", itemId: "y" },
          _meta: modernMeta(),
        },
      }),
    });
    expect(await nameMismatch.json()).toMatchObject({ error: { code: -32020 } });
  });

  it("rejects invalid nested content and non-positive or fractional versions at the MCP boundary", async () => {
    const running = await startTestServer();
    activeServers.push(running);
    const client = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-a");
    await client.connect();
    const plan = clonePlan(tenItemPlan("invalid-boundary"));
    const emptyRequirement = {
      ...plan,
      items: plan.items.map((item, index) =>
        index === 0 ? { ...item, requirements: [""] } : item,
      ),
    };
    await expect(
      client.callTool("write_plan", {
        operationId: "invalid-content",
        expectedVersion: null,
        plan: emptyRequirement,
      }),
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "REQUEST_INVALID" } },
    });

    for (const expectedVersion of [-1, 1.5]) {
      await expect(
        client.callTool("write_plan", {
          operationId: `invalid-version-${expectedVersion}`,
          expectedVersion,
          plan,
        }),
      ).resolves.toMatchObject({ isError: true });
    }
  });

  it("reports deleted and unavailable packets without returning stale content", async () => {
    const running = await startTestServer();
    activeServers.push(running);
    const client = new IruddMcpClient(new URL(`${running.url}/mcp`), "token-a");
    await client.connect();
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

function modernMeta(version: string = MCP_PROTOCOL_VERSION) {
  return {
    "io.modelcontextprotocol/protocolVersion": version,
    "io.modelcontextprotocol/clientInfo": { name: "irudd-plan-test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

function modernHeaders(token: string, method: string, version: string = MCP_PROTOCOL_VERSION) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": version,
    "mcp-method": method,
  };
}
