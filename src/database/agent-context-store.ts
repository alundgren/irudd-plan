import { agentContextCursors } from "../domain/agent-context-sync.js";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, eq, sql, asc } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";
import { PlanError } from "../contract/errors.js";
import type {
  AppendAgentContextRequest,
  AgentContext,
  StoredAgentContextEntry,
  AgentContextEntry,
} from "../contract/agent-context.js";
import { canonicalJson, digest } from "../domain/validate-plan.js";
import { operations, plans, agentContextEntries } from "./schema.js";

import type { PlanningWriteReceipt } from "../contract/planning.js";

type Database = Effect.Success<
  ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>
>;

export class AgentContextStore {
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

  async getEntry(
    ownerId: string,
    planId: string,
    entryId: string,
  ): Promise<StoredAgentContextEntry | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(agentContextEntries)
          .where(
            and(identity(ownerId, planId), eq(agentContextEntries.id, entryId)),
          )
          .limit(1);
        return rows[0]
          ? (JSON.parse(rows[0].contentJson) as StoredAgentContextEntry)
          : undefined;
      }),
    );
  }

  async get(ownerId: string, planId: string): Promise<AgentContext> {
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
            .from(agentContextEntries)
            .where(identity(ownerId, planId))
            .orderBy(asc(agentContextEntries.revision));
          const entries = rows.map(
            (row) => JSON.parse(row.contentJson) as StoredAgentContextEntry,
          );
          return { planId, revision: entries.at(-1)?.revision ?? 0, entries };
        }),
      ),
    );
  }

  async append(ownerId: string, request: AppendAgentContextRequest) {
    const requestDigest = digest({ type: "agent-context", request });
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
            .from(agentContextEntries)
            .where(identity(ownerId, request.planId))
            .orderBy(asc(agentContextEntries.revision));
          const entries = rows.map(
            (row) => JSON.parse(row.contentJson) as StoredAgentContextEntry,
          );
          let revision = entries.at(-1)?.revision ?? 0;
          if (request.expectedRevision !== revision)
            return yield* Effect.fail(
              new PlanError(
                "PLAN_CONFLICT",
                "Agent context changed. Read the latest findings before retrying.",
                { actualRevision: revision },
              ),
            );
          const baseCursor = agentContextCursors(ownerId, {
            planId: request.planId,
            revision,
            entries,
          }).at(-1)!;
          if (request.expectedDigest !== baseCursor.digest)
            return yield* Effect.fail(
              new PlanError(
                "SYNC_REQUIRED",
                "Agent context cursor is divergent; synchronize before writing",
              ),
            );
          const known = new Map(entries.map((entry) => [entry.id, entry]));
          for (const entry of request.entries) {
            const invalid = validateAgentContextEntry(entry, known);
            if (invalid) return yield* Effect.fail(invalid);
            const stored: StoredAgentContextEntry = {
              ...entry,
              operationId: request.operationId,
              author: "agent",
              revision: ++revision,
              createdAt: new Date().toISOString(),
            };
            known.set(entry.id, stored);
            yield* tx.insert(agentContextEntries).values({
              ownerId,
              planId: request.planId,
              id: stored.id,
              revision,
              contentJson: canonicalJson(stored),
            });
          }
          const cursor = agentContextCursors(ownerId, {
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
    eq(agentContextEntries.ownerId, ownerId),
    eq(agentContextEntries.planId, planId),
  );
}

function validateAgentContextEntry(
  entry: AgentContextEntry,
  known: ReadonlyMap<string, StoredAgentContextEntry>,
): PlanError | undefined {
  if (known.has(entry.id))
    return new PlanError("DUPLICATE_ID", "Agent context entry already exists", {
      id: entry.id,
    });
  if (entry.supersedes !== undefined && !known.has(entry.supersedes))
    return new PlanError(
      "REFERENCE_MISSING",
      "Superseded agent context is unavailable",
    );
  if (
    entry.supersedes !== undefined &&
    [...known.values()].some((note) => note.supersedes === entry.supersedes)
  )
    return new PlanError(
      "PLAN_CONFLICT",
      "Supersede the latest correction to this finding",
    );
  return undefined;
}
