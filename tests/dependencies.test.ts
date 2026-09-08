import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Client } from "@modelcontextprotocol/client";
import { decode, Plan, WorkItem } from "../src/contract/plan.js";
import {
  collectRequiredPacket,
  digest,
  validatePlan,
} from "../src/domain/validate-plan.js";
import { IruddMcpClient } from "../src/client/mcp-client.js";
import { fixtureAssetUpload, tenItemPlan } from "./fixture.js";
import { startTestServer } from "./test-service.js";

function withEdges(edges: Readonly<Record<string, readonly string[]>>): Plan {
  const plan = tenItemPlan();
  return {
    ...plan,
    items: plan.items.map((item) =>
      edges[item.id] === undefined
        ? item
        : { ...item, dependsOnItemIds: edges[item.id]! },
    ),
  };
}
afterEach(() => vi.restoreAllMocks());

describe("item dependencies", () => {
  it("decodes dependencies without backfilling legacy fields and explicitly drops unknown fields", () => {
    const legacy = tenItemPlan();
    const decoded = decode(Plan, legacy);
    expect(decoded).toEqual(legacy);
    expect(decoded.items[0]).not.toHaveProperty("dependsOnItemIds");
    expect(digest(collectRequiredPacket(decoded, "item-1"))).toBe(
      digest(collectRequiredPacket(legacy, "item-1")),
    );
    const item = {
      ...legacy.items[0]!,
      dependsOnItemIds: ["item-2"],
      unknownExtension: ["lost"],
    };
    expect(decode(WorkItem, item)).toEqual({
      ...legacy.items[0],
      dependsOnItemIds: ["item-2"],
    });
    expect(() =>
      decode(WorkItem, { ...item, dependsOnItemIds: "item-2" }),
    ).toThrow();
    expect(() =>
      decode(WorkItem, { ...item, dependsOnItemIds: [""] }),
    ).toThrow();
  });

  it.each([
    [
      { "item-1": ["item-1"] },
      "REFERENCE_CYCLE",
      { itemIds: ["item-1", "item-1"] },
    ],
    [
      { "item-1": ["missing"] },
      "REFERENCE_MISSING",
      { id: "missing", source: "item item-1 dependsOnItemIds" },
    ],
    [
      { "item-1": ["item-2", "item-2"] },
      "DUPLICATE_ID",
      { itemId: "item-1", dependencyId: "item-2" },
    ],
    [
      { "item-1": ["item-2"], "item-2": ["item-3"], "item-3": ["item-1"] },
      "REFERENCE_CYCLE",
      { itemIds: ["item-1", "item-2", "item-3", "item-1"] },
    ],
  ] as const)(
    "rejects invalid graph %j with affected IDs",
    (edges, code, details) => {
      expect(() => validatePlan(withEdges(edges))).toThrow(
        expect.objectContaining({ code, details }),
      );
    },
  );

  it("accepts diamonds, disconnected items and independent related links", () => {
    expect(() =>
      validatePlan(
        withEdges({
          "item-1": ["item-2", "item-3"],
          "item-2": ["item-4"],
          "item-3": ["item-4"],
        }),
      ),
    ).not.toThrow();
  });

  it("checks feature support before sending any dependency field to an old server", async () => {
    const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({
      content: [],
      structuredContent: { contractVersion: "v1" },
    });
    const client = new IruddMcpClient(new URL("http://localhost/mcp"), "test");
    for (const dependencies of [["item-2"], []]) {
      await expect(
        client.callTool("write_plan", {
          plan: withEdges({ "item-1": dependencies }),
        }),
      ).rejects.toThrow("does not advertise itemDependencies");
    }
    expect(call.mock.calls.map(([request]) => request.name)).toEqual([
      "get_contract",
      "get_contract",
    ]);
    await client.callTool("write_plan", { plan: tenItemPlan() });
    expect(call.mock.calls.at(-1)?.[0].name).toBe("write_plan");
  });

  it("round trips dependencies through MCP, browser and both indexes while keeping selected packets focused", async () => {
    const server = await startTestServer();
    const client = new IruddMcpClient(new URL(`${server.url}/mcp`), "token-a");
    try {
      await client.connect();
      await server.service.uploadAsset(
        "owner-a",
        fixtureAssetUpload("plan-alpha"),
      );
      const contract = await client.callTool("get_contract", {
        contractVersion: "v1",
      });
      expect(contract.structuredContent).toMatchObject({
        features: { itemDependencies: true },
        contractVersion: "v1",
      });
      const plan = withEdges({ "item-1": ["item-2"] });
      const request = { operationId: "create", expectedVersion: null, plan };
      expect((await client.callTool("write_plan", request)).isError).not.toBe(
        true,
      );
      expect(
        (
          await client.callTool("get_plan", {
            contractVersion: "v1",
            planId: plan.planId,
          })
        ).structuredContent,
      ).toMatchObject({ plan });
      const selected = {
        contractVersion: "v1" as const,
        planId: plan.planId,
        itemId: "item-1",
      };
      const packet = await server.service.getItem("owner-a", selected);
      expect(packet.item.dependsOnItemIds).toEqual(["item-2"]);
      expect(packet.epic.index[0]?.dependsOnItemIds).toEqual(["item-2"]);
      const overview = await server.service.getOverview("owner-a", plan.planId);
      expect(overview.index[0]?.dependsOnItemIds).toEqual(["item-2"]);
      expect(JSON.stringify(packet)).not.toContain("Sibling specification 2");
      const browser = await fetch(`${server.url}/api/plans/${plan.planId}`, {
        headers: { authorization: "Bearer browser-a" },
      });
      expect(browser.status).toBe(200);
      expect((await browser.json()).plan.items[0].dependsOnItemIds).toEqual([
        "item-2",
      ]);
      const sibling = {
        ...plan,
        items: plan.items.map((item) =>
          item.id === "item-2"
            ? {
                ...item,
                title: "New prerequisite title",
                requirements: ["Changed sibling"],
                dependsOnItemIds: ["item-3"],
              }
            : item,
        ),
      };
      await server.service.write("owner-a", {
        operationId: "sibling",
        expectedVersion: 1,
        plan: sibling,
      });
      expect(
        (await server.service.getItem("owner-a", selected)).packetVersion,
      ).toBe(packet.packetVersion);
      const changed = {
        ...sibling,
        items: sibling.items.map((item) =>
          item.id === "item-1"
            ? { ...item, dependsOnItemIds: ["item-3"] }
            : item,
        ),
      };
      await server.service.write("owner-a", {
        operationId: "selected",
        expectedVersion: 2,
        plan: changed,
      });
      expect(
        (await server.service.getItem("owner-a", selected)).packetVersion,
      ).not.toBe(packet.packetVersion);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects omitted lists and invalid removals atomically, preserves replay, and permits explicit clearing", async () => {
    const server = await startTestServer();
    try {
      const plan = withEdges({ "item-1": ["item-2"] });
      await server.service.uploadAsset(
        "owner-a",
        fixtureAssetUpload(plan.planId),
      );
      const write = (
        operationId: string,
        expectedVersion: number | null,
        plan: Plan,
      ) =>
        server.service.write("owner-a", { operationId, expectedVersion, plan });
      await write("create", null, plan);
      await expect(write("omit", 1, tenItemPlan())).rejects.toMatchObject({
        code: "REQUEST_INVALID",
        details: { itemIds: ["item-1"], field: "dependsOnItemIds" },
      });
      await expect(write("stale", 2, tenItemPlan())).rejects.toMatchObject({
        code: "PLAN_CONFLICT",
      });
      for (const [id, invalid] of Object.entries({
        self: withEdges({ "item-1": ["item-1"] }),
        missing: withEdges({ "item-1": ["missing"] }),
        duplicate: withEdges({ "item-1": ["item-2", "item-2"] }),
        cycle: withEdges({ "item-1": ["item-2"], "item-2": ["item-1"] }),
        removal: {
          ...plan,
          items: plan.items
            .filter((item) => item.id !== "item-2")
            .map((item) => ({ ...item, relatedItemIds: [] })),
        },
      }))
        await expect(write(id, 1, invalid)).rejects.toThrow();
      expect(await server.store.get("owner-a", plan.planId)).toMatchObject({
        version: 1,
        plan,
      });
      await expect(write("create", null, plan)).resolves.toMatchObject({
        version: 1,
        replayed: true,
      });
      const cleared = withEdges({ "item-1": [] });
      await expect(write("omit", 1, cleared)).resolves.toMatchObject({
        version: 2,
      });
      await expect(write("create", null, plan)).resolves.toMatchObject({
        version: 1,
        replayed: true,
      });
      await expect(write("old", 1, plan)).rejects.toMatchObject({
        code: "PLAN_CONFLICT",
      });
      const removed = {
        ...cleared,
        items: cleared.items
          .filter((item) => item.id !== "item-2")
          .map((item) => ({ ...item, relatedItemIds: [] })),
      };
      await expect(write("remove", 2, removed)).resolves.toMatchObject({
        version: 3,
      });
      await expect(
        write("remove-dependent", 3, {
          ...removed,
          items: removed.items.filter((item) => item.id !== "item-1"),
        }),
      ).resolves.toMatchObject({ version: 4 });
    } finally {
      await server.close();
    }
  });
});
