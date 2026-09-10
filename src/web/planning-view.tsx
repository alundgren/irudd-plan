import {
  PlanningInlineStatus,
  pendingPlanningAnswer,
} from "./planning-inline-status.js";
import { PlanningCanvas } from "./planning-canvas.js";
import { usePlanningViewport } from "./use-planning-viewport.js";
import { PlanningSource } from "./planning-source.js";
import type { StoredPlanningEntry } from "../contract/planning.js";
import { AssetView } from "./asset-view.js";
import { RichText } from "./rich-text.js";
import { Button } from "./ui/button.js";
import { usePlanningConversation } from "./use-planning-conversation.js";
import type { QueueDelivery } from "../domain/planning-delivery.js";

export function PlanningView({
  planId,
  goal,
}: {
  readonly planId: string;
  readonly goal: string;
}) {
  const viewport = usePlanningViewport();
  const {
    conversation,
    delivery,
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
    <section
      ref={viewport.ref}
      style={{ maxHeight: viewport.height }}
      className="planning-view"
      aria-label="Planning conversation"
    >
      <PlanningCanvas sections={sections}>
        <header className="planning-intro" data-planning-panel>
          <h1>{goal}</h1>
          <p>
            Explore the examples, compare alternatives, and answer on the
            canvas.
          </p>
          <p role="status">
            {connected
              ? "Server connected · receiving conversation updates"
              : "Server disconnected · retrying connection"}
          </p>
          {delivery ? (
            <p role="status">
              {deliveryMessage(
                delivery,
                conversation?.entries
                  .filter((entry) => entry.author === "human")
                  .at(-1)?.revision ?? 0,
              )}
            </p>
          ) : null}
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
            <section
              className="planning-section"
              key={section}
              data-planning-section={section}
            >
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
                    connected={connected}
                    delivery={delivery}
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
        <div className="planning-compose" data-planning-panel>
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
          <p>
            Discussion stays in this private planning record. Implementation
            agents receive the agreed specification separately.
          </p>
        </div>
      </PlanningCanvas>
      <PlanningActions
        sending={sending}
        uncertain={uncertain}
        saved={saved}
        error={error}
        disabled={
          sending ||
          (!hasDraft && !uncertain) ||
          !conversation ||
          (!connected && !uncertain)
        }
        onSubmit={() => void submit()}
      />
    </section>
  );
}

function deliveryMessage(delivery: QueueDelivery, humanRevision: number) {
  if (delivery.state === "uncertain")
    return "Delivery needs review. Check the linked session before sending again.";
  if (!delivery.connected)
    return "Queue companion disconnected · saved answers will wait for reconnection.";
  if (humanRevision > delivery.queuedThrough && delivery.state === "queued")
    return "New answers saved · waiting to queue them for the agent.";
  if (delivery.state === "queued")
    return "Answers queued for the agent. Running status is unknown.";
  return "Queue companion connected · new saved answers will be sent to the linked session.";
}

function PlanningThread({
  connected,
  delivery,
  entry,
  entries,
  planId,
  draft,
  disabled,
  onChange,
}: {
  readonly entry: StoredPlanningEntry;
  readonly entries: readonly StoredPlanningEntry[];
  readonly connected: boolean;
  readonly delivery: QueueDelivery | undefined;
  readonly planId: string;
  readonly draft: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  const pendingAnswer = pendingPlanningAnswer(entry.id, entries);
  const replies = entries.filter(
    (candidate) =>
      candidate.replyTo === entry.id && candidate.kind !== "question",
  );
  const resolved =
    replies
      .filter((reply) => reply.kind === "resolved" || reply.kind === "answer")
      .at(-1)?.kind === "resolved";
  const attachments = [entry, ...replies].flatMap((message) =>
    (message.assets ?? []).map((asset) => ({
      asset,
      key: JSON.stringify([message.id, asset.id, asset.digest]),
    })),
  );
  return (
    <div className="planning-comparison">
      <article
        className="planning-thread"
        data-planning-panel
        data-planning-document={entry.id}
      >
        <Button variant="outline" size="sm" data-read-panel>
          {entry.kind === "question" ? "Read question" : "Read note"}
        </Button>
        <PlanningMessage entry={entry} planId={planId} />
        {replies.map((reply) => (
          <PlanningMessage
            key={reply.id}
            entry={reply}
            planId={planId}
            showResolution={!pendingAnswer}
          />
        ))}
        {pendingAnswer ? (
          <PlanningInlineStatus connected={connected} delivery={delivery} />
        ) : null}
        {attachments.length ? (
          <nav
            className="planning-example-links"
            aria-label="Question examples"
          >
            {attachments.length > 1 ? (
              <Button variant="outline" size="sm" data-compare-examples>
                Compare examples
              </Button>
            ) : null}
            {attachments.map(({ asset, key }) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                data-read-target={key}
              >
                {asset.caption}
              </Button>
            ))}
          </nav>
        ) : null}
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
      {attachments.map(({ asset, key }) => (
        <article
          className="planning-artifact"
          data-planning-panel
          data-planning-document={key}
          key={key}
        >
          <Button variant="outline" size="sm" data-read-panel>
            Read {asset.caption}
          </Button>
          <Button variant="outline" size="sm" data-read-target={entry.id}>
            Back to question
          </Button>
          <AssetView planId={planId} asset={asset} feedbackCount={0} />
        </article>
      ))}
    </div>
  );
}

function PlanningMessage({
  entry,
  planId,
  showResolution = true,
}: {
  readonly entry: StoredPlanningEntry;
  readonly planId: string;
  readonly showResolution?: boolean;
}) {
  return (
    <div className={`planning-message planning-${entry.author}`}>
      <p className="planning-byline">
        {entry.author === "human" ? "You" : "Agent"}
        {entry.kind === "resolved" && showResolution ? " · Resolved" : ""}
      </p>
      <RichText text={entry.body} />
      {entry.source ? (
        <PlanningSource
          key={entry.source.entryId}
          planId={planId}
          source={entry.source}
        />
      ) : null}
    </div>
  );
}

function PlanningActions({
  sending,
  uncertain,
  saved,
  error,
  disabled,
  onSubmit,
}: {
  readonly sending: boolean;
  readonly uncertain: boolean;
  readonly saved: boolean;
  readonly error: string | undefined;
  readonly disabled: boolean;
  readonly onSubmit: () => void;
}) {
  return (
    <footer className="planning-actions" aria-label="Save planning answers">
      <Button disabled={disabled} onClick={onSubmit}>
        {sending
          ? "Saving..."
          : uncertain
            ? "Retry saving answers"
            : "Save answers and notes"}
      </Button>
      {saved ? <p role="status">Saved to this plan.</p> : null}
      {error ? <p role="alert">{error} Your draft is still here.</p> : null}
      <p>Saving does not restart a stopped agent session.</p>
    </footer>
  );
}
