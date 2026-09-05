import { Schema } from "effect";

export const CONTRACT_VERSION = "v1" as const;
export const MCP_PROTOCOL_VERSION = "2026-07-28" as const;

const Identifier = Schema.String.check(Schema.isPattern(/\S/));
const NonEmptyText = Schema.String.check(Schema.isPattern(/\S/));
const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));

export const RepositoryIdentity = Schema.Struct({
  provider: Schema.Literal("github"),
  owner: NonEmptyText,
  name: NonEmptyText,
});

export const AcceptanceCriterion = Schema.Struct({
  id: Identifier,
  text: NonEmptyText,
});

export const AssetDescriptor = Schema.Struct({
  id: Identifier,
  uri: NonEmptyText,
  mediaType: NonEmptyText,
  digest: NonEmptyText,
  caption: NonEmptyText,
  role: NonEmptyText,
  available: Schema.Boolean,
});

export const SharedContext = Schema.Struct({
  id: Identifier,
  title: NonEmptyText,
  body: NonEmptyText,
  reason: NonEmptyText,
  source: Schema.optionalKey(NonEmptyText),
  requiredContextIds: Schema.Array(Identifier),
  assetIds: Schema.Array(Identifier),
});

export const Decision = Schema.Struct({
  id: Identifier,
  title: NonEmptyText,
  body: NonEmptyText,
  reason: NonEmptyText,
  source: Schema.optionalKey(NonEmptyText),
  requiredContextIds: Schema.Array(Identifier),
  assetIds: Schema.Array(Identifier),
});

export const WorkItem = Schema.Struct({
  id: Identifier,
  title: NonEmptyText,
  shortGoal: NonEmptyText,
  goal: NonEmptyText,
  requirements: Schema.Array(NonEmptyText),
  relevantPriorArt: Schema.Array(NonEmptyText),
  checks: Schema.Array(NonEmptyText),
  deferrals: Schema.Array(NonEmptyText),
  completionExpectation: NonEmptyText,
  acceptanceCriteria: Schema.Array(AcceptanceCriterion),
  requiredContextIds: Schema.Array(Identifier),
  requiredDecisionIds: Schema.Array(Identifier),
  requiredAssetIds: Schema.Array(Identifier),
  relatedItemIds: Schema.Array(Identifier),
});

export const Plan = Schema.Struct({
  contractVersion: Schema.Literal(CONTRACT_VERSION),
  planId: Identifier,
  repository: RepositoryIdentity,
  epicGoal: NonEmptyText,
  items: Schema.Array(WorkItem),
  contexts: Schema.Array(SharedContext),
  decisions: Schema.Array(Decision),
  assets: Schema.Array(AssetDescriptor),
});

export const WritePlanRequest = Schema.Struct({
  operationId: Identifier,
  expectedVersion: Schema.NullOr(PositiveInteger),
  plan: Plan,
});

export const GetItemRequest = Schema.Struct({
  contractVersion: Schema.Literal(CONTRACT_VERSION),
  planId: Identifier,
  itemId: Identifier,
});

export const GetRelatedContextRequest = Schema.Struct({
  contractVersion: Schema.Literal(CONTRACT_VERSION),
  planId: Identifier,
  contextId: Identifier,
});

export const CheckPacketRequest = Schema.Struct({
  contractVersion: Schema.Literal(CONTRACT_VERSION),
  planId: Identifier,
  itemId: Identifier,
  packetVersion: Identifier,
});

export const ListPlansRequest = Schema.Struct({
  contractVersion: Schema.Literal(CONTRACT_VERSION),
});

export type Plan = typeof Plan.Type;
export type WorkItem = typeof WorkItem.Type;
export type SharedContext = typeof SharedContext.Type;
export type Decision = typeof Decision.Type;
export type AssetDescriptor = typeof AssetDescriptor.Type;
export type WritePlanRequest = typeof WritePlanRequest.Type;
export type GetItemRequest = typeof GetItemRequest.Type;
export type GetRelatedContextRequest = typeof GetRelatedContextRequest.Type;
export type CheckPacketRequest = typeof CheckPacketRequest.Type;

export function decode<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
): S["Type"] {
  return Schema.decodeUnknownSync(schema)(input);
}
