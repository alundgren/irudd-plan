import { Schema } from "effect";
import { decode, type Plan } from "../contract/plan.js";
import { SyncCursor, type SyncPlanRequest } from "../contract/sync.js";
import type { PlanStore } from "../database/store.js";
import { PlanError } from "../contract/errors.js";
import { digest } from "./validate-plan.js";
import { initialCursor, sameCursor } from "./sync-cursor.js";

const collections = ["items", "contexts", "decisions", "assets"] as const;
type Collection = (typeof collections)[number];
export type PlanChange =
  | {
      kind: "header";
      value: Pick<
        Plan,
        "contractVersion" | "planId" | "repository" | "epicGoal"
      >;
    }
  | { kind: "upsert"; collection: Collection; value: Plan[Collection][number] }
  | { kind: "remove"; collection: Collection; id: string }
  | { kind: "order"; collection: Collection; ids: string[] };

const Continuation = Schema.Struct({
  ownerId: Schema.String,
  planId: Schema.String,
  baseCursor: SyncCursor,
  targetCursor: SyncCursor,
  offset: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});
type Continuation = typeof Continuation.Type;

export class PlanSync {
  constructor(private readonly store: PlanStore) {}

  async read(ownerId: string, request: SyncPlanRequest) {
    const current = await this.store.get(ownerId, request.planId);
    if (!current) throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    const headCursor = {
      revision: current.version,
      digest: digest(current.plan),
    };
    const initial = initialCursor(ownerId, request.planId, "plan");
    let state: Continuation;
    try {
      state =
        request.pageToken === undefined
          ? {
              ownerId,
              planId: request.planId,
              baseCursor: request.cursor ?? initial,
              targetCursor: headCursor,
              offset: 0,
            }
          : decode(
              Continuation,
              JSON.parse(
                Buffer.from(request.pageToken, "base64url").toString("utf8"),
              ),
            );
    } catch {
      return {
        status: "reset_required" as const,
        reason: "invalid_page_token",
        headCursor,
      };
    }
    if (
      state.ownerId !== ownerId ||
      state.planId !== request.planId ||
      (request.cursor && !sameCursor(request.cursor, state.baseCursor))
    )
      return {
        status: "reset_required" as const,
        reason: "cursor_scope_mismatch",
        headCursor,
      };
    const base =
      state.baseCursor.revision === 0
        ? undefined
        : await this.store.revision(
            ownerId,
            request.planId,
            state.baseCursor.revision,
          );
    const target =
      state.targetCursor.revision === current.version
        ? current.plan
        : await this.store.revision(
            ownerId,
            request.planId,
            state.targetCursor.revision,
          );
    if (!validSnapshots(base, target, state, headCursor, initial))
      return {
        status: "reset_required" as const,
        reason: "cursor_unavailable_or_divergent",
        headCursor,
      };
    const changes = planChanges(base, target!);
    if (state.offset > changes.length)
      return {
        status: "reset_required" as const,
        reason: "page_offset_unavailable",
        headCursor,
      };
    const page = changes.slice(
      state.offset,
      state.offset + (request.limit ?? 25),
    );
    const offset = state.offset + page.length;
    const nextPageToken =
      offset < changes.length
        ? Buffer.from(JSON.stringify({ ...state, offset })).toString(
            "base64url",
          )
        : null;
    return {
      status: changes.length ? ("delta" as const) : ("unchanged" as const),
      baseCursor: state.baseCursor,
      targetCursor: state.targetCursor,
      headCursor,
      offset: state.offset,
      nextOffset: offset,
      pageId: digest({ ...state, changes: page }),
      changes: page,
      nextPageToken,
    };
  }
}

export function planChanges(
  base: Plan | undefined,
  target: Plan,
): PlanChange[] {
  const header = ({ contractVersion, planId, repository, epicGoal }: Plan) => ({
    contractVersion,
    planId,
    repository,
    epicGoal,
  });
  const changes: PlanChange[] = [];
  if (!base || digest(header(base)) !== digest(header(target)))
    changes.push({ kind: "header", value: header(target) });
  for (const collection of collections) {
    const previous = new Map(
      base?.[collection].map((record) => [record.id, record]),
    );
    const nextIds = target[collection].map((record) => record.id);
    for (const oldId of previous.keys())
      if (!nextIds.includes(oldId))
        changes.push({ kind: "remove", collection, id: oldId });
    for (const value of target[collection])
      if (digest(previous.get(value.id) ?? null) !== digest(value))
        changes.push({ kind: "upsert", collection, value });
    if (
      digest(base?.[collection].map((record) => record.id) ?? []) !==
      digest(nextIds)
    )
      changes.push({ kind: "order", collection, ids: nextIds });
  }
  return changes;
}

function validSnapshots(
  base: Plan | undefined,
  target: Plan | undefined,
  state: Continuation,
  head: SyncCursor,
  initial: SyncCursor,
): boolean {
  return (
    target !== undefined &&
    state.targetCursor.revision <= head.revision &&
    digest(target) === state.targetCursor.digest &&
    state.baseCursor.revision <= state.targetCursor.revision &&
    (base
      ? digest(base) === state.baseCursor.digest
      : sameCursor(state.baseCursor, initial))
  );
}
