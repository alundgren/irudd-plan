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
      tone: "waiting",
    };
  if (delivery.state === "uncertain")
    return {
      title: "Delivery needs checking",
      detail:
        "Your answer is saved. Check the linked session before sending again.",
      tone: "warning",
    };
  if (!delivery.connected)
    return {
      title: "Companion disconnected",
      detail: "Your answer is saved. Agent status is unknown.",
      tone: "warning",
    };
  return {
    title: "Waiting for a reply",
    detail: "Your answer is saved. The companion is connected.",
    tone: "waiting",
  };
}

export function PlanningInlineStatus({
  connected,
  delivery,
}: {
  readonly connected: boolean;
  readonly delivery: QueueDelivery | undefined;
}) {
  const status = planningInlineStatus(connected, delivery);
  return (
    <div
      className={`planning-inline-status planning-inline-${status.tone}`}
      role="status"
      aria-atomic="true"
    >
      <span className="planning-inline-dot" aria-hidden="true" />
      <div>
        <p className="planning-inline-title">
          {status.title}
          {status.tone === "waiting" ? (
            <span className="planning-inline-ellipsis" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          ) : null}
        </p>
        <p className="planning-inline-detail">{status.detail}</p>
      </div>
    </div>
  );
}
