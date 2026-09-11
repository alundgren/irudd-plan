import { useEffect, useRef } from "react";
import type { StoredPlanningEntry } from "../contract/planning.js";
import type { PlanningController } from "./guided-planning.js";
import {
  questionAttention,
  questionAttachments,
} from "./planning-attention.js";
import { ExampleWorkspace } from "./planning-examples.js";
import { PlanningInlineStatus } from "./planning-inline-status.js";
import { PlanningSaveAction } from "./planning-save-action.js";
import { PlanningSource } from "./planning-source.js";
import { RichText } from "./rich-text.js";
import { Button } from "./ui/button.js";

export function GuidedQuestion({
  question,
  controller,
  planId,
  onDefer,
  examples,
  onExamplesChange,
}: {
  readonly question: StoredPlanningEntry;
  readonly controller: PlanningController;
  readonly planId: string;
  readonly onDefer: () => void;
  readonly examples: boolean;
  readonly onExamplesChange: (open: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [question.id]);
  const { conversation, drafts, save, connected, delivery, setAnswer, submit } =
    controller;
  const entries = conversation?.entries ?? [];
  const state = questionAttention(question.id, entries);
  const replies = entries.filter((entry) => entry.replyTo === question.id);
  const draft = drafts[question.id] ?? "";
  const unresolved = save?.target === question.id && save.phase !== "saved";
  const editable = state === "open" || Boolean(draft) || unresolved;
  const attachments = questionAttachments(question, entries);
  const latestAnswer = replies.findLast(
    (entry) => entry.kind === "answer" && entry.author === "human",
  );
  const resolution = replies.findLast((entry) => entry.kind === "resolved");
  useEffect(() => {
    if (
      drafts[question.id] === undefined &&
      replies.at(-1)?.kind === "reopened" &&
      latestAnswer
    ) {
      setAnswer(question.id, latestAnswer.body);
    }
  }, [drafts, question.id, replies, latestAnswer, setAnswer]);
  return (
    <article className="guided-question">
      <p className="guided-label">
        {question.section} ·{" "}
        {state === "done"
          ? "Done"
          : state === "waiting"
            ? "Answer saved"
            : "Your attention"}
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {question.body}
      </h1>
      {question.source ? (
        <PlanningSource planId={planId} source={question.source} />
      ) : null}
      {attachments.length ? (
        <Button variant="outline" onClick={() => onExamplesChange(true)}>
          Compare examples
        </Button>
      ) : null}
      {state === "waiting" ? (
        <PlanningInlineStatus connected={connected} delivery={delivery} />
      ) : null}
      {!editable && latestAnswer ? (
        <div className="guided-saved">
          <p className="guided-label">Your saved answer</p>
          <RichText text={latestAnswer.body} />
        </div>
      ) : null}
      {state === "done" && resolution ? (
        <div className="guided-saved">
          <p className="guided-label">Planner resolution</p>
          <RichText text={resolution.body} />
        </div>
      ) : null}
      {replies.length ? (
        <details className="guided-discussion">
          <summary>Earlier discussion · {replies.length}</summary>
          {replies.map((reply) => (
            <section key={reply.id}>
              <p className="guided-label">
                {reply.author === "human" ? "You" : "Planner"}
              </p>
              <RichText text={reply.body} />
              {reply.source ? (
                <PlanningSource planId={planId} source={reply.source} />
              ) : null}
            </section>
          ))}
        </details>
      ) : null}
      {editable ? (
        <fieldset className="guided-answer">
          <legend>Your answer</legend>
          {question.choices?.map((choice) => (
            <Button
              variant="outline"
              key={choice}
              aria-pressed={draft === choice}
              onClick={() => setAnswer(question.id, choice)}
            >
              {choice}
            </Button>
          ))}
          <textarea
            aria-label={`Answer: ${question.body}`}
            placeholder="Choose a suggestion or write your own answer"
            value={draft}
            maxLength={40000}
            onChange={(event) => setAnswer(question.id, event.target.value)}
          />
          <PlanningSaveAction
            target={question.id}
            label="Save answer"
            context={question.body}
            draft={draft}
            connected={connected}
            save={save}
            onSubmit={() => void submit(question.id)}
          />
          <Button variant="ghost" onClick={onDefer}>
            Leave open and continue
          </Button>
        </fieldset>
      ) : (
        <Button
          variant="outline"
          disabled={
            !connected ||
            save?.phase === "sending" ||
            save?.phase === "uncertain"
          }
          onClick={() => void submit(question.id, true)}
        >
          Reopen for revision
        </Button>
      )}
      {examples ? (
        <ExampleWorkspace
          question={question}
          entries={entries}
          planId={planId}
          onClose={() => onExamplesChange(false)}
        />
      ) : null}
    </article>
  );
}
