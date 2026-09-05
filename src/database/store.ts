import { and, eq } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import { migrate } from "drizzle-orm/effect-sqlite-node/migrator";
import * as Effect from "effect/Effect";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { PlanError } from "../contract/errors.js";
import type { Plan, WritePlanRequest } from "../contract/plan.js";
import { canonicalJson, digest, validatePlan } from "../domain/validate-plan.js";
import {
  acceptanceCriteria,
  assets,
  decisions,
  operations,
  ownerCredentials,
  owners,
  planRevisions,
  plans,
  sharedContexts,
  workItems,
} from "./schema.js";

export interface CredentialMapping {
  readonly issuer: string;
  readonly claim: "common_name" | "sub" | "email";
  readonly value: string;
  readonly kind: "service" | "browser";
  readonly ownerId: string;
}

export interface WriteResult {
  readonly planId: string;
  readonly version: number;
  readonly planDigest: string;
  readonly resourceUri: string;
  readonly replayed: boolean;
}

export interface StoredPlan {
  readonly plan: Plan;
  readonly version: number;
}

export interface ListedPlan {
  readonly planId: string;
  readonly epicGoal: string;
  readonly repository: { readonly provider: string; readonly owner: string; readonly name: string };
  readonly version: number;
  readonly updatedAt: string;
}

type Database = Effect.Success<ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>>;

export class PlanStore {
  constructor(
    private readonly filename: string,
    private readonly migrationsFolder: string,
  ) {}

  private run<A, E>(program: (db: Database) => Effect.Effect<A, E>): Promise<A> {
    const layer = SqliteClient.layer({ filename: this.filename, busyTimeout: "5 seconds" });
    const scoped = Effect.gen(function* () {
      const db = yield* SQLiteNodeDrizzle.makeWithDefaults();
      return yield* program(db);
    }).pipe(Effect.provide(layer), Effect.scoped);
    return Effect.runPromise(scoped);
  }

  async migrate(): Promise<void> {
    await this.run((db) => migrate(db, { migrationsFolder: this.migrationsFolder }));
  }

  async configureOwners(mappings: ReadonlyArray<CredentialMapping>): Promise<void> {
    await this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.delete(ownerCredentials);
          for (const mapping of mappings) {
            yield* tx.insert(owners).values({ id: mapping.ownerId }).onConflictDoNothing();
            yield* tx
              .insert(ownerCredentials)
              .values(mapping)
              .onConflictDoUpdate({
                target: [ownerCredentials.issuer, ownerCredentials.claim, ownerCredentials.value],
                set: { kind: mapping.kind, ownerId: mapping.ownerId },
              });
          }
        }),
      ),
    );
  }

  async resolveOwner(
    issuer: string,
    claims: Readonly<Record<string, unknown>>,
    kind: "service" | "browser",
  ): Promise<string | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const candidates = ["common_name", "sub", "email"] as const;
        for (const claim of candidates) {
          const value = claims[claim];
          if (typeof value !== "string") continue;
          const rows = yield* db
            .select({ ownerId: ownerCredentials.ownerId })
            .from(ownerCredentials)
            .where(
              and(
                eq(ownerCredentials.issuer, issuer),
                eq(ownerCredentials.claim, claim),
                eq(ownerCredentials.value, value),
                eq(ownerCredentials.kind, kind),
              ),
            )
            .limit(1);
          if (rows[0] !== undefined) return rows[0].ownerId;
        }
        return undefined;
      }),
    );
  }

  async write(ownerId: string, request: WritePlanRequest): Promise<WriteResult> {
    if (request.operationId.trim().length === 0) {
      throw new PlanError("REQUEST_INVALID", "operationId cannot be empty");
    }
    validatePlan(request.plan);
    const requestDigest = digest(request);
    const contentJson = canonicalJson(request.plan);
    const planDigest = digest(request.plan);

    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const previousOperations = yield* tx
            .select()
            .from(operations)
            .where(and(eq(operations.ownerId, ownerId), eq(operations.id, request.operationId)))
            .limit(1);
          const previousOperation = previousOperations[0];
          if (previousOperation !== undefined) {
            if (previousOperation.requestDigest !== requestDigest) {
              return yield* Effect.fail(
                new PlanError(
                  "OPERATION_MISMATCH",
                  `Operation id ${request.operationId} was already used for another request`,
                ),
              );
            }
            return {
              ...(JSON.parse(previousOperation.responseJson) as WriteResult),
              replayed: true,
            };
          }

          const existingRows = yield* tx
            .select()
            .from(plans)
            .where(and(eq(plans.ownerId, ownerId), eq(plans.id, request.plan.planId)))
            .limit(1);
          const existing = existingRows[0];
          if (existing === undefined && request.expectedVersion !== null) {
            return yield* Effect.fail(
              new PlanError("PLAN_CONFLICT", "Plan does not exist at the expected version", {
                actualVersion: null,
                expectedVersion: request.expectedVersion,
              }),
            );
          }
          if (existing !== undefined && request.expectedVersion !== existing.currentVersion) {
            return yield* Effect.fail(
              new PlanError("PLAN_CONFLICT", "Plan version does not match expectedVersion", {
                actualVersion: existing.currentVersion,
                expectedVersion: request.expectedVersion,
              }),
            );
          }
          if (
            existing !== undefined &&
            (existing.repositoryProvider !== request.plan.repository.provider ||
              existing.repositoryOwner !== request.plan.repository.owner ||
              existing.repositoryName !== request.plan.repository.name)
          ) {
            return yield* Effect.fail(
              new PlanError("PLAN_CONFLICT", "A plan cannot be rebound to another repository"),
            );
          }

          const version = (existing?.currentVersion ?? 0) + 1;
          if (existing === undefined) {
            yield* tx.insert(plans).values({
              ownerId,
              id: request.plan.planId,
              repositoryProvider: request.plan.repository.provider,
              repositoryOwner: request.plan.repository.owner,
              repositoryName: request.plan.repository.name,
              repositoryVerified: false,
              contractVersion: request.plan.contractVersion,
              epicGoal: request.plan.epicGoal,
              currentVersion: version,
            });
          } else {
            yield* tx
              .update(plans)
              .set({
                epicGoal: request.plan.epicGoal,
                currentVersion: version,
                updatedAt: new Date().toISOString(),
              })
              .where(
                and(
                  eq(plans.ownerId, ownerId),
                  eq(plans.id, request.plan.planId),
                  eq(plans.currentVersion, existing.currentVersion),
                ),
              );
            yield* tx
              .delete(workItems)
              .where(
                and(eq(workItems.ownerId, ownerId), eq(workItems.planId, request.plan.planId)),
              );
            yield* tx
              .delete(sharedContexts)
              .where(
                and(
                  eq(sharedContexts.ownerId, ownerId),
                  eq(sharedContexts.planId, request.plan.planId),
                ),
              );
            yield* tx
              .delete(decisions)
              .where(
                and(eq(decisions.ownerId, ownerId), eq(decisions.planId, request.plan.planId)),
              );
            yield* tx
              .delete(assets)
              .where(and(eq(assets.ownerId, ownerId), eq(assets.planId, request.plan.planId)));
          }

          if (request.plan.items.length > 0) {
            yield* tx.insert(workItems).values(
              request.plan.items.map((item) => ({
                ownerId,
                planId: request.plan.planId,
                id: item.id,
                title: item.title,
                shortGoal: item.shortGoal,
              })),
            );
            const criteria = request.plan.items.flatMap((item) =>
              item.acceptanceCriteria.map((criterion) => ({
                ownerId,
                planId: request.plan.planId,
                itemId: item.id,
                id: criterion.id,
                text: criterion.text,
              })),
            );
            if (criteria.length > 0) yield* tx.insert(acceptanceCriteria).values(criteria);
          }
          if (request.plan.contexts.length > 0) {
            yield* tx.insert(sharedContexts).values(
              request.plan.contexts.map((context) => ({
                ownerId,
                planId: request.plan.planId,
                id: context.id,
                title: context.title,
                reason: context.reason,
                source: context.source,
              })),
            );
          }
          if (request.plan.decisions.length > 0) {
            yield* tx.insert(decisions).values(
              request.plan.decisions.map((decision) => ({
                ownerId,
                planId: request.plan.planId,
                id: decision.id,
                title: decision.title,
                reason: decision.reason,
                source: decision.source,
              })),
            );
          }
          if (request.plan.assets.length > 0) {
            yield* tx.insert(assets).values(
              request.plan.assets.map((asset) => ({
                ownerId,
                planId: request.plan.planId,
                id: asset.id,
                uri: asset.uri,
                mediaType: asset.mediaType,
                digest: asset.digest,
                caption: asset.caption,
                role: asset.role,
                available: asset.available,
              })),
            );
          }

          yield* tx.insert(planRevisions).values({
            ownerId,
            planId: request.plan.planId,
            version,
            operationId: request.operationId,
            planDigest,
            contentJson,
          });
          const response: WriteResult = {
            planId: request.plan.planId,
            version,
            planDigest,
            resourceUri: `irudd-plan://plans/${encodeURIComponent(request.plan.planId)}`,
            replayed: false,
          };
          yield* tx.insert(operations).values({
            ownerId,
            id: request.operationId,
            requestDigest,
            responseJson: canonicalJson(response),
          });
          return response;
        }),
      ),
    );
  }

  async get(ownerId: string, planId: string): Promise<StoredPlan | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            version: plans.currentVersion,
            contentJson: planRevisions.contentJson,
          })
          .from(plans)
          .innerJoin(
            planRevisions,
            and(
              eq(planRevisions.ownerId, plans.ownerId),
              eq(planRevisions.planId, plans.id),
              eq(planRevisions.version, plans.currentVersion),
            ),
          )
          .where(and(eq(plans.ownerId, ownerId), eq(plans.id, planId)))
          .limit(1);
        const current = rows[0];
        if (current === undefined) return undefined;
        return { plan: JSON.parse(current.contentJson) as Plan, version: current.version };
      }),
    );
  }

  async list(ownerId: string): Promise<ReadonlyArray<ListedPlan>> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(plans).where(eq(plans.ownerId, ownerId));
        return rows.map((row) => ({
          planId: row.id,
          epicGoal: row.epicGoal,
          repository: {
            provider: row.repositoryProvider,
            owner: row.repositoryOwner,
            name: row.repositoryName,
          },
          version: row.currentVersion,
          updatedAt: row.updatedAt,
        }));
      }),
    );
  }
}
