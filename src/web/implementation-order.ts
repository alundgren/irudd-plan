import type { WorkItem } from "../contract/plan.js";

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
}

export interface ImplementationOrder {
  readonly levels: ReadonlyArray<ReadonlyArray<WorkItem>>;
  readonly edges: ReadonlyArray<DependencyEdge>;
}

// Browser responses can come from an older server or contain invalid graph data.
export function implementationOrder(
  items: ReadonlyArray<WorkItem>,
): ImplementationOrder {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length)
    throw new Error("Work item IDs are duplicated.");
  const edges: DependencyEdge[] = [];
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const item of items) {
    const ids =
      item.dependsOnItemIds === undefined ? [] : item.dependsOnItemIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
      throw new Error(
        `Dependencies for ${item.title} are unavailable or invalid.`,
      );
    if (new Set(ids).size !== ids.length)
      throw new Error(`Dependencies for ${item.title} are duplicated.`);
    remaining.set(item.id, ids.length);
    for (const id of ids) {
      if (!byId.has(id))
        throw new Error(`A prerequisite for ${item.title} is missing.`);
      edges.push({ from: id, to: item.id });
      const list = dependents.get(id) ?? [];
      list.push(item.id);
      dependents.set(id, list);
    }
  }
  const queue = items
    .filter((item) => remaining.get(item.id) === 0)
    .map((item) => item.id);
  const level = new Map(queue.map((id) => [id, 0]));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const dependent of dependents.get(id) ?? []) {
      level.set(
        dependent,
        Math.max(level.get(dependent) ?? 0, level.get(id)! + 1),
      );
      const count = remaining.get(dependent)! - 1;
      remaining.set(dependent, count);
      if (count === 0) queue.push(dependent);
    }
  }
  if (queue.length !== items.length)
    throw new Error("Item dependencies contain a cycle.");
  const levels: WorkItem[][] = [];
  for (const item of items) (levels[level.get(item.id)!] ??= []).push(item);
  return { levels, edges };
}

export function incidentEdges(order: ImplementationOrder, selected?: string) {
  return order.edges.filter(
    (edge) => edge.from === selected || edge.to === selected,
  );
}
