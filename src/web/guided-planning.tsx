import { useEffect, useRef, useState } from "react";
import type { Plan } from "../contract/plan.js";
import { questionAttention, type Attention } from "./planning-attention.js";
import type { usePlanningConversation } from "./use-planning-conversation.js";
import { GuidedQuestion } from "./guided-question.js";
import { PlanningSaveAction } from "./planning-save-action.js";
import { GuidedPlanContext } from "./guided-plan-context.js";
import { Button } from "./ui/button.js";

export type PlanningController = ReturnType<typeof usePlanningConversation>;

export function GuidedPlanning({
  plan,
  controller,
}: {
  readonly plan: Plan;
  readonly controller: PlanningController;
}) {
  const { conversation, drafts, save } = controller;
  const entries = conversation?.entries ?? [];
  const questions = entries.filter((entry) => entry.kind === "question");
  const handledSave = useRef(false);
  const [selected, setSelected] = useState<string>();
  const [tab, setTab] = useState<Attention>("open");
  const [deferred, setDeferred] = useState<string[]>([]);
  const [list, setList] = useState(false);
  const [comparing, setComparing] = useState(false);
  const groups = (state: Attention) =>
    questions.filter((entry) => questionAttention(entry.id, entries) === state);
  const open = groups("open").toSorted(
    (a, b) => Number(deferred.includes(a.id)) - Number(deferred.includes(b.id)),
  );
  const current = selected
    ? questions.find((entry) => entry.id === selected)
    : (tab === "open" ? open : groups(tab))[0];
  useEffect(() => {
    if (!selected && current) setSelected(current.id);
    if (
      current &&
      tab === "open" &&
      !comparing &&
      questionAttention(current.id, entries) === "done" &&
      !drafts[current.id] &&
      (!save || save.phase === "saved")
    )
      setSelected(open[0]?.id);
  }, [save, selected, drafts, current, entries, tab, comparing, open]);
  useEffect(() => {
    if (save?.phase !== "saved") handledSave.current = false;
    if (save?.phase === "saved" && !handledSave.current) {
      handledSave.current = true;
      if (
        save.target === selected &&
        !drafts[selected ?? ""] &&
        current &&
        questionAttention(current.id, entries) === "waiting"
      ) {
        setSelected(undefined);
        setTab("open");
      }
    }
  }, [save, selected, drafts, current, entries, tab, comparing, open]);
  const choose = (id: string) => {
    setSelected(id);
    setTab(questionAttention(id, entries));
    setList(false);
  };
  const switchTab = (state: Attention) => {
    setTab(state);
    setSelected(undefined);
    setList(true);
  };
  return (
    <div className="guided-planning">
      <nav className="guided-header" aria-label="Planning questions">
        <span>Planning</span>
        <Button
          variant="ghost"
          aria-pressed={tab === "open"}
          onClick={() => switchTab("open")}
        >
          Open questions {open.length}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={tab === "waiting"}
          onClick={() => switchTab("waiting")}
        >
          Waiting {groups("waiting").length}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={tab === "done"}
          onClick={() => switchTab("done")}
        >
          Done {groups("done").length}
        </Button>
      </nav>
      {list ? (
        <nav className="guided-question-list" aria-label={`${tab} questions`}>
          <Button variant="ghost" size="sm" onClick={() => setList(false)}>
            Close list
          </Button>
          {groups(tab).map((entry) => (
            <button
              key={entry.id}
              onClick={() => choose(entry.id)}
              aria-current={current?.id === entry.id ? "true" : undefined}
            >
              <span>{entry.section}</span>
              {entry.body}
            </button>
          ))}
          {!groups(tab).length ? <p>No {tab} questions.</p> : null}
        </nav>
      ) : null}
      <div className="guided-working-area">
        <GuidedPlanContext plan={plan} />
        <main className="guided-focus">
          {!conversation ? (
            <p role="status">Loading conversation...</p>
          ) : selected && !current ? (
            <div role="status">
              <h1>This question is no longer available.</h1>
              <Button onClick={() => setSelected(undefined)}>
                Back to questions
              </Button>
            </div>
          ) : current ? (
            <GuidedQuestion
              key={current.id}
              question={current}
              controller={controller}
              planId={plan.planId}
              examples={comparing}
              onExamplesChange={setComparing}
              onDefer={() => {
                setDeferred((previous) => [
                  ...previous.filter((id) => id !== current.id),
                  current.id,
                ]);
                setSelected(open.find((entry) => entry.id !== current.id)?.id);
              }}
            />
          ) : (
            <div className="guided-empty">
              <p className="guided-label">All caught up</p>
              <h1>
                {tab === "open"
                  ? "Nothing needs your answer."
                  : `No ${tab} questions.`}
              </h1>
              <p>
                Read the current plan or revisit saved answers in Waiting and
                Done.
              </p>
            </div>
          )}
          <details className="guided-note">
            <summary>Add a thought or ask a question</summary>
            <textarea
              aria-label="Add a thought or ask a question"
              value={controller.note}
              maxLength={40000}
              onChange={(event) => controller.setNote(event.target.value)}
            />
            <PlanningSaveAction
              target={null}
              label="Save note"
              context="Add a thought or ask a question"
              draft={controller.note}
              connected={controller.connected}
              save={save}
              onSubmit={() => void controller.submit(null)}
            />
          </details>
          {controller.recoveryMessage ? (
            <p role="alert">{controller.recoveryMessage}</p>
          ) : null}
          {!controller.connected ? (
            <p role="status">Reconnecting. You can keep writing.</p>
          ) : null}
        </main>
        <aside className="guided-next">
          <p className="guided-label">Coming next</p>
          {open
            .filter((entry) => entry.id !== current?.id)
            .slice(0, 3)
            .map((entry) => (
              <button key={entry.id} onClick={() => choose(entry.id)}>
                <span>{entry.section}</span>
                {entry.body}
              </button>
            ))}
          {open.filter((entry) => entry.id !== current?.id).length === 0 ? (
            <p>No more open questions.</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
