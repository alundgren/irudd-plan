import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  ResourceTemplate,
  type AuthInfo,
  type CallToolResult,
  type JsonSchemaType,
  type ReadResourceResult,
} from "@modelcontextprotocol/server";

import type { Authenticator } from "../auth/authentication.js";
import { PlanError } from "../contract/errors.js";
import {
  CheckPacketRequest,
  CONTRACT_VERSION,
  decode,
  GetItemRequest,
  GetRelatedContextRequest,
  ListPlansRequest,
  MCP_PROTOCOL_VERSION,
  WritePlanRequest,
} from "../contract/plan.js";
import type { PlanService } from "../domain/plan-service.js";
import { renderOperatorPage } from "../web/operator-page.js";
import { resourceTemplates, tools } from "./catalog.js";

interface ServerOptions {
  readonly bodyLimitBytes?: number;
  readonly isReady?: () => boolean;
}

export function createMcpHttpServer(
  service: PlanService,
  authenticator: Authenticator,
  options: ServerOptions = {},
): Server {
  const bodyLimitBytes = options.bodyLimitBytes ?? 2_000_000;
  const handler = createMcpHandler(
    (context) => createOwnerServer(service, requireOwner(context.authInfo)),
    { legacy: "reject" },
  );
  const nodeHandler = toNodeHandler(handler);
  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/" && request.method === "GET") {
        sendHtml(response, renderOperatorPage());
        return;
      }
      if (request.url === "/healthz") {
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (request.url === "/readyz") {
        const ready = options.isReady?.() ?? true;
        sendJson(response, ready ? 200 : 503, { status: ready ? "ready" : "starting" });
        return;
      }
      if (request.url !== "/mcp" || request.method !== "POST") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      const ownerId = await authenticator.authenticate(request.headers);
      const body = await readBody(request, bodyLimitBytes);
      const parsedBody = parseJson(body);
      const authenticatedRequest = request as IncomingMessage & { auth?: AuthInfo };
      authenticatedRequest.auth = { token: "verified", clientId: ownerId, scopes: [] };
      await nodeHandler(
        authenticatedRequest as Parameters<typeof nodeHandler>[0],
        response,
        parsedBody,
      );
    } catch (error) {
      sendHttpError(response, error);
    }
  });
  server.on("close", () => void handler.close());
  return server;
}

function createOwnerServer(service: PlanService, ownerId: string): McpServer {
  const server = new McpServer(
    { name: "irudd-plan", version: "0.1.0" },
    {
      capabilities: { resources: {}, tools: {} },
      instructions:
        "Retrieve one selected work item by default. Use related context IDs only when the task needs them.",
      supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
      cacheHints: {
        "server/discover": { ttlMs: 0, cacheScope: "private" },
        "tools/list": { ttlMs: 0, cacheScope: "private" },
        "resources/list": { ttlMs: 0, cacheScope: "private" },
        "resources/templates/list": { ttlMs: 0, cacheScope: "private" },
        "resources/read": { ttlMs: 0, cacheScope: "private" },
      },
    },
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputSchema as unknown as JsonSchemaType),
      },
      async (args) => callTool(service, ownerId, tool.name, args),
    );
  }

  for (const template of resourceTemplates) {
    server.registerResource(
      template.name,
      new ResourceTemplate(template.uriTemplate, {
        list:
          template.uriTemplate === "irudd-plan://plans/{planId}"
            ? async () => ({
                resources: (await service.list(ownerId)).map((plan) => ({
                  uri: `irudd-plan://plans/${encodeURIComponent(plan.planId)}`,
                  name: plan.planId,
                  description: plan.epicGoal,
                  mimeType: "application/json",
                })),
              })
            : undefined,
      }),
      {
        description: template.description,
        mimeType: template.mimeType,
        cacheHint: { ttlMs: 0, cacheScope: "private" },
      },
      async (uri) => readResource(service, ownerId, uri.href),
    );
  }

  return server;
}

async function callTool(
  service: PlanService,
  ownerId: string,
  name: string,
  args: unknown,
): Promise<CallToolResult> {
  try {
    assertContractVersion(args);
    let value: unknown;
    switch (name) {
      case "write_plan":
        value = await service.write(ownerId, decode(WritePlanRequest, args));
        break;
      case "get_work_item":
        value = await service.getItem(ownerId, decode(GetItemRequest, args));
        break;
      case "get_related_context":
        value = await service.getContext(ownerId, decode(GetRelatedContextRequest, args));
        break;
      case "check_packet":
        value = await service.checkPacket(ownerId, decode(CheckPacketRequest, args));
        break;
      case "list_plans":
        decode(ListPlansRequest, args);
        value = await service.list(ownerId);
        break;
      default:
        throw new PlanError("REQUEST_INVALID", `Unknown tool: ${name}`);
    }
    return toolResult(value);
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      isError: true,
      content: [{ type: "text", text: `${normalized.code}: ${normalized.message}` }],
      structuredContent: { error: normalized },
    };
  }
}

async function readResource(
  service: PlanService,
  ownerId: string,
  uri: string,
): Promise<ReadResourceResult> {
  const itemMatch = uri.match(/^irudd-plan:\/\/plans\/([^/]+)\/items\/([^/]+)$/);
  const contextMatch = uri.match(/^irudd-plan:\/\/plans\/([^/]+)\/contexts\/([^/]+)$/);
  const planMatch = uri.match(/^irudd-plan:\/\/plans\/([^/]+)$/);
  let value: unknown;
  if (itemMatch?.[1] !== undefined && itemMatch[2] !== undefined) {
    value = await service.getItem(ownerId, {
      contractVersion: CONTRACT_VERSION,
      planId: decodeURIComponent(itemMatch[1]),
      itemId: decodeURIComponent(itemMatch[2]),
    });
  } else if (contextMatch?.[1] !== undefined && contextMatch[2] !== undefined) {
    value = await service.getContext(ownerId, {
      contractVersion: CONTRACT_VERSION,
      planId: decodeURIComponent(contextMatch[1]),
      contextId: decodeURIComponent(contextMatch[2]),
    });
  } else if (planMatch?.[1] !== undefined) {
    value = await service.getOverview(ownerId, decodeURIComponent(planMatch[1]));
  } else {
    throw new PlanError("REQUEST_INVALID", "Unsupported resource URI");
  }
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] };
}

function toolResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  } as CallToolResult;
}

function requireOwner(authInfo: AuthInfo | undefined): string {
  if (authInfo === undefined) throw new PlanError("AUTH_INVALID", "Authentication is required");
  return authInfo.clientId;
}

function assertContractVersion(args: unknown): void {
  const directVersion =
    typeof args === "object" && args !== null && "contractVersion" in args
      ? (args as { contractVersion?: unknown }).contractVersion
      : undefined;
  const nestedVersion =
    typeof args === "object" &&
    args !== null &&
    "plan" in args &&
    typeof (args as { plan?: unknown }).plan === "object" &&
    (args as { plan?: unknown }).plan !== null &&
    "contractVersion" in (args as { plan: object }).plan
      ? (args as { plan: { contractVersion?: unknown } }).plan.contractVersion
      : undefined;
  if (
    (directVersion !== undefined && directVersion !== CONTRACT_VERSION) ||
    (nestedVersion !== undefined && nestedVersion !== CONTRACT_VERSION)
  ) {
    throw new PlanError("CONTRACT_UNSUPPORTED", "Unsupported plan contract version", {
      supported: [CONTRACT_VERSION],
    });
  }
}

async function readBody(request: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > limit) throw new PlanError("REQUEST_INVALID", "Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new PlanError("REQUEST_INVALID", "Invalid JSON");
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(content),
    "cache-control": "no-store",
  });
  response.end(content);
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendHttpError(response: ServerResponse, error: unknown): void {
  const normalized = normalizeError(error);
  const status = normalized.code.startsWith("AUTH_") ? 401 : 400;
  sendJson(response, status, {
    jsonrpc: "2.0",
    id: null,
    error: {
      code: status === 401 ? -32001 : -32600,
      message: normalized.message,
      data: { code: normalized.code, details: normalized.details },
    },
  });
}

function normalizeError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof PlanError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (error instanceof Error && error.name === "SchemaError") {
    return { code: "REQUEST_INVALID", message: error.message };
  }
  if (error instanceof Error) return { code: "INTERNAL", message: error.message };
  return { code: "INTERNAL", message: "Unknown failure" };
}
