import type { StoredPlanningEntry } from "../contract/planning.js";

export type Attention = "open" | "waiting" | "done";

export function questionAttention(
  id: string,
  entries: readonly StoredPlanningEntry[],
): Attention {
  let state: Attention = "open";
  for (const entry of entries) {
    if (entry.replyTo !== id) continue;
    if (entry.kind === "resolved") state = "done";
    if (entry.kind === "reopened") state = "open";
    if (entry.kind === "answer" && entry.author === "human") state = "waiting";
    // Follow-up questions have their own stable identity and editor.
    // Notes and delivery acknowledgements never change attention.
  }
  return state;
}

export function questionAttachments(
  question: StoredPlanningEntry,
  entries: readonly StoredPlanningEntry[],
) {
  return [
    question,
    ...entries.filter((entry) => entry.replyTo === question.id),
  ].flatMap((entry) =>
    (entry.assets ?? []).map((asset) => ({
      key: JSON.stringify([entry.id, asset.id]),
      asset,
    })),
  );
}
