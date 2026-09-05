import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

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
import { resourceTemplates, tools } from "./catalog.js";
import { renderOperatorPage } from "../web/operator-page.js";

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

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
  return createServer(async (request, response) => {
    let requestId: string | number | null = null;
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
      const rpc = parseRpc(body);
      requestId = rpc.id ?? null;
      const result = await dispatch(service, ownerId, rpc, request);
      if (rpc.id === undefined) {
        response.writeHead(202).end();
        return;
      }
      sendJson(response, 200, { jsonrpc: "2.0", id: rpc.id, result });
    } catch (error) {
      sendRpcError(response, error, requestId);
    }
  });
}

async function dispatch(
  service: PlanService,
  ownerId: string,
  request: JsonRpcRequest,
  httpRequest: IncomingMessage,
): Promise<unknown> {
  if (request.method === "initialize") {
    const requested = request.params?.protocolVersion;
    if (requested !== MCP_PROTOCOL_VERSION) {
      throw new ProtocolError(-32602, "Unsupported MCP protocol version", {
        code: "MCP_PROTOCOL_UNSUPPORTED",
        requested,
        supported: [MCP_PROTOCOL_VERSION],
      });
    }
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { resources: {}, tools: {} },
      serverInfo: { name: "irudd-plan", version: "0.1.0" },
      instructions:
        "Retrieve one selected work item by default. Use related context IDs only when the task needs them.",
    };
  }

  const headerVersion = firstHeader(httpRequest.headers["mcp-protocol-version"]);
  if (headerVersion !== MCP_PROTOCOL_VERSION) {
    throw new ProtocolError(-32602, "Missing or unsupported MCP-Protocol-Version header", {
      code: "MCP_PROTOCOL_UNSUPPORTED",
      requested: headerVersion,
      supported: [MCP_PROTOCOL_VERSION],
    });
  }

  switch (request.method) {
    case "notifications/initialized":
      return {};
    case "ping":
      return {};
    case "tools/list":
      return { tools };
    case "resources/list":
      return {
        resources: (await service.list(ownerId)).map((plan) => ({
          uri: `irudd-plan://plans/${encodeURIComponent(plan.planId)}`,
          name: plan.planId,
          description: plan.epicGoal,
          mimeType: "application/json",
        })),
      };
    case "resources/templates/list":
      return { resourceTemplates };
    case "resources/read":
      return readResource(service, ownerId, request.params);
    case "tools/call":
      return callTool(service, ownerId, request.params);
    default:
      throw new ProtocolError(-32601, `Method not found: ${request.method}`);
  }
}

async function callTool(
  service: PlanService,
  ownerId: string,
  params: Record<string, unknown> | undefined,
): Promise<unknown> {
  const name = params?.name;
  const args = params?.arguments;
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
        throw new ProtocolError(-32602, `Unknown tool: ${String(name)}`);
    }
    return toolResult(value);
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
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
  params: Record<string, unknown> | undefined,
): Promise<unknown> {
  const uri = params?.uri;
  if (typeof uri !== "string") throw new ProtocolError(-32602, "Resource URI is required");
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
    throw new ProtocolError(-32602, "Unsupported resource URI");
  }
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] };
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
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

function parseRpc(body: string): JsonRpcRequest {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new ProtocolError(-32700, "Invalid JSON");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    (value as Partial<JsonRpcRequest>).jsonrpc !== "2.0" ||
    typeof (value as Partial<JsonRpcRequest>).method !== "string"
  ) {
    throw new ProtocolError(-32600, "Invalid JSON-RPC request");
  }
  return value as JsonRpcRequest;
}

async function readBody(request: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > limit) throw new ProtocolError(-32600, "Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

function sendRpcError(
  response: ServerResponse,
  error: unknown,
  requestId: string | number | null,
): void {
  const protocol = error instanceof ProtocolError ? error : undefined;
  const normalized = normalizeError(error);
  const status = normalized.code.startsWith("AUTH_") ? 401 : protocol === undefined ? 500 : 400;
  sendJson(response, status, {
    jsonrpc: "2.0",
    id: requestId,
    error: {
      code: protocol?.rpcCode ?? -32603,
      message: normalized.message,
      data: protocol?.data ?? { code: normalized.code, details: normalized.details },
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

class ProtocolError extends Error {
  constructor(
    readonly rpcCode: number,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
