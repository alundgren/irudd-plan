import type { SyncCursor } from "../contract/sync.js";
import { digest } from "./validate-plan.js";

export function initialCursor(
  ownerId: string,
  planId: string,
  stream: "plan" | "conversation" | "agent-context",
): SyncCursor {
  return { revision: 0, digest: digest({ ownerId, planId, stream }) };
}
export function sameCursor(left: SyncCursor, right: SyncCursor): boolean {
  return left.revision === right.revision && left.digest === right.digest;
}
