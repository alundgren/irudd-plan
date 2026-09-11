import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { IruddMcpClient } from "../src/client/mcp-client.js";
import { preflight, toolValue } from "../src/client/preflight.js";
import { fixtureAssetUpload, tenItemPlan } from "./fixture.js";
import { startTestServer } from "./test-service.js";

const servers: Awaited<ReturnType<typeof startTestServer>>[] = [];
const clients: IruddMcpClient[] = [];
afterEach(async () => {
  await Promise.all(
    clients.splice(0).map((client) => client.close().catch(() => undefined)),
  );
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
async function setup() {
  const running = await startTestServer();
  servers.push(running);
  const plan = tenItemPlan();
  await running.service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await running.service.write("owner-a", {
    operationId: "create",
    expectedVersion: null,
    plan,
  });
  return { running, plan };
}
function clientFor(url: string, token = "token-a") {
  const client = new IruddMcpClient(new URL(`${url}/mcp`), token);
  clients.push(client);
  return client;
}
const selection = {
  ownerId: "owner-a",
  planId: "plan-alpha",
  itemId: "item-1",
};

describe("strict client handoff", () => {
  it("checks compatibility and assets, reads deliberate context, reconciles selected changes and reconnects", async () => {
    const { running, plan } = await setup();
    const client = clientFor(running.url);
    const read = vi.spyOn(client, "callTool");
    const recorded = await preflight(client, selection);
    expect(recorded).toMatchObject({
      protocolVersion: "2026-07-28",
      contractVersion: "v1",
      skillVersion: "v1",
      features: { itemDependencies: true },
      verifiedAssets: 1,
      internalRevision: 1,
    });
    expect(
      read.mock.calls.filter(([name]) => name === "get_work_item"),
    ).toHaveLength(1);
    expect(read.mock.calls.some(([name]) => name === "get_plan")).toBe(false);
    const context = await toolValue(client, "get_related_context", {
      contractVersion: "v1",
      planId: plan.planId,
      contextId: "context-optional",
    });
    expect(context).toMatchObject({ contextId: "context-optional" });
    const check = () =>
      toolValue(client, "check_packet", {
        contractVersion: "v1",
        planId: plan.planId,
        itemId: "item-1",
        packetVersion: recorded.packetVersion,
      });
    const full = await toolValue(client, "get_plan", {
      contractVersion: "v1",
      planId: plan.planId,
    });
    expect(full).toMatchObject({ plan, internalRevision: 1 });
    const unrelated = {
      ...plan,
      items: plan.items.map((item, index) =>
        index === 1
          ? { ...item, requirements: ["An unrelated sibling edit"] }
          : item,
      ),
    };
    await toolValue(client, "write_plan", {
      operationId: "sibling",
      expectedVersion: 1,
      plan: unrelated,
    });
    expect(await check()).toMatchObject({ status: "unchanged" });
    const selected = {
      ...unrelated,
      items: unrelated.items.map((item, index) =>
        index === 0
          ? {
              ...item,
              requirements: [
                "The selected requirement changed during implementation",
              ],
            }
          : item,
      ),
    };
    await toolValue(client, "write_plan", {
      operationId: "selected",
      expectedVersion: 2,
      plan: selected,
    });
    expect(await check()).toMatchObject({ status: "changed" });
    await expect(
      client.callTool("write_plan", {
        operationId: "stale",
        expectedVersion: 1,
        plan,
      }),
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PLAN_CONFLICT" } },
    });
    await client.close();
    const renewed = await preflight(clientFor(running.url), selection);
    expect(renewed.packetVersion).not.toBe(recorded.packetVersion);
    expect(renewed.internalRevision).toBe(3);
  });

  it("stops on rejected, expired, wrong-owner, incompatible and unavailable requests", async () => {
    const { running } = await setup();
    for (const token of ["forged", "expired", "token-b"]) {
      await expect(
        preflight(clientFor(running.url, token), selection),
      ).rejects.toThrow();
    }
    const otherOwner = clientFor(running.url, "token-b");
    await otherOwner.connect();
    await expect(
      otherOwner.callTool("get_plan", {
        contractVersion: "v1",
        planId: selection.planId,
      }),
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PLAN_NOT_FOUND" } },
    });
    const client = clientFor(running.url);
    await client.connect();
    await expect(
      toolValue(client, "get_contract", { contractVersion: "v999" }),
    ).rejects.toThrow(/get_contract failed/);
    await expect(
      client.callTool("get_plan", { contractVersion: "v1", planId: "absent" }),
    ).resolves.toMatchObject({ isError: true });
    running.expire("token-a");
    await expect(
      toolValue(client, "get_work_item", {
        contractVersion: "v1",
        ...selection,
      }),
    ).rejects.toThrow();
    await running.close();
    servers.splice(servers.indexOf(running), 1);
    await expect(
      preflight(clientFor(running.url), selection),
    ).rejects.toThrow();
  });

  it("stops preflight when the server does not advertise decision states", async () => {
    const { running } = await setup();
    const client = clientFor(running.url);
    const call = client.callTool.bind(client);
    vi.spyOn(client, "callTool").mockImplementation(async (name, args) =>
      name === "get_contract"
        ? {
            content: [],
            structuredContent: {
              contractVersion: "v1",
              skillVersion: "v1",
              protocolVersion: "2026-07-28",
              ownerId: "owner-a",
            },
          }
        : call(name, args),
    );
    await expect(preflight(client, selection)).rejects.toThrow();
  });

  it("stops on missing required bytes, corrupt bytes and incompatible skill versions", async () => {
    const { running } = await setup();
    const asset = vi
      .spyOn(running.service, "getAsset")
      .mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(preflight(clientFor(running.url), selection)).rejects.toThrow(
      /get_asset failed/,
    );
    asset.mockRestore();
    const original = running.service.getAsset.bind(running.service);
    const corrupt = vi
      .spyOn(running.service, "getAsset")
      .mockImplementation(async (...args) => ({
        ...(await original(...args)),
        bytesBase64: Buffer.from("corrupt").toString("base64"),
      }));
    await expect(preflight(clientFor(running.url), selection)).rejects.toThrow(
      /asset bytes differ/,
    );
    corrupt.mockRestore();
    const client = clientFor(running.url);
    const call = client.callTool.bind(client);
    vi.spyOn(client, "callTool").mockImplementation(async (name, args) =>
      name === "get_contract"
        ? {
            content: [],
            structuredContent: {
              contractVersion: "v1",
              skillVersion: "v2",
              protocolVersion: "2026-07-28",
              ownerId: "owner-a",
            },
          }
        : call(name, args),
    );
    await expect(preflight(client, selection)).rejects.toThrow();
  });
});
