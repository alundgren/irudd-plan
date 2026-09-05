import { createHash } from "node:crypto";

import { PlanError } from "../contract/errors.js";
import type {
  AssetDescriptor,
  Decision,
  Plan,
  SharedContext,
  WorkItem,
} from "../contract/plan.js";

function requireText(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new PlanError("REQUEST_INVALID", `${field} cannot be empty`);
  }
}

function uniqueIds<T extends { readonly id: string }>(
  records: ReadonlyArray<T>,
  kind: string,
  seen: Set<string>,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const record of records) {
    requireText(record.id, `${kind} id`);
    if (seen.has(record.id)) {
      throw new PlanError("DUPLICATE_ID", `Duplicate id: ${record.id}`, {
        id: record.id,
        kind,
      });
    }
    seen.add(record.id);
    result.set(record.id, record);
  }
  return result;
}

function requireReference<T>(
  map: ReadonlyMap<string, T>,
  id: string,
  source: string,
): T {
  const value = map.get(id);
  if (value === undefined) {
    throw new PlanError(
      "REFERENCE_MISSING",
      `${source} references missing id: ${id}`,
      {
        id,
        source,
      },
    );
  }
  return value;
}

function visitContexts(
  id: string,
  contexts: ReadonlyMap<string, SharedContext>,
  visiting: Set<string>,
  visited: Set<string>,
): void {
  if (visiting.has(id)) {
    throw new PlanError(
      "REFERENCE_CYCLE",
      `Required context cycle includes: ${id}`,
      { id },
    );
  }
  if (visited.has(id)) return;
  const context = requireReference(contexts, id, `context ${id}`);
  visiting.add(id);
  for (const childId of context.requiredContextIds) {
    visitContexts(childId, contexts, visiting, visited);
  }
  visiting.delete(id);
  visited.add(id);
}

function requireAvailableAsset(
  assets: ReadonlyMap<string, AssetDescriptor>,
  id: string,
  source: string,
): void {
  const asset = requireReference(assets, id, source);
  if (!asset.available) {
    throw new PlanError(
      "ASSET_UNAVAILABLE",
      `${source} requires unavailable asset: ${id}`,
      {
        id,
        source,
      },
    );
  }
}

export interface PlanIndex {
  readonly items: ReadonlyMap<string, WorkItem>;
  readonly contexts: ReadonlyMap<string, SharedContext>;
  readonly decisions: ReadonlyMap<string, Decision>;
  readonly assets: ReadonlyMap<string, AssetDescriptor>;
}

export function validatePlan(plan: Plan): PlanIndex {
  requireText(plan.planId, "planId");
  requireText(plan.epicGoal, "epicGoal");
  requireText(plan.repository.owner, "repository.owner");
  requireText(plan.repository.name, "repository.name");

  const items = uniqueIds(plan.items, "work item", new Set());
  const contexts = uniqueIds(plan.contexts, "shared context", new Set());
  const decisions = uniqueIds(plan.decisions, "decision", new Set());
  const assets = uniqueIds(plan.assets, "asset", new Set());

  for (const item of plan.items) {
    requireText(item.title, `item ${item.id} title`);
    requireText(item.goal, `item ${item.id} goal`);
    requireText(item.shortGoal, `item ${item.id} shortGoal`);
    requireText(
      item.completionExpectation,
      `item ${item.id} completionExpectation`,
    );
    uniqueIds(
      item.acceptanceCriteria,
      `acceptance criterion for ${item.id}`,
      new Set(),
    );
    for (const id of item.requiredContextIds)
      requireReference(contexts, id, `item ${item.id}`);
    for (const id of item.requiredDecisionIds)
      requireReference(decisions, id, `item ${item.id}`);
    for (const id of item.requiredAssetIds)
      requireAvailableAsset(assets, id, `item ${item.id}`);
    for (const id of item.relatedItemIds)
      requireReference(items, id, `item ${item.id}`);
  }

  for (const context of plan.contexts) {
    requireText(context.reason, `context ${context.id} reason`);
    for (const id of context.requiredContextIds)
      requireReference(contexts, id, `context ${context.id}`);
    for (const id of context.assetIds)
      requireAvailableAsset(assets, id, `context ${context.id}`);
  }

  for (const decision of plan.decisions) {
    requireText(decision.reason, `decision ${decision.id} reason`);
    for (const id of decision.requiredContextIds)
      requireReference(contexts, id, `decision ${decision.id}`);
    for (const id of decision.assetIds)
      requireAvailableAsset(assets, id, `decision ${decision.id}`);
  }

  const visited = new Set<string>();
  for (const id of contexts.keys())
    visitContexts(id, contexts, new Set(), visited);
  return { items, contexts, decisions, assets };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export interface RequiredPacketContent {
  readonly item: WorkItem;
  readonly contexts: ReadonlyArray<SharedContext>;
  readonly decisions: ReadonlyArray<Decision>;
  readonly assets: ReadonlyArray<AssetDescriptor>;
}

export function collectRequiredPacket(
  plan: Plan,
  itemId: string,
): RequiredPacketContent {
  const index = validatePlan(plan);
  const item = index.items.get(itemId);
  if (item === undefined) {
    throw new PlanError("ITEM_NOT_FOUND", `Work item not found: ${itemId}`, {
      itemId,
    });
  }

  const contextIds = new Set<string>();
  const assetIds = new Set(item.requiredAssetIds);
  const addContext = (id: string): void => {
    if (contextIds.has(id)) return;
    const context = requireReference(index.contexts, id, `item ${item.id}`);
    contextIds.add(id);
    for (const childId of context.requiredContextIds) addContext(childId);
    for (const assetId of context.assetIds) assetIds.add(assetId);
  };
  for (const id of item.requiredContextIds) addContext(id);

  const selectedDecisions = item.requiredDecisionIds.map((id) =>
    requireReference(index.decisions, id, `item ${item.id}`),
  );
  for (const decision of selectedDecisions) {
    for (const id of decision.requiredContextIds) addContext(id);
    for (const id of decision.assetIds) assetIds.add(id);
  }

  return {
    item,
    contexts: [...contextIds]
      .sort()
      .map((id) => requireReference(index.contexts, id, item.id)),
    decisions: [...selectedDecisions].sort((a, b) => a.id.localeCompare(b.id)),
    assets: [...assetIds]
      .sort()
      .map((id) => requireReference(index.assets, id, item.id)),
  };
}
