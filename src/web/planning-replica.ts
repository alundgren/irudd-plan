import type { PlanningConversation } from "../contract/planning.js";
import type { SyncCursor } from "../contract/sync.js";
import type { PlanningPage } from "../domain/conversation-sync.js";

export interface PlanningReplica extends PlanningConversation {
  readonly cursor: SyncCursor;
}

export async function applyPlanningPage(
  planId: string,
  previous: PlanningReplica | undefined,
  page: PlanningPage,
): Promise<PlanningReplica> {
  if (page.planId !== planId || page.status === "reset_required")
    throw new PlanningSyncError("Conversation needs resynchronization");
  if (previous && same(previous.cursor, page.cursor)) return previous;
  if (
    previous
      ? !same(previous.cursor, page.baseCursor)
      : page.baseCursor.revision !== 0
  )
    throw new PlanningSyncError("Conversation page is out of order");
  let cursor = page.baseCursor;
  const ids = new Set(previous?.entries.map((entry) => entry.id));
  for (const entry of page.entries) {
    if (entry.revision !== cursor.revision + 1 || ids.has(entry.id))
      throw new PlanningSyncError(
        "Conversation page has missing or repeated entries",
      );
    ids.add(entry.id);
    cursor = {
      revision: entry.revision,
      digest: await browserDigest({ previousDigest: cursor.digest, entry }),
    };
  }
  if (!same(cursor, page.cursor))
    throw new PlanningSyncError("Conversation page digest does not match");
  return {
    planId,
    cursor,
    revision: cursor.revision,
    entries: [...(previous?.entries ?? []), ...page.entries],
  };
}

function same(left: SyncCursor, right: SyncCursor) {
  return left.revision === right.revision && left.digest === right.digest;
}

async function browserDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return (
    "sha256:" +
    [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export class PlanningSyncError extends Error {}
