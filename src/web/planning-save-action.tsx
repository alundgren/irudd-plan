import { useId } from "react";
import { Button } from "./ui/button.js";
import type { PlanningSaveState } from "./use-planning-conversation.js";

export function PlanningSaveAction({
  target,
  label,
  context,
  draft,
  connected,
  save,
  onSubmit,
}: {
  readonly target: string | null;
  readonly label: string;
  readonly context: string;
  readonly draft: string;
  readonly connected: boolean;
  readonly save: PlanningSaveState | undefined;
  readonly onSubmit: () => void;
}) {
  const descriptionId = useId();
  const own = save?.target === target;
  const sending = save?.phase === "sending";
  const uncertain = save?.phase === "uncertain";
  const waiting = !own && (sending || uncertain);
  const retry = own && uncertain;
  const action = own && sending ? "Saving..." : retry ? "Retry saving" : label;
  const explanation = waiting
    ? uncertain
      ? "Resolve the other save before saving here. You can keep writing."
      : "Another save is in progress. You can keep writing."
    : !connected && !retry
      ? "Reconnect to the server before saving. You can keep writing."
      : undefined;
  return (
    <div className="planning-save-action">
      <Button
        variant="outline"
        disabled={
          sending || waiting || (!retry && (!draft.trim() || !connected))
        }
        aria-label={`${action}: ${context}`}
        aria-describedby={descriptionId}
        onClick={onSubmit}
      >
        {action}
      </Button>
      <div id={descriptionId}>
        {own && save.recovered ? (
          <p>
            This save belongs to a question that is no longer shown. Retry
            checks that original answer, not this note.
          </p>
        ) : null}
        {explanation ? <p role="status">{explanation}</p> : null}
        {own && save.phase === "saved" ? (
          <p role="status">
            {save.recovered
              ? "The original answer was saved to this plan."
              : "Saved to this plan."}
          </p>
        ) : null}
        {own && save.error ? <p role="alert">{save.error}</p> : null}
      </div>
    </div>
  );
}
