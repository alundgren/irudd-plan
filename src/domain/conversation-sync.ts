import type {
  PlanningConversation,
  StoredPlanningEntry,
} from "../contract/planning.js";
import type { SyncCursor } from "../contract/sync.js";
import { digest } from "./validate-plan.js";
import { initialCursor, sameCursor } from "./sync-cursor.js";
import type { QueueDelivery } from "./planning-delivery.js";

export interface PlanningPage {
  readonly delivery?: QueueDelivery;
  readonly planId: string;
  readonly status: "delta" | "unchanged" | "reset_required";
  readonly baseCursor: SyncCursor;
  readonly cursor: SyncCursor;
  readonly headCursor: SyncCursor;
  readonly revision: number;
  readonly hasMore: boolean;
  readonly entries: readonly StoredPlanningEntry[];
}

export function conversationCursors(
  ownerId: string,
  conversation: PlanningConversation,
): SyncCursor[] {
  const cursors = [initialCursor(ownerId, conversation.planId, "conversation")];
  for (const entry of conversation.entries) {
    cursors.push({
      revision: entry.revision,
      digest: digest({ previousDigest: cursors.at(-1)!.digest, entry }),
    });
  }
  return cursors;
}

export function conversationPage(
  ownerId: string,
  conversation: PlanningConversation,
  cursor?: SyncCursor,
  limit = 25,
): PlanningPage {
  const cursors = conversationCursors(ownerId, conversation);
  const baseCursor = cursor ?? cursors[0]!;
  const known = cursors[baseCursor.revision];
  const headCursor = cursors.at(-1)!;
  const common = { planId: conversation.planId, baseCursor, headCursor };
  if (!known || !sameCursor(known, baseCursor))
    return {
      ...common,
      status: "reset_required",
      cursor: baseCursor,
      revision: baseCursor.revision,
      hasMore: false,
      entries: [],
    };
  const entries = conversation.entries.slice(
    baseCursor.revision,
    baseCursor.revision + limit,
  );
  const next = cursors[baseCursor.revision + entries.length]!;
  return {
    ...common,
    status: entries.length ? "delta" : "unchanged",
    cursor: next,
    revision: next.revision,
    hasMore: next.revision < headCursor.revision,
    entries,
  };
}
