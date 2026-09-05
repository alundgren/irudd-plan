import type {
  AssetDescriptor,
  Decision,
  Plan,
  SharedContext,
  WorkItem,
} from "../contract/plan.js";

export interface RequiredContent {
  readonly contexts: ReadonlyArray<SharedContext>;
  readonly decisions: ReadonlyArray<Decision>;
  readonly assets: ReadonlyArray<AssetDescriptor>;
}

export function collectRequiredContent(
  plan: Plan,
  item: WorkItem,
): RequiredContent {
  const contextsById = new Map(
    plan.contexts.map((context) => [context.id, context]),
  );
  const decisionsById = new Map(
    plan.decisions.map((decision) => [decision.id, decision]),
  );
  const assetsById = new Map(plan.assets.map((asset) => [asset.id, asset]));
  const contextIds = new Set<string>();
  const assetIds = new Set(item.requiredAssetIds);

  const addContext = (id: string): void => {
    if (contextIds.has(id)) return;
    const context = contextsById.get(id);
    if (context === undefined) return;
    contextIds.add(id);
    for (const childId of context.requiredContextIds) addContext(childId);
    for (const assetId of context.assetIds) assetIds.add(assetId);
  };
  for (const id of item.requiredContextIds) addContext(id);

  const decisions = item.requiredDecisionIds.flatMap((id) => {
    const decision = decisionsById.get(id);
    if (decision === undefined) return [];
    for (const contextId of decision.requiredContextIds) addContext(contextId);
    for (const assetId of decision.assetIds) assetIds.add(assetId);
    return [decision];
  });

  return {
    contexts: [...contextIds].sort().flatMap((id) => {
      const context = contextsById.get(id);
      return context === undefined ? [] : [context];
    }),
    decisions: [...decisions].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    assets: [...assetIds].sort().flatMap((id) => {
      const asset = assetsById.get(id);
      return asset === undefined ? [] : [asset];
    }),
  };
}
