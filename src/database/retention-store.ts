import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, eq, lte, sql } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";

import type { RetentionStatus } from "../domain/retention-status.js";
import {
  assetObjects,
  deletedPlans,
  githubWorkLinks,
  plans,
} from "./schema.js";

export interface RetentionSnapshot {
  readonly plan: typeof plans.$inferSelect;
  readonly links: ReadonlyArray<typeof githubWorkLinks.$inferSelect>;
}

type Database = Effect.Success<
  ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>
>;

export class RetentionStore {
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

  due(now: string, limit: number) {
    return this.run((db) =>
      db
        .select({ ownerId: plans.ownerId, planId: plans.id })
        .from(plans)
        .where(lte(plans.retentionNextCheckAt, now))
        .orderBy(plans.retentionNextCheckAt, plans.ownerId, plans.id)
        .limit(limit),
    );
  }

  snapshot(
    ownerId: string,
    planId: string,
  ): Promise<RetentionSnapshot | undefined> {
    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const plan = (yield* tx
            .select()
            .from(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
            .limit(1))[0];
          if (plan === undefined) return undefined;
          const links = yield* tx
            .select()
            .from(githubWorkLinks)
            .where(
              and(
                eq(githubWorkLinks.ownerId, ownerId),
                eq(githubWorkLinks.planId, planId),
              ),
            );
          return { plan, links };
        }),
      ),
    );
  }

  commit(
    snapshot: RetentionSnapshot,
    status: RetentionStatus,
    remove: boolean,
  ): Promise<"changed" | "deleted" | "retained"> {
    const { ownerId, id: planId, retentionGeneration } = snapshot.plan;
    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          // The conditional write acquires SQLite's write lock before any deletion.
          // An attachment or revision accepted during verification invalidates it.
          const updated = yield* tx
            .update(plans)
            .set({
              retentionGeneration: retentionGeneration + 1,
              retentionStatus: status.status,
              retentionReason: status.reason,
              retentionCheckedAt: status.checkedAt,
              retentionNextCheckAt: status.nextCheckAt,
              inactiveSince: status.inactiveSince,
              expiresAt: status.expiresAt,
            })
            .where(
              and(
                eq(plans.ownerId, ownerId),
                eq(plans.id, planId),
                eq(plans.retentionGeneration, retentionGeneration),
              ),
            )
            .returning({ id: plans.id });
          if (updated.length === 0) return "changed" as const;
          if (!remove) return "retained" as const;
          yield* tx
            .insert(deletedPlans)
            .values({ ownerId, planId, deletedAt: status.checkedAt! });
          yield* tx
            .delete(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)));
          // Asset references are validated against this exact owner and plan at write time.
          // Identical digests under other plans are separate stored objects.
          yield* tx
            .delete(assetObjects)
            .where(
              and(
                eq(assetObjects.ownerId, ownerId),
                eq(assetObjects.planId, planId),
              ),
            );
          return "deleted" as const;
        }),
      ),
    );
  }
}
