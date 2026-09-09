import { Schema } from "effect";
import { GetPlanningRequest, AppendPlanningRequest } from "./planning.js";

const Id = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(200));
const Text = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.isMaxLength(40_000),
);
export const AgentContextEntry = Schema.Struct({
  id: Id,
  title: Id,
  body: Text,
  supersedes: Schema.optionalKey(Id),
});
export type AgentContextEntry = typeof AgentContextEntry.Type;
export interface StoredAgentContextEntry extends AgentContextEntry {
  readonly operationId?: string;
  readonly author: "agent";
  readonly revision: number;
  readonly createdAt: string;
}
export interface AgentContext {
  readonly planId: string;
  readonly revision: number;
  readonly entries: readonly StoredAgentContextEntry[];
}
export const GetAgentContextRequest = GetPlanningRequest;
export const GetAgentContextEntryRequest = Schema.Struct({
  contractVersion: Schema.Literal("v1"),
  planId: Id,
  entryId: Id,
});
export const AppendAgentContextRequest = Schema.Struct({
  ...AppendPlanningRequest.fields,
  entries: Schema.Array(AgentContextEntry).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(50),
  ),
});
export type AppendAgentContextRequest = typeof AppendAgentContextRequest.Type;
