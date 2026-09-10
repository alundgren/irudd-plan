import type { StoredPlanningEntry } from "../contract/planning.js";
import type { QueueDelivery } from "../domain/planning-delivery.js";

export function pendingPlanningAnswer(
  questionId: string,
  entries: readonly StoredPlanningEntry[],
): StoredPlanningEntry | undefined {
  const latest = entries.filter((entry) => entry.replyTo === questionId).at(-1);
  return latest?.author === "human" && latest.kind === "answer"
    ? latest
    : undefined;
}

export function planningInlineStatus(
  answerRevision: number,
  connected: boolean,
  delivery: QueueDelivery | undefined,
) {
  if (!connected)
    return {
      title: "Reconnecting to this plan",
      detail: "Your answer is saved. Live updates are temporarily unavailable.",
      tone: "unknown",
    };
  if (!delivery)
    return {
      title: "Waiting for a reply",
      detail: "Your answer is saved. Agent status is unknown.",
      tone: "unknown",
    };
  const queued = delivery.queuedThrough >= answerRevision;
  if (delivery.state === "uncertain" && !queued)
    return {
      title: "Delivery needs checking",
      detail:
        "Your answer is saved. Check the linked session before sending again.",
      tone: "warning",
    };
  if (!delivery.connected)
    return {
      title: "Companion disconnected",
      detail: queued
        ? "Your answer was queued. The agent may still be working."
        : "Your answer is saved. Delivery will continue when the companion reconnects.",
      tone: "warning",
    };
  if (queued)
    return {
      title: "Queued for the agent",
      detail: "Waiting for a reply. Agent activity is unavailable.",
      tone: "waiting",
    };
  return {
    title: "Waiting to send to the agent",
    detail: "Your answer is saved. The companion is connected.",
    tone: "waiting",
  };
}

export function PlanningInlineStatus({
  answer,
  connected,
  delivery,
}: {
  readonly answer: StoredPlanningEntry;
  readonly connected: boolean;
  readonly delivery: QueueDelivery | undefined;
}) {
  const status = planningInlineStatus(answer.revision, connected, delivery);
  return (
    <div
      className={`planning-inline-status planning-inline-${status.tone}`}
      role="status"
      aria-atomic="true"
    >
      <span className="planning-inline-dot" aria-hidden="true" />
      <div>
        <p className="planning-inline-title">{status.title}</p>
        <p className="planning-inline-detail">{status.detail}</p>
      </div>
    </div>
  );
}
