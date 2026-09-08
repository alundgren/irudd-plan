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

  async callTool<T = CallToolResult>(name: string, args: unknown): Promise<T> {
    if (name === "write_plan" && hasDependencyData(args)) {
      const contract = await this.client.callTool({
        name: "get_contract",
        arguments: { contractVersion: "v1" },
      });
      requireItemDependencies(
        contract.isError ? undefined : contract.structuredContent,
      );
    }
    return this.client.callTool({
      name,
      arguments: args as Record<string, unknown>,
    }) as Promise<T>;
  }

  readResource<T = ReadResourceResult>(uri: string): Promise<T> {
    return this.client.readResource({ uri }) as Promise<T>;
  }
}

function requireItemDependencies(contract: unknown): void {
  const features = (
    contract as { features?: { itemDependencies?: unknown } } | undefined
  )?.features;
  if (features?.itemDependencies !== true)
    throw new Error(
      "Server does not advertise itemDependencies; update the server before writing dependsOnItemIds",
    );
}

function hasDependencyData(args: unknown): boolean {
  const items = (args as { plan?: { items?: unknown } } | undefined)?.plan
    ?.items;
  return (
    Array.isArray(items) &&
    items.some(
      (item) =>
        item !== null && typeof item === "object" && "dependsOnItemIds" in item,
    )
  );
}
