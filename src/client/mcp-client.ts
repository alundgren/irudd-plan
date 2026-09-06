import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
  type DiscoverResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/client";

import { MCP_PROTOCOL_VERSION } from "../contract/plan.js";

export class IruddMcpClient {
  private readonly client = new Client(
    { name: "irudd-plan-client", version: "0.1.0" },
    {
      capabilities: {},
      versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } },
    },
  );
  private readonly transport: StreamableHTTPClientTransport;

  constructor(
    endpoint: URL,
    credentials: string | Readonly<Record<string, string>>,
  ) {
    this.transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: {
        redirect: "error",
        headers:
          typeof credentials === "string"
            ? { authorization: `Bearer ${credentials}` }
            : credentials,
      },
    });
  }

  async connect(): Promise<DiscoverResult> {
    await this.client.connect(this.transport);
    const discovery = this.client.getDiscoverResult();
    if (discovery === undefined)
      throw new Error("Modern MCP discovery did not complete");
    return discovery;
  }

  close(): Promise<void> {
    return this.client.close();
  }

  listTools() {
    return this.client.listTools();
  }

  callTool<T = CallToolResult>(name: string, args: unknown): Promise<T> {
    return this.client.callTool({
      name,
      arguments: args as Record<string, unknown>,
    }) as Promise<T>;
  }

  readResource<T = ReadResourceResult>(uri: string): Promise<T> {
    return this.client.readResource({ uri }) as Promise<T>;
  }
}
