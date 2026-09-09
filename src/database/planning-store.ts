import { conversationCursors } from "../domain/conversation-sync.js";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, eq, sql, asc } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";
import { PlanError } from "../contract/errors.js";
import type {
  AppendPlanningRequest,
  PlanningConversation,
  StoredPlanningEntry,
  PlanningEntry,
  PlanningWriteReceipt,
} from "../contract/planning.js";
import { canonicalJson, digest } from "../domain/validate-plan.js";
import { operations, plans, planningEntries } from "./schema.js";

type Database = Effect.Success<
  ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>
>;

export class PlanningStore {
  constructor(private readonly filename: string) {}

  private run<A, E>(
    program: (db: Database) => Effect.Effect<A, E>,
  ): Promise<A> {
    return Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* SQLiteNodeDrizzle.makeWithDefaults();
        yield* db.run(sql.raw("PRAGMA foreign_keys = ON"));
        return yield* program(db);
      }).pipe(
        Effect.provide(
          SqliteClient.layer({
            filename: this.filename,
            busyTimeout: "5 seconds",
          }),
        ),
        Effect.scoped,
      ),
    );
  }

  async get(ownerId: string, planId: string): Promise<PlanningConversation> {
    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const plan = yield* tx
            .select()
            .from(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
            .limit(1);
          if (!plan[0])
            return yield* Effect.fail(
              new PlanError("PLAN_NOT_FOUND", "Plan is unavailable"),
            );
          const rows = yield* tx
            .select()
            .from(planningEntries)
            .where(identity(ownerId, planId))
            .orderBy(asc(planningEntries.revision));
          const entries = rows.map(
            (row) => JSON.parse(row.contentJson) as StoredPlanningEntry,
          );
          return { planId, revision: entries.at(-1)?.revision ?? 0, entries };
        }),
      ),
    );
  }

  async append(
    ownerId: string,
    request: AppendPlanningRequest,
    author: "agent" | "human",
  ) {
    const requestDigest = digest({ type: "planning", author, request });
    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const plan = yield* tx
            .select()
            .from(plans)
            .where(
              and(eq(plans.ownerId, ownerId), eq(plans.id, request.planId)),
            )
            .limit(1);
          if (!plan[0])
            return yield* Effect.fail(
              new PlanError("PLAN_NOT_FOUND", "Plan is unavailable"),
            );
          const previous = yield* tx
            .select()
            .from(operations)
            .where(
              and(
                eq(operations.ownerId, ownerId),
                eq(operations.id, request.operationId),
              ),
            )
            .limit(1);
          if (previous[0]) {
            if (previous[0].requestDigest !== requestDigest)
              return yield* Effect.fail(
                new PlanError(
                  "OPERATION_MISMATCH",
                  "Operation was already used for another request",
                ),
              );
            return {
              ...(JSON.parse(previous[0].responseJson) as PlanningWriteReceipt),
              replayed: true,
            };
          }
          const rows = yield* tx
            .select()
            .from(planningEntries)
            .where(identity(ownerId, request.planId))
            .orderBy(asc(planningEntries.revision));
          const entries = rows.map(
            (row) => JSON.parse(row.contentJson) as StoredPlanningEntry,
          );
          let revision = entries.at(-1)?.revision ?? 0;
          if (request.expectedRevision !== revision)
            return yield* Effect.fail(
              new PlanError(
                "PLAN_CONFLICT",
                "Conversation changed. Read the latest answers before retrying.",
                { actualRevision: revision },
              ),
            );
          const baseCursor = conversationCursors(ownerId, {
            planId: request.planId,
            revision,
            entries,
          }).at(-1)!;
          if (request.expectedDigest !== baseCursor.digest)
            return yield* Effect.fail(
              new PlanError(
                "SYNC_REQUIRED",
                "Conversation cursor is divergent; synchronize before replying",
              ),
            );
          const known = new Map(entries.map((entry) => [entry.id, entry]));
          for (const entry of request.entries) {
            const invalid = validatePlanningEntry(entry, known, author);
            if (invalid) return yield* Effect.fail(invalid);
            const stored: StoredPlanningEntry = {
              ...entry,
              operationId: request.operationId,
              author,
              revision: ++revision,
              createdAt: new Date().toISOString(),
            };
            known.set(entry.id, stored);
            yield* tx.insert(planningEntries).values({
              ownerId,
              planId: request.planId,
              id: stored.id,
              revision,
              contentJson: canonicalJson(stored),
            });
          }
          const cursor = conversationCursors(ownerId, {
            planId: request.planId,
            revision,
            entries: [...known.values()],
          }).at(-1)!;
          const result = {
            planId: request.planId,
            operationId: request.operationId,
            requestDigest,
            baseCursor,
            cursor,
            revision,
            replayed: false,
          };
          yield* tx.insert(operations).values({
            ownerId,
            id: request.operationId,
            requestDigest,
            responseJson: canonicalJson(result),
          });
          return result;
        }),
      ),
    );
  }
}

function identity(ownerId: string, planId: string) {
  return and(
    eq(planningEntries.ownerId, ownerId),
    eq(planningEntries.planId, planId),
  );
}

function validatePlanningEntry(
  entry: PlanningEntry,
  known: ReadonlyMap<string, StoredPlanningEntry>,
  author: "agent" | "human",
): PlanError | undefined {
  if (known.has(entry.id))
    return new PlanError("DUPLICATE_ID", "Conversation entry already exists", {
      id: entry.id,
    });
  const target =
    entry.replyTo === undefined ? undefined : known.get(entry.replyTo);
  if (entry.replyTo !== undefined && target === undefined)
    return new PlanError("REFERENCE_MISSING", "Reply target is unavailable");
  if (
    target !== undefined &&
    (target.kind !== "question" || target.section !== entry.section)
  )
    return new PlanError(
      "REQUEST_INVALID",
      "Replies must use the question's section and reference a question",
    );
  if (
    (entry.kind === "answer" || entry.kind === "resolved") &&
    target?.kind !== "question"
  )
    return new PlanError(
      "REQUEST_INVALID",
      "Answers and resolutions must reference a question",
    );
  if (author === "agent" && entry.kind === "answer")
    return new PlanError(
      "REQUEST_INVALID",
      "Human answers must be submitted from the browser",
    );
  if (author === "human" && entry.kind !== "answer" && entry.kind !== "note")
    return new PlanError(
      "REQUEST_INVALID",
      "Browser entries must be answers or notes",
    );
  return undefined;
}
