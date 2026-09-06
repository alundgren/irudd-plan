import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, eq, sql } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";

import { PlanError } from "../contract/errors.js";
import { githubWorkLinks, plans, workItems } from "./schema.js";

export interface RepositoryRecord {
  readonly owner: string;
  readonly name: string;
  readonly id?: string;
  readonly visibility?: "public" | "private";
  readonly verified: boolean;
}

export interface GitHubWorkLinkInput {
  readonly itemId?: string;
  readonly repositoryId: string;
  readonly workNodeId: string;
  readonly workDatabaseId: string;
  readonly type: "issue" | "pull_request";
  readonly number: number;
  readonly url: string;
  readonly state: string;
  readonly lastObservedAt: string;
  readonly closedAt?: string;
}

type Database = Effect.Success<
  ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>
>;

export class GitHubStore {
  constructor(private readonly filename: string) {}

  private run<A, E>(
    program: (db: Database) => Effect.Effect<A, E>,
  ): Promise<A> {
    const layer = SqliteClient.layer({
      filename: this.filename,
      busyTimeout: "5 seconds",
    });
    const scoped = Effect.gen(function* () {
      const db = yield* SQLiteNodeDrizzle.makeWithDefaults();
      yield* db.run(sql.raw("PRAGMA foreign_keys = ON"));
      return yield* program(db);
    }).pipe(Effect.provide(layer), Effect.scoped);
    return Effect.runPromise(scoped);
  }

  async repository(
    ownerId: string,
    planId: string,
  ): Promise<RepositoryRecord | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const row = (yield* db
          .select()
          .from(plans)
          .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
          .limit(1))[0];
        if (row === undefined) return undefined;
        return {
          owner: row.repositoryOwner,
          name: row.repositoryName,
          ...(row.repositoryId === null ? {} : { id: row.repositoryId }),
          ...(row.repositoryVisibility === null
            ? {}
            : { visibility: row.repositoryVisibility }),
          verified: row.repositoryVerified,
        };
      }),
    );
  }

  async verifyRepository(
    ownerId: string,
    planId: string,
    repository: {
      readonly id: string;
      readonly owner: string;
      readonly name: string;
      readonly visibility: "public" | "private";
    },
  ): Promise<void> {
    await this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const row = (yield* tx
            .select()
            .from(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
            .limit(1))[0];
          if (row === undefined) {
            return yield* Effect.fail(
              new PlanError("PLAN_NOT_FOUND", "Plan is unavailable"),
            );
          }
          if (
            row.repositoryVerified &&
            (row.repositoryId !== repository.id ||
              row.repositoryOwner !== repository.owner ||
              row.repositoryName !== repository.name)
          ) {
            return yield* Effect.fail(
              new PlanError(
                "PLAN_CONFLICT",
                "A verified plan cannot be rebound to another repository",
              ),
            );
          }
          yield* tx
            .update(plans)
            .set({
              retentionGeneration: sql`${plans.retentionGeneration} + 1`,
              repositoryOwner: repository.owner,
              repositoryName: repository.name,
              repositoryId: repository.id,
              repositoryVisibility: repository.visibility,
              repositoryVerified: true,
              repositoryVerifiedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)));
        }),
      ),
    );
  }

  async publish(ownerId: string, planId: string): Promise<string> {
    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const row = (yield* tx
            .select()
            .from(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
            .limit(1))[0];
          if (row === undefined) {
            return yield* Effect.fail(
              new PlanError("PLAN_NOT_FOUND", "Plan is unavailable"),
            );
          }
          if (
            !row.repositoryVerified ||
            row.repositoryVisibility !== "public"
          ) {
            return yield* Effect.fail(
              new PlanError(
                "PUBLICATION_NOT_ALLOWED",
                "Only a verified public-repository plan can be published",
              ),
            );
          }
          const publishedAt = row.publishedAt ?? new Date().toISOString();
          yield* tx
            .update(plans)
            .set({
              publishedAt,
              retentionGeneration: sql`${plans.retentionGeneration} + 1`,
            })
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)));
          return publishedAt;
        }),
      ),
    );
  }

  async link(
    ownerId: string,
    planId: string,
    link: GitHubWorkLinkInput,
  ): Promise<void> {
    await this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const plan = (yield* tx
            .select()
            .from(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
            .limit(1))[0];
          if (plan === undefined) {
            return yield* Effect.fail(
              new PlanError("PLAN_NOT_FOUND", "Plan is unavailable"),
            );
          }
          if (
            !plan.repositoryVerified ||
            plan.repositoryId !== link.repositoryId
          ) {
            return yield* Effect.fail(
              new PlanError(
                "GITHUB_ACCESS_DENIED",
                "The work item does not belong to the verified repository",
              ),
            );
          }
          if (link.itemId !== undefined) {
            const item = (yield* tx
              .select({ id: workItems.id })
              .from(workItems)
              .where(
                and(
                  eq(workItems.ownerId, ownerId),
                  eq(workItems.planId, planId),
                  eq(workItems.id, link.itemId),
                ),
              )
              .limit(1))[0];
            if (item === undefined) {
              return yield* Effect.fail(
                new PlanError("ITEM_NOT_FOUND", "Work item is unavailable"),
              );
            }
          }
          yield* tx
            .update(plans)
            .set({
              retentionGeneration: sql`${plans.retentionGeneration} + 1`,
              everAttached: true,
              retentionStatus: link.state === "open" ? "retained" : "unknown",
              retentionReason:
                link.state === "open"
                  ? "Linked GitHub work is open."
                  : "Linked work needs a complete GitHub status check.",
              expiresAt: null,
              inactiveSince: null,
              retentionNextCheckAt: "1970-01-01T00:00:00.000Z",
            })
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)));
          yield* tx
            .insert(githubWorkLinks)
            .values({ ownerId, planId, ...link, itemId: link.itemId ?? null })
            .onConflictDoUpdate({
              target: [
                githubWorkLinks.ownerId,
                githubWorkLinks.planId,
                githubWorkLinks.type,
                githubWorkLinks.workNodeId,
              ],
              set: {
                itemId: link.itemId ?? null,
                workDatabaseId: link.workDatabaseId,
                number: link.number,
                url: link.url,
                state: link.state,
                lastObservedAt: link.lastObservedAt,
                closedAt: link.closedAt ?? null,
              },
            });
        }),
      ),
    );
  }

  list(ownerId: string, planId: string) {
    return this.run((db) =>
      db
        .select()
        .from(githubWorkLinks)
        .where(
          and(
            eq(githubWorkLinks.ownerId, ownerId),
            eq(githubWorkLinks.planId, planId),
          ),
        )
        .orderBy(githubWorkLinks.number),
    );
  }
}
