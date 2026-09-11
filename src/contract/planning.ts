import { SyncCursor, PageLimit } from "./sync.js";
import { Schema } from "effect";
import { AssetDescriptor, WorkItem, SharedContext, Decision } from "./plan.js";

const Text = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.isMaxLength(40_000),
);
const Id = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(200));
const Revision = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

export const PlanningEntry = Schema.Struct({
  id: Id,
  section: Text,
  kind: Schema.Literals(["question", "note", "answer", "resolved", "reopened"]),
  body: Text,
  source: Schema.optionalKey(Schema.Struct({ entryId: Id, label: Id })),
  replyTo: Schema.optionalKey(Id),
  choices: Schema.optionalKey(Schema.Array(Text)),
  assets: Schema.optionalKey(Schema.Array(AssetDescriptor)),
});
export type PlanningEntry = typeof PlanningEntry.Type;
export interface StoredPlanningEntry extends PlanningEntry {
  readonly operationId?: string;
  readonly author: "agent" | "human";
  readonly revision: number;
  readonly createdAt: string;
}
export interface PlanningConversation {
  readonly planId: string;
  readonly revision: number;
  readonly entries: readonly StoredPlanningEntry[];
}
export const GetPlanningRequest = Schema.Struct({
  contractVersion: Schema.Literal("v1"),
  planId: Id,
  cursor: Schema.optionalKey(SyncCursor),
  limit: Schema.optionalKey(PageLimit),
});
export const AppendPlanningRequest = Schema.Struct({
  contractVersion: Schema.Literal("v1"),
  planId: Id,
  operationId: Id,
  expectedRevision: Revision,
  expectedDigest: SyncCursor.fields.digest,
  entries: Schema.Array(PlanningEntry).check(Schema.isMinLength(1)),
});
export type AppendPlanningRequest = typeof AppendPlanningRequest.Type;

export const PatchPlanRequest = Schema.Struct({
  contractVersion: Schema.Literal("v1"),
  planId: Id,
  operationId: Id,
  expectedVersion: Revision.check(Schema.isGreaterThan(0)),
  expectedDigest: SyncCursor.fields.digest,
  epicGoal: Schema.optionalKey(Text),
  items: Schema.optionalKey(Schema.Array(WorkItem)),
  contexts: Schema.optionalKey(Schema.Array(SharedContext)),
  decisions: Schema.optionalKey(Schema.Array(Decision)),
  assets: Schema.optionalKey(Schema.Array(AssetDescriptor)),
  removeItemIds: Schema.optionalKey(Schema.Array(Id)),
  removeContextIds: Schema.optionalKey(Schema.Array(Id)),
  removeDecisionIds: Schema.optionalKey(Schema.Array(Id)),
  removeAssetIds: Schema.optionalKey(Schema.Array(Id)),
});
export type PatchPlanRequest = typeof PatchPlanRequest.Type;

export interface PlanningWriteReceipt {
  readonly planId: string;
  readonly operationId: string;
  readonly requestDigest: string;
  readonly baseCursor: SyncCursor;
  readonly cursor: SyncCursor;
  readonly revision: number;
  readonly replayed: boolean;
}
