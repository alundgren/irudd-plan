import { Schema } from "effect";

export const SyncCursor = Schema.Struct({
  revision: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  digest: Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
});
export type SyncCursor = typeof SyncCursor.Type;
export const PageLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(100),
);
export const SyncPlanRequest = Schema.Struct({
  contractVersion: Schema.Literal("v1"),
  planId: Schema.String.check(Schema.isPattern(/\S/)),
  cursor: Schema.optionalKey(SyncCursor),
  pageToken: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4000))),
  limit: Schema.optionalKey(PageLimit),
});
export type SyncPlanRequest = typeof SyncPlanRequest.Type;

export const GetOperationRequest = Schema.Struct({
  contractVersion: Schema.Literal("v1"),
  operationId: Schema.String.check(Schema.isPattern(/\S/)),
});
