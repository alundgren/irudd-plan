import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { IruddMcpClient } from "../../src/client/mcp-client.js";
import type { PlanningPage } from "../../src/domain/conversation-sync.js";
import type { PlanningEntry } from "../../src/contract/planning.js";
import type { AssetDescriptor } from "../../src/contract/plan.js";

export async function guidedFixture(page: Page, baseURL: string) {
  const planId = `guided-${randomUUID()}`;
  const client = new IruddMcpClient(new URL(`${baseURL}/mcp`), "token-a");
  await client.connect();
  const read = async () =>
    (
      await client.callTool<{ structuredContent: PlanningPage }>(
        "get_planning",
        { contractVersion: "v1", planId, limit: 100 },
      )
    ).structuredContent;
  const append = async (entries: PlanningEntry[]) => {
    const { cursor } = await read();
    return client.callTool("append_planning", {
      contractVersion: "v1",
      planId,
      operationId: randomUUID(),
      expectedRevision: cursor.revision,
      expectedDigest: cursor.digest,
      entries,
    });
  };
  await client.callTool("write_plan", {
    operationId: randomUUID(),
    expectedVersion: null,
    plan: {
      contractVersion: "v1",
      planId,
      repository: { provider: "github", owner: "example", name: "project" },
      epicGoal: "Work item readiness",
      items: [],
      contexts: [],
      decisions: [
        {
          id: "readiness",
          title: "Human decisions",
          body: "Human decisions must be settled before implementation begins. Unaffected ready items can proceed independently.",
          reason: "Keep implementation decisions explicit.",
          requiredContextIds: [],
          assetIds: [],
        },
      ],
      assets: [],
    },
  });
  const assets: AssetDescriptor[] = [];
  for (const [id, status] of [
    ["whole-item", "waiting"],
    ["independent-work", "ready"],
  ]) {
    const uploaded = await client.callTool<{
      structuredContent: AssetDescriptor;
    }>("upload_asset", {
      contractVersion: "v1",
      planId,
      assetId: id,
      caption: `${id}.json`,
      role: "illustration",
      mediaType: "text/html",
      bytesBase64: Buffer.from(
        `<html><head><style>body{margin:0;padding:16px;background:#f9f6f0;color:#604939}pre{font:16px/1.8 monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><pre>${JSON.stringify({ item: "Import customer records", status, pendingDecision: "Invalid row handling", requirements: ["Validate uploaded rows", "Report each invalid row", "Preserve the original file"] }, null, 2)}</pre></body></html>`,
      ).toString("base64"),
    });
    assets.push(uploaded.structuredContent);
  }
  await append([
    {
      id: "readiness",
      section: "Work item readiness",
      kind: "question",
      body: "Should an open human decision stop the whole work item?",
      choices: ["Wait for the whole item", "Allow independent work"],
      assets,
    },
    {
      id: "owner",
      section: "Decision ownership",
      kind: "question",
      body: "Who records the decision?",
      choices: [
        "The planner records the accepted answer",
        "The reviewer updates the plan",
      ],
    },
    {
      id: "completion",
      section: "Completion",
      kind: "question",
      body: "When is the item complete?",
    },
    {
      id: "history",
      section: "History",
      kind: "question",
      body: "Keep the original uploaded file?",
    },
    {
      id: "resolved",
      section: "History",
      kind: "resolved",
      body: "Keep the original file for later review.",
      replyTo: "history",
    },
  ]);
  await page.goto(`/plans/${planId}`);
  return {
    planId,
    client,
    append,
    read,
    assets,
    view: page.locator(".guided-planning"),
  };
}
