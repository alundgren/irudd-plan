import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, eq, sql } from "drizzle-orm";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import * as Effect from "effect/Effect";

import { PlanError } from "../contract/errors.js";
import type { Plan } from "../contract/plan.js";
import {
  assetDescriptor,
  assetResourceUri,
  type AssetLimits,
  type PreparedAsset,
} from "../domain/assets.js";
import { assetObjects } from "./schema.js";

export interface StoredAsset {
  readonly descriptor: Plan["assets"][number];
  readonly content: Buffer;
  readonly source?: { readonly mediaType: string; readonly content: Buffer };
}

type Database = Effect.Success<
  ReturnType<typeof SQLiteNodeDrizzle.makeWithDefaults>
>;

export class AssetStore {
  constructor(private readonly filename: string) {}

  async put(
    ownerId: string,
    asset: PreparedAsset,
    limits: AssetLimits,
  ): Promise<Plan["assets"][number]> {
    return this.run((db) =>
      db.transaction((tx) =>
        Effect.gen(function* () {
          const existingRows = yield* tx
            .select()
            .from(assetObjects)
            .where(
              assetIdentity(ownerId, asset.planId, asset.assetId, asset.digest),
            )
            .limit(1);
          const existing = existingRows[0];
          if (existing !== undefined) {
            if (
              existing.mediaType !== asset.mediaType ||
              existing.caption !== asset.caption ||
              existing.role !== asset.role ||
              existing.sourceMediaType !== (asset.source?.mediaType ?? null) ||
              existing.sourceDigest !== (asset.source?.digest ?? null)
            ) {
              return yield* Effect.fail(
                new PlanError(
                  "ASSET_INVALID",
                  "This immutable asset version already exists with different metadata",
                ),
              );
            }
            return assetDescriptor(asset);
          }

          const totals = yield* tx
            .select({
              bytes: sql<number>`coalesce(sum(${assetObjects.byteLength} + coalesce(${assetObjects.sourceByteLength}, 0)), 0)`,
            })
            .from(assetObjects)
            .where(eq(assetObjects.ownerId, ownerId));
          const newBytes =
            asset.content.byteLength + (asset.source?.content.byteLength ?? 0);
          if (
            (totals[0]?.bytes ?? 0) + newBytes >
            limits.maxOwnerStorageBytes
          ) {
            return yield* Effect.fail(
              new PlanError(
                "STORAGE_LIMIT",
                `Upload would exceed the ${limits.maxOwnerStorageBytes} byte owner storage limit`,
              ),
            );
          }
          yield* tx.insert(assetObjects).values({
            ownerId,
            planId: asset.planId,
            id: asset.assetId,
            digest: asset.digest,
            mediaType: asset.mediaType,
            caption: asset.caption,
            role: asset.role,
            content: asset.content,
            byteLength: asset.content.byteLength,
            sourceMediaType: asset.source?.mediaType,
            sourceDigest: asset.source?.digest,
            sourceContent: asset.source?.content,
            sourceByteLength: asset.source?.content.byteLength,
          });
          return assetDescriptor(asset);
        }),
      ),
    );
  }

  async assertPlanAssets(ownerId: string, plan: Plan): Promise<void> {
    for (const descriptor of plan.assets) {
      const stored = await this.get(
        ownerId,
        plan.planId,
        descriptor.id,
        descriptor.digest,
      );
      if (!matchesDescriptor(stored, descriptor)) {
        throw new PlanError(
          "ASSET_UNAVAILABLE",
          `Asset ${descriptor.id} is not an uploaded immutable asset for this owner and plan`,
          { assetId: descriptor.id },
        );
      }
    }
  }

  async get(
    ownerId: string,
    planId: string,
    assetId: string,
    digest: string,
  ): Promise<StoredAsset | undefined> {
    return this.run((db) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(assetObjects)
          .where(assetIdentity(ownerId, planId, assetId, digest))
          .limit(1);
        const row = rows[0];
        if (row === undefined) return undefined;
        return {
          descriptor: {
            id: row.id,
            uri: assetResourceUri(row.planId, row.id, row.digest),
            mediaType: row.mediaType,
            digest: row.digest,
            caption: row.caption,
            role: row.role,
            available: true,
            ...(row.sourceDigest === null || row.sourceMediaType === null
              ? {}
              : {
                  source: {
                    mediaType: row.sourceMediaType,
                    digest: row.sourceDigest,
                  },
                }),
          },
          content: row.content,
          ...(row.sourceContent === null || row.sourceMediaType === null
            ? {}
            : {
                source: {
                  mediaType: row.sourceMediaType,
                  content: row.sourceContent,
                },
              }),
        };
      }),
    );
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
}

function assetIdentity(
  ownerId: string,
  planId: string,
  assetId: string,
  digest: string,
) {
  return and(
    eq(assetObjects.ownerId, ownerId),
    eq(assetObjects.planId, planId),
    eq(assetObjects.id, assetId),
    eq(assetObjects.digest, digest),
  );
}

function matchesDescriptor(
  stored: StoredAsset | undefined,
  descriptor: Plan["assets"][number],
): boolean {
  return (
    stored !== undefined &&
    descriptor.available &&
    stored.descriptor.uri === descriptor.uri &&
    stored.descriptor.mediaType === descriptor.mediaType &&
    stored.descriptor.caption === descriptor.caption &&
    stored.descriptor.role === descriptor.role &&
    stored.descriptor.source?.mediaType === descriptor.source?.mediaType &&
    stored.descriptor.source?.digest === descriptor.source?.digest
  );
}
