import { sql } from "drizzle-orm";
import {
  createInsertSchema,
  createSelectSchema,
} from "drizzle-orm/effect-schema";
import {
  foreignKey,
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const owners = sqliteTable(
  "owners",
  {
    id: text("id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.id] })],
);

export const ownerCredentials = sqliteTable(
  "owner_credentials",
  {
    issuer: text("issuer").notNull(),
    claim: text("claim").notNull(),
    value: text("value").notNull(),
    kind: text("kind", { enum: ["service", "browser"] }).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.issuer, table.claim, table.value] }),
    index("owner_credentials_owner_idx").on(table.ownerId),
  ],
);

export const plans = sqliteTable(
  "plans",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    repositoryProvider: text("repository_provider").notNull(),
    repositoryOwner: text("repository_owner").notNull(),
    repositoryName: text("repository_name").notNull(),
    repositoryId: text("repository_id"),
    repositoryVisibility: text("repository_visibility", {
      enum: ["public", "private"],
    }),
    repositoryVerified: integer("repository_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    repositoryVerifiedAt: text("repository_verified_at"),
    publishedAt: text("published_at"),
    retentionGeneration: integer("retention_generation").notNull().default(0),
    retentionStatus: text("retention_status", {
      enum: ["scheduled", "retained", "unknown"],
    })
      .notNull()
      .default("scheduled"),
    retentionReason: text("retention_reason"),
    retentionCheckedAt: text("retention_checked_at"),
    retentionNextCheckAt: text("retention_next_check_at")
      .notNull()
      .default("1970-01-01T00:00:00.000Z"),
    inactiveSince: text("inactive_since"),
    expiresAt: text("expires_at"),
    everAttached: integer("ever_attached", { mode: "boolean" })
      .notNull()
      .default(false),
    contractVersion: text("contract_version").notNull().default("v1"),
    epicGoal: text("epic_goal").notNull(),
    currentVersion: integer("current_version").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index("plans_retention_due_idx").on(table.retentionNextCheckAt),
    index("plans_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

export const deletedPlans = sqliteTable(
  "deleted_plans",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(),
    deletedAt: text("deleted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.planId] })],
);

export const githubWorkLinks = sqliteTable(
  "github_work_links",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    itemId: text("item_id"),
    repositoryId: text("repository_id").notNull(),
    workNodeId: text("work_node_id").notNull(),
    workDatabaseId: text("work_database_id").notNull(),
    type: text("type", { enum: ["issue", "pull_request"] }).notNull(),
    number: integer("number").notNull(),
    url: text("url").notNull(),
    state: text("state").notNull(),
    closedAt: text("closed_at"),
    lastObservedAt: text("last_observed_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.planId, table.type, table.workNodeId],
    }),
    planReference(table),
    index("github_work_links_plan_idx").on(table.ownerId, table.planId),
  ],
);

const planReference = <
  T extends {
    ownerId: ReturnType<typeof text>;
    planId: ReturnType<typeof text>;
  },
>(
  table: T,
) =>
  foreignKey({
    columns: [table.ownerId, table.planId],
    foreignColumns: [plans.ownerId, plans.id],
  }).onDelete("cascade");

export const planRevisions = sqliteTable(
  "plan_revisions",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    version: integer("version").notNull(),
    operationId: text("operation_id").notNull(),
    planDigest: text("plan_digest").notNull(),
    contentJson: text("content_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.planId, table.version] }),
    uniqueIndex("plan_revisions_operation_idx").on(
      table.ownerId,
      table.operationId,
    ),
    planReference(table),
  ],
);

export const operations = sqliteTable(
  "operations",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    requestDigest: text("request_digest").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.id] })],
);

export const workItems = sqliteTable(
  "work_items",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    shortGoal: text("short_goal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.planId, table.id] }),
    planReference(table),
  ],
);

export const sharedContexts = sqliteTable(
  "shared_contexts",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    source: text("source"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.planId, table.id] }),
    planReference(table),
  ],
);

export const decisions = sqliteTable(
  "decisions",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    source: text("source"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.planId, table.id] }),
    planReference(table),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    id: text("id").notNull(),
    uri: text("uri").notNull(),
    mediaType: text("media_type").notNull(),
    digest: text("digest").notNull(),
    caption: text("caption").notNull(),
    role: text("role").notNull(),
    available: integer("available", { mode: "boolean" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.planId, table.id] }),
    planReference(table),
  ],
);

export const assetObjects = sqliteTable(
  "asset_objects",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(),
    id: text("id").notNull(),
    digest: text("digest").notNull(),
    mediaType: text("media_type").notNull(),
    caption: text("caption").notNull(),
    role: text("role", {
      enum: ["binding-reference", "illustration"],
    }).notNull(),
    content: blob("content", { mode: "buffer" }).notNull(),
    byteLength: integer("byte_length").notNull(),
    sourceMediaType: text("source_media_type"),
    sourceDigest: text("source_digest"),
    sourceContent: blob("source_content", { mode: "buffer" }),
    sourceByteLength: integer("source_byte_length"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.planId, table.id, table.digest],
    }),
    index("asset_objects_owner_storage_idx").on(table.ownerId),
  ],
);

export const acceptanceCriteria = sqliteTable(
  "acceptance_criteria",
  {
    ownerId: text("owner_id").notNull(),
    planId: text("plan_id").notNull(),
    itemId: text("item_id").notNull(),
    id: text("id").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerId, table.planId, table.itemId, table.id],
    }),
    foreignKey({
      columns: [table.ownerId, table.planId, table.itemId],
      foreignColumns: [workItems.ownerId, workItems.planId, workItems.id],
    }).onDelete("cascade"),
  ],
);

export const schema = {
  acceptanceCriteria,
  assetObjects,
  assets,
  decisions,
  deletedPlans,
  githubWorkLinks,
  operations,
  ownerCredentials,
  owners,
  planRevisions,
  plans,
  sharedContexts,
  workItems,
};

export const OwnerRecord = createSelectSchema(owners);
export const PlanRevisionRecord = createInsertSchema(planRevisions);
