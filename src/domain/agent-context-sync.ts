import type {
  AgentContext,
  StoredAgentContextEntry,
} from "../contract/agent-context.js";
import type { SyncCursor } from "../contract/sync.js";
import { digest } from "./validate-plan.js";
import { initialCursor, sameCursor } from "./sync-cursor.js";

export interface AgentContextPage {
  readonly planId: string;
  readonly status: "delta" | "unchanged" | "reset_required";
  readonly baseCursor: SyncCursor;
  readonly cursor: SyncCursor;
  readonly headCursor: SyncCursor;
  readonly revision: number;
  readonly hasMore: boolean;
  readonly entries: readonly StoredAgentContextEntry[];
}

export function agentContextCursors(
  ownerId: string,
  context: AgentContext,
): SyncCursor[] {
  const cursors = [initialCursor(ownerId, context.planId, "agent-context")];
  for (const entry of context.entries) {
    cursors.push({
      revision: entry.revision,
      digest: digest({ previousDigest: cursors.at(-1)!.digest, entry }),
    });
  }
  return cursors;
}

export function agentContextPage(
  ownerId: string,
  context: AgentContext,
  cursor?: SyncCursor,
  limit = 25,
): AgentContextPage {
  const cursors = agentContextCursors(ownerId, context);
  const baseCursor = cursor ?? cursors[0]!;
  const known = cursors[baseCursor.revision];
  const headCursor = cursors.at(-1)!;
  const common = { planId: context.planId, baseCursor, headCursor };
  if (!known || !sameCursor(known, baseCursor))
    return {
      ...common,
      status: "reset_required",
      cursor: baseCursor,
      revision: baseCursor.revision,
      hasMore: false,
      entries: [],
    };
  const entries = context.entries.slice(
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
