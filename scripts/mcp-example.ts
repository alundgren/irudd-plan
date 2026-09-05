import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { IruddMcpClient } from "../src/client/mcp-client.js";

const planFile = process.argv[2];
const endpoint = process.env.IRUDD_MCP_URL;
const accessToken = process.env.CF_ACCESS_TOKEN;
if (planFile === undefined || endpoint === undefined || accessToken === undefined) {
  throw new Error(
    "Usage: IRUDD_MCP_URL=https://host/mcp CF_ACCESS_TOKEN=<assertion> pnpm example:mcp",
  );
}

const plan = JSON.parse(await readFile(planFile, "utf8")) as {
  planId: string;
  items: Array<{ id: string }>;
};
const firstItem = plan.items[0];
if (firstItem === undefined) throw new Error("The example plan needs at least one work item");

const client = new IruddMcpClient(new URL(endpoint), accessToken);
try {
  const discovery = await client.connect();
  const written = await client.callTool("write_plan", {
    operationId: `example-${randomUUID()}`,
    expectedVersion: null,
    plan,
  });
  const packet = await client.callTool("get_work_item", {
    contractVersion: "v1",
    planId: plan.planId,
    itemId: firstItem.id,
  });
  console.log(JSON.stringify({ discovery, written, packet }, null, 2));
} finally {
  await client.close();
}
