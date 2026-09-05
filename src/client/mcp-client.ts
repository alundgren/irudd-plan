import { MCP_PROTOCOL_VERSION } from "../contract/plan.js";

interface JsonRpcResponse {
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export class IruddMcpClient {
  private id = 0;
  private initialized = false;

  constructor(
    private readonly endpoint: URL,
    private readonly accessToken: string,
  ) {}

  async initialize(): Promise<unknown> {
    const result = await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "irudd-plan-client", version: "0.1.0" },
    });
    this.initialized = true;
    await this.notify("notifications/initialized", {});
    return result;
  }

  listTools(): Promise<unknown> {
    return this.request("tools/list", {});
  }

  async callTool<T = unknown>(name: string, args: unknown): Promise<T> {
    return (await this.request("tools/call", { name, arguments: args })) as T;
  }

  async readResource<T = unknown>(uri: string): Promise<T> {
    return (await this.request("resources/read", { uri })) as T;
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const response = await this.send({ jsonrpc: "2.0", id: ++this.id, method, params });
    const body = (await response.json()) as JsonRpcResponse;
    if (body.error !== undefined) {
      throw Object.assign(new Error(body.error.message), { response, rpcError: body.error });
    }
    return body.result;
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const response = await this.send({ jsonrpc: "2.0", method, params });
    if (response.status !== 202)
      throw new Error(`MCP notification failed with HTTP ${response.status}`);
  }

  private send(body: unknown): Promise<Response> {
    return fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
        ...(this.initialized ? { "mcp-protocol-version": MCP_PROTOCOL_VERSION } : {}),
      },
      body: JSON.stringify(body),
    });
  }
}
