import { Check, Clipboard, MapPin, MessageSquareText, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Plan } from "../contract/plan.js";
import {
  buildRevisionPrompt,
  type FeedbackItem,
  targetStatus,
  type TrialAssessment,
} from "./feedback.js";
import { Button } from "./ui/button.js";

interface FeedbackPanelProps {
  readonly plan: Plan;
  readonly version: number;
  readonly items: ReadonlyArray<FeedbackItem>;
  readonly storageError?: string;
  readonly selectedItem?: FeedbackItem;
  readonly onSelect: (item: FeedbackItem) => void;
  readonly pinningCanvas: boolean;
  readonly trialAssessment?: TrialAssessment;
  readonly onClose: () => void;
  readonly onStartCanvasPin: () => void;
  readonly onUpdate: (id: string, requestedChange: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onAssessTrial: (assessment: TrialAssessment) => void;
}

export function FeedbackPanel({
  plan,
  version,
  items,
  storageError,
  selectedItem,
  onSelect,
  pinningCanvas,
  trialAssessment,
  onClose,
  onStartCanvasPin,
  onUpdate,
  onRemove,
  onAssessTrial,
}: FeedbackPanelProps) {
  const hasChangedTarget = items.some(
    (item) => targetStatus(item, plan) !== "current",
  );

  return (
    <aside
      className="feedback-panel nodrag nopan nowheel"
      aria-label="Pending feedback"
    >
      <PanelHeader count={items.length} onClose={onClose} />
      <div className="feedback-list">
        <Button
          variant="outline"
          className={pinningCanvas ? "pinning" : ""}
          onClick={onStartCanvasPin}
        >
          <MapPin aria-hidden="true" size={15} />
          {pinningCanvas ? "Click a blank canvas area" : "Pin a canvas area"}
        </Button>
        <FeedbackList
          items={items}
          plan={plan}
          onUpdate={onUpdate}
          onRemove={onRemove}
          {...(selectedItem === undefined ? {} : { selectedItem })}
          onSelect={onSelect}
        />
        {hasChangedTarget ? (
          <TrialQuestion
            {...(trialAssessment === undefined ? {} : { trialAssessment })}
            onAssess={onAssessTrial}
          />
        ) : null}
      </div>
      <CopyPromptSection
        plan={plan}
        version={version}
        items={items}
        {...(storageError === undefined ? {} : { storageError })}
      />
    </aside>
  );
}

function PanelHeader({
  count,
  onClose,
}: {
  readonly count: number;
  readonly onClose: () => void;
}) {
  return (
    <header className="feedback-heading">
      <div>
        <p className="eyebrow">Next refinement</p>
        <h2>
          Pending feedback <span>{count}</span>
        </h2>
        <p className="feedback-explanation">
          Gather your comments, then paste them into the agent chat together.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close feedback"
        onClick={onClose}
      >
        <X aria-hidden="true" size={18} />
      </Button>
    </header>
  );
}

function FeedbackList({
  items,
  plan,
  onUpdate,
  onRemove,
  selectedItem,
  onSelect,
}: Pick<
  FeedbackPanelProps,
  "items" | "plan" | "onUpdate" | "onRemove" | "selectedItem" | "onSelect"
>) {
  return (
    <div>
      {items.length === 0 ? (
        <div className="feedback-empty">
          <MessageSquareText aria-hidden="true" size={20} />
          <p>Add feedback from a plan section, visual, or blank canvas area.</p>
        </div>
      ) : (
        items.map((item, index) => (
          <FeedbackEditor
            key={item.id}
            item={item}
            number={index + 1}
            plan={plan}
            onUpdate={onUpdate}
            onRemove={onRemove}
            {...(selectedItem?.id === item.id
              ? { selected: selectedItem }
              : {})}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}

function TrialQuestion({
  trialAssessment,
  onAssess,
}: {
  readonly trialAssessment?: TrialAssessment;
  readonly onAssess: (assessment: TrialAssessment) => void;
}) {
  return (
    <fieldset className="trial-assessment">
      <legend>Did keeping the original reference help?</legend>
      <label>
        <input
          type="radio"
          name="trial-assessment"
          checked={trialAssessment === "helpful"}
          onChange={() => onAssess("helpful")}
        />
        It helped
      </label>
      <label>
        <input
          type="radio"
          name="trial-assessment"
          checked={trialAssessment === "hindered"}
          onChange={() => onAssess("hindered")}
        />
        It got in the way
      </label>
    </fieldset>
  );
}

function CopyPromptSection({
  plan,
  version,
  items,
  storageError,
}: Pick<FeedbackPanelProps, "plan" | "version" | "items" | "storageError">) {
  const [copiedPrompt, setCopiedPrompt] = useState<string | undefined>();
  const [manualCopy, setManualCopy] = useState(false);
  const prompt = useMemo(
    () => buildRevisionPrompt(plan, version, items),
    [items, plan, version],
  );
  const describedCount = items.filter(
    (item) => item.requestedChange.trim() !== "",
  ).length;
  const isCopied = copiedPrompt === prompt;
  const copy = async (): Promise<void> => {
    try {
      if (navigator.clipboard === undefined) throw new Error("Unavailable");
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(prompt);
      setManualCopy(false);
    } catch {
      setManualCopy(true);
    }
  };
  return (
    <footer className="feedback-copy">
      {storageError === undefined ? (
        <p>Comments stay in this browser. Nothing is sent automatically.</p>
      ) : (
        <p className="feedback-warning" role="alert">
          {storageError} Nothing is sent automatically.
        </p>
      )}
      <Button disabled={describedCount === 0} onClick={() => void copy()}>
        {isCopied ? (
          <Check aria-hidden="true" size={15} />
        ) : (
          <Clipboard aria-hidden="true" size={15} />
        )}
        {isCopied
          ? "Feedback copied"
          : `Copy feedback${describedCount === 0 ? "" : ` (${describedCount})`}`}
      </Button>
      {manualCopy ? (
        <div className="manual-copy" role="alert">
          <p>Clipboard access failed. Select and copy this prompt manually.</p>
          <textarea
            aria-label="Agent prompt for manual copy"
            readOnly
            value={prompt}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </footer>
  );
}

function FeedbackEditor({
  item,
  number,
  plan,
  onUpdate,
  onRemove,
  selected,
  onSelect,
}: {
  readonly item: FeedbackItem;
  readonly number: number;
  readonly plan: Plan;
  readonly onUpdate: (id: string, requestedChange: string) => void;
  readonly onRemove: (id: string) => void;
  readonly selected?: FeedbackItem;
  readonly onSelect: (item: FeedbackItem) => void;
}) {
  const status = targetStatus(item, plan);
  const [editing, setEditing] = useState(item.requestedChange === "");
  const row = useRef<HTMLElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) editor.current?.focus({ preventScroll: true });
  }, [editing]);
  useEffect(() => {
    if (!selected || row.current === null) return;
    const list = row.current.closest(".feedback-list");
    if (list === null) return;
    list.scrollTop +=
      row.current.getBoundingClientRect().top -
      list.getBoundingClientRect().top;
  }, [selected]);
  return (
    <article
      ref={row}
      className={`feedback-editor ${selected ? "selected" : ""}`}
    >
      <button
        type="button"
        className="feedback-location"
        aria-pressed={selected !== undefined}
        onClick={() => onSelect(item)}
      >
        <span className="feedback-number">{number}.</span>{" "}
        {readableLocation(item, plan)}
      </button>
      {status === "current" ? null : (
        <p className={`target-status ${status}`} role="status">
          {status === "changed"
            ? "This location has changed since you commented. The copied feedback keeps your original reference."
            : "This location is no longer in the plan. The copied feedback keeps your original reference."}
        </p>
      )}
      {editing ? (
        <label>
          Your feedback
          <textarea
            ref={editor}
            aria-label={`Requested change for feedback ${number}`}
            value={item.requestedChange}
            onChange={(event) => onUpdate(item.id, event.currentTarget.value)}
            placeholder="Describe what the agent should revise"
          />
        </label>
      ) : (
        <p className="feedback-body">{item.requestedChange || "Empty draft"}</p>
      )}
      <div className="feedback-actions">
        <button
          type="button"
          aria-label={`${editing ? "Done editing" : "Edit"} feedback ${number}`}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Done" : "Edit"}
        </button>
        <button
          type="button"
          aria-label={`Remove feedback ${number}`}
          onClick={() => onRemove(item.id)}
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function readableLocation(item: FeedbackItem, plan: Plan): string {
  const target = item.target;
  if (target.kind === "canvas") return "Canvas area";
  const title =
    target.itemId === undefined
      ? "Plan overview"
      : (plan.items.find((candidate) => candidate.id === target.itemId)
          ?.title ?? "Removed work item");
  return `${title} · ${target.kind === "asset" ? target.caption : target.label}`;
}
