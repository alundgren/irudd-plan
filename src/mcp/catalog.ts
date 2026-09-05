import { CONTRACT_VERSION } from "../contract/plan.js";

export const tools = [
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
        plan: { type: "object", description: `Complete ${CONTRACT_VERSION} plan document` },
      },
      additionalProperties: false,
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
    description: "Deliberately retrieve one shared context and everything it requires.",
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
        contractVersion: { const: CONTRACT_VERSION },
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

export const resourceTemplates = [
  {
    uriTemplate: "irudd-plan://plans/{planId}",
    name: "Current compact plan overview",
    description: "The epic goal and compact work-item index for one private plan.",
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
    description: "One deliberately selected shared context and its requirements.",
    mimeType: "application/json",
  },
] as const;
