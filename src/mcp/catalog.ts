import { planningTools } from "./planning-catalog.js";
import { CONTRACT_VERSION } from "../contract/plan.js";

export const tools = [
  ...planningTools,
  {
    name: "get_contract",
    description:
      "Check the supported plan contract, public skill version, additive features, protocol and authenticated owner before working on a plan.",
    inputSchema: {
      type: "object",
      required: ["contractVersion"],
      properties: { contractVersion: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_plan",
    description:
      "Deliberately retrieve the complete current plan and internalRevision for planning or revision. For implementation use get_work_item instead.",
    inputSchema: planSchema(),
  },
  {
    name: "write_plan",
    description:
      "Atomically create or replace one private plan revision. expectedVersion is null only for creation. Reuse operationId to recover an uncertain response.",
    inputSchema: {
      type: "object",
      required: ["operationId", "expectedVersion", "plan"],
      properties: {
        operationId: { type: "string" },
        expectedVersion: { type: ["integer", "null"], minimum: 1 },
        plan: {
          type: "object",
          description: `Complete ${CONTRACT_VERSION} plan document`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "verify_github_repository",
    description:
      "Verify the plan repository through the operator-approved GitHub App installation and persist its canonical identity and visibility.",
    inputSchema: planSchema(),
  },
  {
    name: "associate_github_work",
    description:
      "Associate a GitHub issue or pull request with a verified plan and optional work item. Repeating the same association updates its observation without duplicating it.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "planId", "type", "number"],
      properties: {
        contractVersion: { type: "string" },
        planId: { type: "string" },
        itemId: { type: "string" },
        type: { type: "string", enum: ["issue", "pull_request"] },
        number: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "publish_plan",
    description:
      "Explicitly publish a verified public-repository plan. Private repositories cannot be published.",
    inputSchema: planSchema(),
  },
  {
    name: "get_github_reference",
    description:
      "Return a short goal, stable human URL, MCP resource URI, ready-to-paste GitHub text and persisted associations for a plan or work item.",
    inputSchema: {
      ...planSchema(),
      properties: {
        ...planSchema().properties,
        itemId: { type: "string" },
      },
    },
  },
  {
    name: "get_work_item",
    description:
      "Get one complete work-item packet with required shared records, assets, and a compact epic index. Sibling specifications are omitted.",
    inputSchema: planItemSchema(),
  },
  {
    name: "get_related_context",
    description:
      "Deliberately retrieve one shared context and everything it requires.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "planId", "contextId"],
      properties: {
        contractVersion: {
          type: "string",
          description: `Plan contract version; currently ${CONTRACT_VERSION}`,
        },
        planId: { type: "string" },
        contextId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "check_packet",
    description: "Compare a recorded packet version with current content.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "planId", "itemId", "packetVersion"],
      properties: {
        contractVersion: {
          type: "string",
          description: `Plan contract version; currently ${CONTRACT_VERSION}`,
        },
        planId: { type: "string" },
        itemId: { type: "string" },
        packetVersion: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_plans",
    description: "List private plans owned by the authenticated identity.",
    inputSchema: {
      type: "object",
      required: ["contractVersion"],
      properties: {
        contractVersion: {
          type: "string",
          description: `Plan contract version; currently ${CONTRACT_VERSION}`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "upload_asset",
    description:
      "Upload one immutable self-contained visual asset and optional editable source before referencing its returned descriptor in a plan revision.",
    inputSchema: {
      type: "object",
      required: [
        "contractVersion",
        "planId",
        "assetId",
        "mediaType",
        "caption",
        "role",
        "bytesBase64",
      ],
      properties: {
        contractVersion: { type: "string" },
        planId: { type: "string" },
        assetId: { type: "string" },
        mediaType: { type: "string" },
        caption: { type: "string" },
        role: {
          type: "string",
          enum: ["binding-reference", "illustration"],
        },
        bytesBase64: { type: "string" },
        source: {
          type: "object",
          required: ["mediaType", "bytesBase64"],
          properties: {
            mediaType: { type: "string" },
            bytesBase64: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_asset",
    description:
      "Retrieve immutable rendered bytes or editable source through authenticated MCP and verify the returned digest.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "planId", "assetId", "digest"],
      properties: {
        contractVersion: { type: "string" },
        planId: { type: "string" },
        assetId: { type: "string" },
        digest: { type: "string" },
        content: { type: "string", enum: ["rendered", "source"] },
      },
      additionalProperties: false,
    },
  },
] as const;

function planItemSchema() {
  return {
    type: "object",
    required: ["contractVersion", "planId", "itemId"],
    properties: {
      contractVersion: {
        type: "string",
        description: `Plan contract version; currently ${CONTRACT_VERSION}`,
      },
      planId: { type: "string" },
      itemId: { type: "string" },
    },
    additionalProperties: false,
  } as const;
}

function planSchema() {
  return {
    type: "object",
    required: ["contractVersion", "planId"],
    properties: {
      contractVersion: {
        type: "string",
        description: `Plan contract version; currently ${CONTRACT_VERSION}`,
      },
      planId: { type: "string" },
    },
    additionalProperties: false,
  } as const;
}

export const resourceTemplates = [
  {
    uriTemplate: "irudd-plan://plans/{planId}",
    name: "Current compact plan overview",
    description:
      "The epic goal and compact work-item index for one private plan.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "irudd-plan://plans/{planId}/items/{itemId}",
    name: "Current work-item packet",
    description: "The current complete packet for one private work item.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "irudd-plan://plans/{planId}/contexts/{contextId}",
    name: "Current shared context",
    description:
      "One deliberately selected shared context and its requirements.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "irudd-plan://plans/{planId}/assets/{assetId}?digest={digest}",
    name: "Immutable plan asset",
    description:
      "Owner-authenticated rendered asset bytes for an exact SHA-256 digest.",
    mimeType: "application/json",
  },
] as const;
