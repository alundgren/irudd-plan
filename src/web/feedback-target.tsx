import { MessageSquarePlus } from "lucide-react";
import type { MouseEvent } from "react";

import type { Plan } from "../contract/plan.js";
import {
  type FeedbackItem,
  type FeedbackTarget,
  sectionText,
  selectedExcerpt,
} from "./feedback.js";

export function FeedbackSectionTitle({
  label,
  count,
  onAdd,
}: {
  readonly label: string;
  readonly count: number;
  readonly onAdd: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="section-title-row">
      <h3>{label}</h3>
      <FeedbackButton label={label} count={count} onAdd={onAdd} />
    </div>
  );
}

export function FeedbackButton({
  label,
  count,
  onAdd,
}: {
  readonly label: string;
  readonly count: number;
  readonly onAdd: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="feedback-target-control nodrag nopan"
      aria-label={`Add feedback to ${label}`}
      title={`Add feedback to ${label}`}
      data-feedback-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAdd}
    >
      <MessageSquarePlus aria-hidden="true" size={14} />
      {count > 0 ? <span>{count}</span> : null}
    </button>
  );
}

export function addSectionFeedback(
  event: MouseEvent<HTMLButtonElement>,
  plan: Plan,
  itemId: string | undefined,
  sectionId: string,
  label: string,
  onAddFeedback: (target: FeedbackTarget) => void,
): void {
  const target = {
    ...(itemId === undefined ? {} : { itemId }),
    sectionId,
  };
  const originalText = sectionText(plan, target);
  const container = event.currentTarget.closest<HTMLElement>(
    "[data-feedback-container]",
  );
  if (originalText === undefined || container === null) return;
  const reference = selectedExcerpt(container, originalText);
  onAddFeedback({
    kind: "section",
    ...(itemId === undefined ? {} : { itemId }),
    sectionId,
    label,
    originalText,
    originalExcerpt: reference.excerpt,
    excerptOccurrence: reference.occurrence,
  });
}

export function feedbackCount(
  items: ReadonlyArray<FeedbackItem>,
  itemId: string | undefined,
  sectionId: string,
): number {
  return items.filter(
    (feedback) =>
      feedback.target.kind === "section" &&
      feedback.target.itemId === itemId &&
      feedback.target.sectionId === sectionId,
  ).length;
}

export function assetFeedbackCount(
  items: ReadonlyArray<FeedbackItem>,
  itemId: string,
  assetId: string,
): number {
  return items.filter(
    (feedback) =>
      feedback.target.kind === "asset" &&
      feedback.target.itemId === itemId &&
      feedback.target.assetId === assetId,
  ).length;
}
