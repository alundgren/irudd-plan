const identity = {
  contractVersion: { type: "string", const: "v1" },
  planId: { type: "string" },
};
const revision = { type: "integer", minimum: 0 };
const digest = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const cursor = {
  type: "object",
  required: ["revision", "digest"],
  properties: { revision, digest },
  additionalProperties: false,
};
const limit = { type: "integer", minimum: 1, maximum: 100 };
const records = { type: "array", items: { type: "object" } };
const ids = { type: "array", items: { type: "string" } };

export const planningTools = [
  {
    name: "get_operation",
    description:
      "Look up an owner-scoped write receipt without resending its content. recorded returns the original request digest and result. unknown is not proof a write never occurred after a restore; retry identical input and operationId, respecting cursor conflicts.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "operationId"],
      properties: {
        contractVersion: identity.contractVersion,
        operationId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sync_plan",
    description:
      "Read only changed specification records since a revision/digest cursor. Default 25 records, max 100. No cursor starts bounded bootstrap. Follow nextPageToken, stage pages and advance to targetCursor only after the last page. reset_required means discard the invalid cache and bootstrap in pages. Never call get_plan for routine synchronization. Conversation and asset bytes are excluded.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "planId"],
      properties: {
        ...identity,
        cursor,
        pageToken: { type: "string", maxLength: 4000 },
        limit,
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_planning",
    description:
      "Read a bounded page of new conversation entries using a revision/digest cursor. Default 25 entries, max 100. No cursor starts bootstrap. Retain returned cursor; follow hasMore immediately and otherwise poll. reset_required returns no entries: discard invalid cached history and bootstrap again. No automatic agent launch.",
    inputSchema: {
      type: "object",
      required: ["contractVersion", "planId"],
      properties: { ...identity, cursor, limit },
      additionalProperties: false,
    },
  },
  {
    name: "append_planning",
    description:
      "Append a small batch of questions, notes or resolutions to the private planning canvas. Entries are immutable. Use replyTo for follow-ups and resolutions, section for grouping, choices for suggested answers, and exact uploaded asset descriptors for visuals. Human answers arrive through the browser. Read current revision first; retry identical operationId and input after an uncertain result.",
    inputSchema: {
      type: "object",
      required: [
        "contractVersion",
        "planId",
        "operationId",
        "expectedRevision",
        "expectedDigest",
        "entries",
      ],
      properties: {
        ...identity,
        operationId: { type: "string" },
        expectedRevision: revision,
        expectedDigest: digest,
        entries: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            required: ["id", "section", "kind", "body"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              section: { type: "string" },
              body: { type: "string" },
              kind: { type: "string", enum: ["question", "note", "resolved"] },
              replyTo: { type: "string" },
              choices: ids,
              assets: records,
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "patch_plan",
    description:
      "Apply a small specification delta at expectedVersion. Arrays upsert complete records by stable ID, preserving all other records. remove*Ids explicitly delete records. Validation and conflict protection match write_plan. Discussion remains separate. Retry identical input and operationId after uncertain results.",
    inputSchema: {
      type: "object",
      required: [
        "contractVersion",
        "planId",
        "operationId",
        "expectedVersion",
        "expectedDigest",
      ],
      properties: {
        ...identity,
        operationId: { type: "string" },
        expectedVersion: { type: "integer", minimum: 1 },
        expectedDigest: digest,
        epicGoal: { type: "string" },
        items: records,
        contexts: records,
        decisions: records,
        assets: records,
        removeItemIds: ids,
        removeContextIds: ids,
        removeDecisionIds: ids,
        removeAssetIds: ids,
      },
      additionalProperties: false,
    },
  },
] as const;
