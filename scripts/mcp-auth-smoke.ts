import assert from "node:assert/strict";
import { IruddMcpClient } from "../src/client/mcp-client.js";
import { preflight } from "../src/client/preflight.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
const endpoint = new URL(required("IRUDD_MCP_URL"));
const clientId = required("CF_ACCESS_CLIENT_ID");
const clientSecret = required("CF_ACCESS_CLIENT_SECRET");
const expiredId = required("CF_ACCESS_EXPIRED_CLIENT_ID");
const expiredSecret = required("CF_ACCESS_EXPIRED_CLIENT_SECRET");
const origin = new URL(required("IRUDD_ORIGIN_URL"));
const client = new IruddMcpClient(endpoint, {
  "CF-Access-Client-Id": clientId,
  "CF-Access-Client-Secret": clientSecret,
});
try {
  await preflight(client, {
    ownerId: required("IRUDD_OWNER_ID"),
    planId: required("IRUDD_PLAN_ID"),
    itemId: required("IRUDD_ITEM_ID"),
  });
  const discovery = {
    jsonrpc: "2.0",
    id: 1,
    method: "server/discover",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
          name: "irudd-auth-smoke",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "server/discover",
  };
  for (const credentials of [
    {
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": "intentionally-invalid",
    },
    {
      "CF-Access-Client-Id": expiredId,
      "CF-Access-Client-Secret": expiredSecret,
    },
  ]) {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: { ...headers, ...credentials },
      body: JSON.stringify(discovery),
      signal: AbortSignal.timeout(15_000),
    });
    assert.ok(
      [401, 403].includes(response.status),
      `Expected credential rejection, got HTTP ${response.status}`,
    );
    await response.body?.cancel();
  }
  const unauthenticated = await fetch(new URL("/mcp", origin), {
    method: "POST",
    headers,
    body: JSON.stringify(discovery),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(
    unauthenticated.status,
    401,
    "Direct origin must reject missing identity",
  );
  await unauthenticated.body?.cancel();
  console.log(
    "Deployed MCP passed: protocol, owner, versions, packet/assets, rejected and expired credentials, unauthenticated origin.",
  );
} catch {
  console.error(
    "Deployment MCP smoke failed. Stop adoption and inspect endpoint availability, Service Auth denial status, token expiry, mappings and origin access. No credentials or response bodies are logged.",
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
