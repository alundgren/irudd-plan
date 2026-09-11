import { AgentContextStore } from "./agent-context-store.js";
import { PlanningStore } from "./planning-store.js";
import { and, eq, sql } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import { migrate } from "drizzle-orm/effect-sqlite-node/migrator";
import * as Effect from "effect/Effect";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import {
  retentionStatus,
  type RetentionStatus,
} from "../domain/retention-status.js";
import { PlanError } from "../contract/errors.js";
import type { Plan, WritePlanRequest } from "../contract/plan.js";
import {
  canonicalJson,
  digest,
  validatePlan,
} from "../domain/validate-plan.js";
import type { AssetLimits, PreparedAsset } from "../domain/assets.js";
import { AssetStore, type StoredAsset } from "./asset-store.js";
import {
  acceptanceCriteria,
  assets,
  decisions,
  deletedPlans,
  operations,
  ownerCredentials,
  owners,
  planRevisions,
  planningEntries,
  plans,
  sharedContexts,
  workItems,
} from "./schema.js";
import {
  GitHubStore,
  type GitHubWorkLinkInput,
  type RepositoryRecord,
} from "./github-store.js";

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
  readonly access: PlanAccess;
  readonly retention: RetentionStatus;
}

export interface PlanAccess {
  readonly repositoryVerified: boolean;
  readonly repositoryId?: string;
  readonly repositoryVisibility?: "public" | "private";
  readonly published: boolean;
  readonly publishedAt?: string;
}

export interface ListedPlan {
  readonly retention: RetentionStatus;
  readonly planId: string;
  readonly epicGoal: string;
  readonly repository: {
    readonly provider: string;
    readonly owner: string;
    readonly name: string;
  };
  readonly version: number;
  readonly updatedAt: string;
  readonly access: {
    readonly repositoryVerified: boolean;
    readonly repositoryVisibility?: "public" | "private";
    readonly published: boolean;
  };
}

type Database = Effect.Success<
  ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>
>;

export class PlanStore {
  readonly planning: PlanningStore;
  readonly agentContext: AgentContextStore;
  private readonly assetStore: AssetStore;
  private readonly githubStore: GitHubStore;

  constructor(
    private readonly filename: string,
    private readonly migrationsFolder: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.planning = new PlanningStore(filename);
    this.agentContext = new AgentContextStore(filename);
    this.assetStore = new AssetStore(filename);
    this.githubStore = new GitHubStore(filename);
  }

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

  async migrate(): Promise<void> {
    await this.run((db) =>
      migrate(db, { migrationsFolder: this.migrationsFolder }),
    );
  }

  async configureOwners(
    mappings: ReadonlyArray<CredentialMapping>,
  ): Promise<void> {
    await this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.delete(ownerCredentials);
          for (const mapping of mappings) {
            yield* tx
              .insert(owners)
              .values({ id: mapping.ownerId })
              .onConflictDoNothing();
            yield* tx
              .insert(ownerCredentials)
              .values(mapping)
              .onConflictDoUpdate({
                target: [
                  ownerCredentials.issuer,
                  ownerCredentials.claim,
                  ownerCredentials.value,
                ],
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

  async write(
    ownerId: string,
    request: WritePlanRequest,
    originalRequest: unknown = request,
  ): Promise<WriteResult> {
    if (request.operationId.trim().length === 0) {
      throw new PlanError("REQUEST_INVALID", "operationId cannot be empty");
    }
    validatePlan(request.plan);
    const createdAt = this.now().toISOString();
    const requestDigest = digest(originalRequest);
    const contentJson = canonicalJson(request.plan);
    const planDigest = digest(request.plan);

    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const deleted = yield* tx
            .select()
            .from(deletedPlans)
            .where(
              and(
                eq(deletedPlans.ownerId, ownerId),
                eq(deletedPlans.planId, request.plan.planId),
              ),
            )
            .limit(1);
          if (deleted.length > 0)
            return yield* Effect.fail(
              new PlanError("PLAN_NOT_FOUND", "Plan is unavailable"),
            );
          const previousOperations = yield* tx
            .select()
            .from(operations)
            .where(
              and(
                eq(operations.ownerId, ownerId),
                eq(operations.id, request.operationId),
              ),
            )
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
            .where(
              and(
                eq(plans.ownerId, ownerId),
                eq(plans.id, request.plan.planId),
              ),
            )
            .limit(1);
          const existing = existingRows[0];
          if (existing === undefined && request.expectedVersion !== null) {
            return yield* Effect.fail(
              new PlanError(
                "PLAN_CONFLICT",
                "Plan does not exist at the expected version",
                {
                  actualVersion: null,
                  expectedVersion: request.expectedVersion,
                },
              ),
            );
          }
          if (
            existing !== undefined &&
            request.expectedVersion !== existing.currentVersion
          ) {
            return yield* Effect.fail(
              new PlanError(
                "PLAN_CONFLICT",
                "Plan version does not match expectedVersion",
                {
                  actualVersion: existing.currentVersion,
                  expectedVersion: request.expectedVersion,
                },
              ),
            );
          }
          if (
            existing !== undefined &&
            existing.repositoryVerified &&
            (existing.repositoryProvider !== request.plan.repository.provider ||
              existing.repositoryOwner !== request.plan.repository.owner ||
              existing.repositoryName !== request.plan.repository.name)
          ) {
            return yield* Effect.fail(
              new PlanError(
                "PLAN_CONFLICT",
                "A plan cannot be rebound to another repository",
              ),
            );
          }

          if (existing !== undefined) {
            const revisions = yield* tx
              .select()
              .from(planRevisions)
              .where(
                and(
                  eq(planRevisions.ownerId, ownerId),
                  eq(planRevisions.planId, request.plan.planId),
                  eq(planRevisions.version, existing.currentVersion),
                ),
              )
              .limit(1);
            if (
              request.expectedDigest !== undefined &&
              revisions[0]!.planDigest !== request.expectedDigest
            )
              return yield* Effect.fail(
                new PlanError(
                  "SYNC_REQUIRED",
                  "Specification cursor is divergent",
                ),
              );
            const previous = JSON.parse(revisions[0]!.contentJson) as Plan;
            const replacements = new Map(
              request.plan.items.map((item) => [item.id, item]),
            );
            const omitted = previous.items
              .filter(
                (item) =>
                  (item.dependsOnItemIds?.length ?? 0) > 0 &&
                  replacements.has(item.id) &&
                  replacements.get(item.id)!.dependsOnItemIds === undefined,
              )
              .map((item) => item.id);
            if (omitted.length > 0)
              return yield* Effect.fail(
                new PlanError(
                  "REQUEST_INVALID",
                  "Retrieve the current plan and explicitly retain dependsOnItemIds or clear it with []",
                  { itemIds: omitted, field: "dependsOnItemIds" },
                ),
              );
          }

          for (const decision of request.plan.decisions) {
            if (decision.state !== "human-needed") continue;
            const linked = yield* tx
              .select()
              .from(planningEntries)
              .where(
                and(
                  eq(planningEntries.ownerId, ownerId),
                  eq(planningEntries.planId, request.plan.planId),
                  eq(planningEntries.id, decision.questionId!),
                ),
              )
              .limit(1);
            if (
              !linked[0] ||
              JSON.parse(linked[0].contentJson).kind !== "question"
            )
              return yield* Effect.fail(
                new PlanError(
                  "REFERENCE_MISSING",
                  "Decision question is unavailable",
                  { decisionId: decision.id },
                ),
              );
          }
          const version = (existing?.currentVersion ?? 0) + 1;
          if (existing === undefined) {
            yield* tx.insert(plans).values({
              ownerId,
              createdAt,
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
                ...(existing.repositoryVerified
                  ? {}
                  : {
                      repositoryOwner: request.plan.repository.owner,
                      repositoryName: request.plan.repository.name,
                    }),
                currentVersion: version,
                retentionGeneration: sql`${plans.retentionGeneration} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
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
                and(
                  eq(workItems.ownerId, ownerId),
                  eq(workItems.planId, request.plan.planId),
                ),
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
                and(
                  eq(decisions.ownerId, ownerId),
                  eq(decisions.planId, request.plan.planId),
                ),
              );
            yield* tx
              .delete(assets)
              .where(
                and(
                  eq(assets.ownerId, ownerId),
                  eq(assets.planId, request.plan.planId),
                ),
              );
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
            if (criteria.length > 0)
              yield* tx.insert(acceptanceCriteria).values(criteria);
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

  async operation(ownerId: string, operationId: string) {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(operations)
          .where(
            and(
              eq(operations.ownerId, ownerId),
              eq(operations.id, operationId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? { status: "unknown" as const, operationId }
          : {
              status: "recorded" as const,
              operationId,
              requestDigest: row.requestDigest,
              result: JSON.parse(row.responseJson) as Record<string, unknown>,
            };
      }),
    );
  }

  async revision(
    ownerId: string,
    planId: string,
    version: number,
  ): Promise<Plan | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(planRevisions)
          .where(
            and(
              eq(planRevisions.ownerId, ownerId),
              eq(planRevisions.planId, planId),
              eq(planRevisions.version, version),
            ),
          )
          .limit(1);
        return rows[0] === undefined
          ? undefined
          : (JSON.parse(rows[0].contentJson) as Plan);
      }),
    );
  }

  async putAsset(
    ownerId: string,
    asset: PreparedAsset,
    limits: AssetLimits,
  ): Promise<Plan["assets"][number]> {
    return this.assetStore.put(ownerId, asset, limits);
  }

  async assertPlanAssets(ownerId: string, plan: Plan): Promise<void> {
    await this.assetStore.assertPlanAssets(ownerId, plan);
  }

  async getAsset(
    ownerId: string,
    planId: string,
    assetId: string,
    assetDigest: string,
  ): Promise<StoredAsset | undefined> {
    return this.assetStore.get(ownerId, planId, assetId, assetDigest);
  }

  async get(ownerId: string, planId: string): Promise<StoredPlan | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            retention: {
              createdAt: plans.createdAt,
              everAttached: plans.everAttached,
              retentionStatus: plans.retentionStatus,
              retentionReason: plans.retentionReason,
              retentionCheckedAt: plans.retentionCheckedAt,
              retentionNextCheckAt: plans.retentionNextCheckAt,
              inactiveSince: plans.inactiveSince,
              expiresAt: plans.expiresAt,
            },
            version: plans.currentVersion,
            contentJson: planRevisions.contentJson,
            repositoryVerified: plans.repositoryVerified,
            repositoryOwner: plans.repositoryOwner,
            repositoryName: plans.repositoryName,
            repositoryId: plans.repositoryId,
            repositoryVisibility: plans.repositoryVisibility,
            publishedAt: plans.publishedAt,
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
        return {
          plan: {
            ...(JSON.parse(current.contentJson) as Plan),
            repository: {
              provider: "github",
              owner: current.repositoryOwner,
              name: current.repositoryName,
            },
          },
          version: current.version,
          retention: retentionStatus(current.retention),
          access: {
            repositoryVerified: current.repositoryVerified,
            ...(current.repositoryId === null
              ? {}
              : { repositoryId: current.repositoryId }),
            ...(current.repositoryVisibility === null
              ? {}
              : { repositoryVisibility: current.repositoryVisibility }),
            published:
              current.publishedAt !== null &&
              current.repositoryVisibility === "public",
            ...(current.publishedAt === null
              ? {}
              : { publishedAt: current.publishedAt }),
          },
        };
      }),
    );
  }

  async list(ownerId: string): Promise<ReadonlyArray<ListedPlan>> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(plans)
          .where(eq(plans.ownerId, ownerId))
          .orderBy(plans.id);
        return rows.map((row) => ({
          planId: row.id,
          retention: retentionStatus(row),
          epicGoal: row.epicGoal,
          repository: {
            provider: row.repositoryProvider,
            owner: row.repositoryOwner,
            name: row.repositoryName,
          },
          version: row.currentVersion,
          updatedAt: row.updatedAt,
          access: {
            repositoryVerified: row.repositoryVerified,
            ...(row.repositoryVisibility === null
              ? {}
              : { repositoryVisibility: row.repositoryVisibility }),
            published:
              row.publishedAt !== null && row.repositoryVisibility === "public",
          },
        }));
      }),
    );
  }

  async repository(
    ownerId: string,
    planId: string,
  ): Promise<RepositoryRecord | undefined> {
    return this.githubStore.repository(ownerId, planId);
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
    await this.githubStore.verifyRepository(ownerId, planId, repository);
  }

  async publish(ownerId: string, planId: string): Promise<string> {
    return this.githubStore.publish(ownerId, planId);
  }

  async linkGitHubWork(
    ownerId: string,
    planId: string,
    link: GitHubWorkLinkInput,
  ): Promise<void> {
    await this.githubStore.link(ownerId, planId, link);
  }

  async getPublic(
    ownerId: string,
    planId: string,
  ): Promise<StoredPlan | undefined> {
    const stored = await this.get(ownerId, planId);
    return stored?.access.published === true &&
      stored.access.repositoryVisibility === "public"
      ? stored
      : undefined;
  }

  async listGitHubWork(ownerId: string, planId: string) {
    return this.githubStore.list(ownerId, planId);
  }
}
