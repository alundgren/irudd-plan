import { PlanError } from "../contract/errors.js";
import type { Plan } from "../contract/plan.js";
import type { PatchPlanRequest } from "../contract/planning.js";

export function patchPlan(plan: Plan, request: PatchPlanRequest): Plan {
  return {
    ...plan,
    epicGoal: request.epicGoal ?? plan.epicGoal,
    items: replaceRecords(plan.items, request.items, request.removeItemIds),
    contexts: replaceRecords(
      plan.contexts,
      request.contexts,
      request.removeContextIds,
    ),
    decisions: replaceRecords(
      plan.decisions,
      request.decisions,
      request.removeDecisionIds,
    ),
    assets: replaceRecords(plan.assets, request.assets, request.removeAssetIds),
  };
}

function replaceRecords<T extends { readonly id: string }>(
  current: readonly T[],
  replacements: readonly T[] = [],
  removed: readonly string[] = [],
): T[] {
  const records = new Map(current.map((record) => [record.id, record]));
  if (
    new Set(replacements.map((record) => record.id)).size !==
      replacements.length ||
    new Set(removed).size !== removed.length
  )
    throw new PlanError("DUPLICATE_ID", "Duplicate delta record ID");
  for (const id of removed) {
    if (!records.delete(id))
      throw new PlanError(
        "REFERENCE_MISSING",
        "Cannot remove an absent record",
        { id },
      );
  }
  for (const record of replacements) {
    if (removed.includes(record.id))
      throw new PlanError(
        "REQUEST_INVALID",
        "Cannot replace and remove the same record",
      );
    records.set(record.id, record);
  }
  return [...records.values()];
}
