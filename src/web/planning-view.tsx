import type { StoredPlanningEntry } from "../contract/planning.js";
import { AssetView } from "./asset-view.js";
import { RichText } from "./rich-text.js";
import { Button } from "./ui/button.js";
import { usePlanningConversation } from "./use-planning-conversation.js";

export function PlanningView({
  planId,
  goal,
}: {
  readonly planId: string;
  readonly goal: string;
}) {
  const {
    conversation,
    drafts,
    note,
    error,
    connected,
    sending,
    uncertain,
    saved,
    setAnswer,
    setNote,
    setSaved,
    submit,
  } = usePlanningConversation(planId);
  const sections = [
    ...new Set(conversation?.entries.map((entry) => entry.section) ?? []),
  ];
  const hasDraft =
    Object.values(drafts).some((value) => value.trim()) || !!note.trim();
  return (
    <section className="planning-view" aria-label="Planning conversation">
      <header className="planning-intro">
        <h1>{goal}</h1>
        <p>
          Work through the questions here. Saved answers are available to the
          planning agent and future sessions.
        </p>
        <p role="status">
          {connected
            ? "Connected · checking for new questions"
            : "Disconnected · retrying connection"}
        </p>
      </header>
      {!conversation ? (
        <p>Loading conversation...</p>
      ) : !sections.length ? (
        <p>
          No questions yet. The agent can add the first batch to this canvas.
        </p>
      ) : null}
      <div className="planning-sections">
        {sections.map((section) => (
          <section className="planning-section" key={section}>
            <h2>{section}</h2>
            {conversation?.entries
              .filter(
                (entry) =>
                  entry.section === section &&
                  (entry.replyTo === undefined || entry.kind === "question"),
              )
              .map((entry) => (
                <PlanningThread
                  key={entry.id}
                  entry={entry}
                  entries={conversation.entries}
                  planId={planId}
                  draft={drafts[entry.id] ?? ""}
                  disabled={sending || uncertain}
                  onChange={(value) => {
                    setAnswer(entry.id, value);
                    setSaved(false);
                  }}
                />
              ))}
          </section>
        ))}
      </div>
      <div className="planning-compose">
        <label htmlFor="planning-note">Add a thought or ask a question</label>
        <textarea
          id="planning-note"
          value={note}
          disabled={sending || uncertain}
          maxLength={40000}
          onChange={(event) => {
            setNote(event.target.value);
            setSaved(false);
          }}
        />
        <Button
          disabled={
            sending ||
            (!hasDraft && !uncertain) ||
            !conversation ||
            (!connected && !uncertain)
          }
          onClick={() => void submit()}
        >
          {sending
            ? "Saving..."
            : uncertain
              ? "Retry saving answers"
              : "Save answers and notes"}
        </Button>
        {saved ? (
          <p role="status">Saved. The agent can read your answers.</p>
        ) : null}
        {error ? <p role="alert">{error} Your draft is still here.</p> : null}
        <p>
          Discussion stays in this private planning record. Implementation
          agents receive the agreed specification separately.
        </p>
      </div>
    </section>
  );
}

function PlanningThread({
  entry,
  entries,
  planId,
  draft,
  disabled,
  onChange,
}: {
  readonly entry: StoredPlanningEntry;
  readonly entries: readonly StoredPlanningEntry[];
  readonly planId: string;
  readonly draft: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  const replies = entries.filter(
    (candidate) =>
      candidate.replyTo === entry.id && candidate.kind !== "question",
  );
  const resolved =
    replies
      .filter((reply) => reply.kind === "resolved" || reply.kind === "answer")
      .at(-1)?.kind === "resolved";
  return (
    <article className="planning-thread">
      <PlanningMessage entry={entry} planId={planId} />
      {replies.map((reply) => (
        <PlanningMessage key={reply.id} entry={reply} planId={planId} />
      ))}
      {entry.kind === "question" ? (
        <fieldset disabled={disabled}>
          <legend>
            {resolved ? "Add or revise your answer" : "Your answer"}
          </legend>
          {entry.choices?.map((choice) => (
            <Button
              key={choice}
              variant="outline"
              size="sm"
              aria-pressed={draft === choice}
              onClick={() => onChange(choice)}
            >
              {choice}
            </Button>
          ))}
          <textarea
            aria-label={`Answer: ${entry.body}`}
            value={draft}
            maxLength={40000}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Choose a suggestion or write your own answer"
          />
        </fieldset>
      ) : null}
    </article>
  );
}

function PlanningMessage({
  entry,
  planId,
}: {
  readonly entry: StoredPlanningEntry;
  readonly planId: string;
}) {
  return (
    <div className={`planning-message planning-${entry.author}`}>
      <p className="planning-byline">
        {entry.author === "human" ? "You" : "Agent"}
        {entry.kind === "resolved" ? " · Resolved" : ""}
      </p>
      <RichText text={entry.body} />
      {entry.assets?.map((asset) => (
        <AssetView
          key={`${asset.id}:${asset.digest}`}
          planId={planId}
          asset={asset}
          feedbackCount={0}
        />
      ))}
    </div>
  );
}
