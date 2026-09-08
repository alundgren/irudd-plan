import { createHash } from "node:crypto";
import { Schema } from "effect";

import {
  AssetDescriptor,
  CONTRACT_VERSION,
  Decision,
  SharedContext,
  SKILL_VERSION,
  MCP_PROTOCOL_VERSION,
  WorkItem,
  decode,
} from "../contract/plan.js";
import type { IruddMcpClient } from "./mcp-client.js";

const Packet = Schema.Struct({
  contractVersion: Schema.Literal(CONTRACT_VERSION),
  planId: Schema.String,
  itemId: Schema.String,
  packetVersion: Schema.String,
  internalRevision: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
  ),
  item: WorkItem,
  contexts: Schema.Array(SharedContext),
  decisions: Schema.Array(Decision),
  assets: Schema.Array(AssetDescriptor),
});

export async function toolValue(
  client: IruddMcpClient,
  name: string,
  args: unknown,
): Promise<unknown> {
  const result = await client.callTool(name, args);
  if (result.isError || result.structuredContent === undefined) {
    throw new Error(
      `${name} failed; stop and repair the MCP request or service`,
    );
  }
  return result.structuredContent;
}

export async function preflight(
  client: IruddMcpClient,
  selection: { planId: string; itemId: string; ownerId: string },
  onStep: (operation: string) => void = () => undefined,
) {
  onStep("server/discover");
  const contract = await checkCompatibility(client, selection.ownerId, onStep);
  onStep("get_work_item");
  const packet = decode(
    Packet,
    await toolValue(client, "get_work_item", {
      contractVersion: CONTRACT_VERSION,
      planId: selection.planId,
      itemId: selection.itemId,
    }),
  );
  if (
    packet.planId !== selection.planId ||
    packet.itemId !== selection.itemId ||
    packet.item.id !== selection.itemId
  ) {
    throw new Error(
      "Selected packet identity differs; stop and repair the reference",
    );
  }
  onStep("get_asset");
  await verifyAssets(client, selection.planId, packet.assets);
  // The resource read verifies the capability Codex uses for explicit MCP references.
  onStep("resources/read");
  await client.readResource(
    `irudd-plan://plans/${encodeURIComponent(selection.planId)}/items/${encodeURIComponent(selection.itemId)}`,
  );
  return {
    ...contract,
    planId: packet.planId,
    itemId: packet.itemId,
    packetVersion: packet.packetVersion,
    internalRevision: packet.internalRevision,
    verifiedAssets: packet.assets.length,
  };
}

async function checkCompatibility(
  client: IruddMcpClient,
  ownerId: string,
  onStep: (operation: string) => void,
) {
  const discovery = await client.connect();
  if (!discovery.supportedVersions.includes(MCP_PROTOCOL_VERSION)) {
    throw new Error("MCP 2026-07-28 is required; update the client or server");
  }
  if (
    discovery.capabilities?.tools === undefined ||
    discovery.capabilities.resources === undefined
  ) {
    throw new Error("MCP tools and resources capabilities are required");
  }
  onStep("get_contract");
  const contract = decode(
    Schema.Struct({
      contractVersion: Schema.Literal(CONTRACT_VERSION),
      skillVersion: Schema.Literal(SKILL_VERSION),
      protocolVersion: Schema.Literal(MCP_PROTOCOL_VERSION),
      ownerId: Schema.Literal(ownerId),
      features: Schema.optionalKey(
        Schema.Struct({ itemDependencies: Schema.optionalKey(Schema.Boolean) }),
      ),
    }),
    await toolValue(client, "get_contract", {
      contractVersion: CONTRACT_VERSION,
    }),
  );
  onStep("tools/list");
  const catalog = await client.listTools();
  for (const name of [
    "get_contract",
    "get_plan",
    "write_plan",
    "get_work_item",
    "get_related_context",
    "check_packet",
    "get_asset",
    "upload_asset",
    "get_github_reference",
    "associate_github_work",
    "verify_github_repository",
    "publish_plan",
  ]) {
    if (!catalog.tools.some((tool) => tool.name === name))
      throw new Error(
        `Required MCP tool ${name} is missing; update the service`,
      );
  }
  return contract;
}

async function verifyAssets(
  client: IruddMcpClient,
  planId: string,
  assets: ReadonlyArray<AssetDescriptor>,
) {
  for (const asset of assets) {
    if (!asset.available)
      throw new Error("Required asset is unavailable; restore it before work");
    const content = decode(
      Schema.Struct({
        descriptor: AssetDescriptor,
        content: Schema.Literal("rendered"),
        mediaType: Schema.String,
        bytesBase64: Schema.String,
      }),
      await toolValue(client, "get_asset", {
        contractVersion: CONTRACT_VERSION,
        planId: planId,
        assetId: asset.id,
        digest: asset.digest,
      }),
    );
    const digest = `sha256:${createHash("sha256").update(Buffer.from(content.bytesBase64, "base64")).digest("hex")}`;
    if (
      digest !== asset.digest ||
      content.descriptor.digest !== asset.digest ||
      content.descriptor.id !== asset.id ||
      content.mediaType !== asset.mediaType
    ) {
      throw new Error(
        "Required asset bytes differ from the packet; stop and repair storage",
      );
    }
  }
}
