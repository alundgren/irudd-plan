import { IruddMcpClient } from "../src/client/mcp-client.js";
import { preflight } from "../src/client/preflight.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const client = new IruddMcpClient(new URL(required("IRUDD_MCP_URL")), {
  "CF-Access-Client-Id": required("CF_ACCESS_CLIENT_ID"),
  "CF-Access-Client-Secret": required("CF_ACCESS_CLIENT_SECRET"),
});
let operation = "configuration";
try {
  console.log(
    JSON.stringify(
      await preflight(
        client,
        {
          planId: required("IRUDD_PLAN_ID"),
          itemId: required("IRUDD_ITEM_ID"),
          ownerId: required("IRUDD_OWNER_ID"),
        },
        (step) => {
          operation = step;
        },
      ),
      null,
      2,
    ),
  );
} catch {
  console.error(
    `Preflight failed during ${operation}. Stop work. Check the endpoint, Cloudflare Service Auth credentials, owner mapping, client/skill/contract versions, selected IDs and required asset storage. No fallback is supported.`,
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
