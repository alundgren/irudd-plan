import type { Decision } from "../contract/plan.js";
import { usePlanningSession } from "./planning-session.js";
import { RichText } from "./rich-text.js";
import { Button } from "./ui/button.js";

function questionStatus(
  decision: Decision,
  session: ReturnType<typeof usePlanningSession>,
) {
  if (!session) return "public";
  const entries = session.conversation?.entries ?? [];
  if (
    entries.some(
      (entry) =>
        entry.replyTo === decision.questionId &&
        entry.kind === "answer" &&
        entry.author === "human",
    )
  )
    return "answered";
  if (!session.connected) return "reconnecting";
  return entries.some(
    (entry) => entry.id === decision.questionId && entry.kind === "question",
  )
    ? "unanswered"
    : "unavailable";
}

export function DecisionWaiting({
  decisions,
}: {
  readonly decisions: readonly Decision[];
}) {
  const session = usePlanningSession();
  const human = decisions.filter(
    (decision) => decision.state === "human-needed",
  );
  if (human.length)
    return (
      <p role="status">
        {!session
          ? "Waiting for a human decision"
          : human.every(
                (decision) => questionStatus(decision, session) === "answered",
              )
            ? "Answer saved; waiting for the plan to update"
            : "Waiting for your decision"}
      </p>
    );
  if (decisions.some((decision) => decision.state === "implementer-decides"))
    return (
      <p>
        The implementer may start and must record the remaining outcomes before
        finishing.
      </p>
    );
  return null;
}

export function DecisionList({
  decisions,
}: {
  readonly decisions: readonly Decision[];
}) {
  const outstanding = decisions.filter(
    (decision) => decision.state !== "decided",
  );
  const decided = decisions.filter((decision) => decision.state === "decided");
  return (
    <>
      {outstanding.length > 0 && (
        <div>
          <h4>Still to decide</h4>
          {outstanding.map((decision) => (
            <DecisionContent key={decision.id} decision={decision} />
          ))}
        </div>
      )}
      {decided.length > 0 && (
        <div>
          <h4>Decided</h4>
          {decided.map((decision) => (
            <DecisionContent key={decision.id} decision={decision} />
          ))}
        </div>
      )}
    </>
  );
}

function DecisionContent({ decision }: { readonly decision: Decision }) {
  const session = usePlanningSession();
  const status = questionStatus(decision, session);
  return (
    <div className="decision" data-decision-id={decision.id}>
      <h5>{decision.title}</h5>
      {decision.state !== "decided" && (
        <p>
          {decision.state === "human-needed"
            ? "Human decision needed"
            : "Implementer decides"}
        </p>
      )}
      <RichText
        text={decision.state === "decided" ? decision.body : decision.question!}
      />
      {decision.state !== "decided" && decision.body !== decision.question && (
        <RichText text={decision.body} />
      )}
      {decision.constraints && (
        <div>
          <h5>Constraints</h5>
          <RichText text={decision.constraints} />
        </div>
      )}
      <p className="reason">Why: {decision.reason}</p>
      {decision.state === "human-needed" && session && (
        <>
          <p>
            {status === "answered"
              ? "Answer saved; waiting for the plan to update"
              : status === "unavailable"
                ? "Planning question is unavailable."
                : status === "reconnecting"
                  ? "Planning is reconnecting. Saved answers will appear when it reconnects."
                  : "Waiting for your decision"}
          </p>
          {(status === "answered" || status === "unanswered") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => session.openQuestion(decision.questionId!)}
            >
              Answer in planning
            </Button>
          )}
        </>
      )}
    </div>
  );
}
