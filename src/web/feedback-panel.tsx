import {
  Check,
  Clipboard,
  MapPin,
  MessageSquareText,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Plan } from "../contract/plan.js";
import {
  buildRevisionPrompt,
  describeTarget,
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
      <PanelHeader onClose={onClose} />

      <p className="feedback-explanation">
        Nothing is submitted. Copy a prompt when these notes are ready for an
        agent.
      </p>
      {storageError === undefined ? null : (
        <p className="feedback-warning" role="alert">
          {storageError}
        </p>
      )}

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
      />

      {hasChangedTarget ? (
        <TrialQuestion
          {...(trialAssessment === undefined ? {} : { trialAssessment })}
          onAssess={onAssessTrial}
        />
      ) : null}
      <CopyPromptSection plan={plan} version={version} items={items} />
    </aside>
  );
}

function PanelHeader({ onClose }: { readonly onClose: () => void }) {
  return (
    <header>
      <div>
        <p className="eyebrow">Browser-local draft</p>
        <h2>Pending feedback</h2>
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
}: Pick<FeedbackPanelProps, "items" | "plan" | "onUpdate" | "onRemove">) {
  return (
    <div className="feedback-list">
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
}: Pick<FeedbackPanelProps, "plan" | "version" | "items">) {
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
    <div className="feedback-copy">
      <Button disabled={describedCount === 0} onClick={() => void copy()}>
        {isCopied ? (
          <Check aria-hidden="true" size={15} />
        ) : (
          <Clipboard aria-hidden="true" size={15} />
        )}
        {isCopied
          ? "Prompt copied"
          : `Copy agent prompt${describedCount === 0 ? "" : ` (${describedCount})`}`}
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
    </div>
  );
}

function FeedbackEditor({
  item,
  number,
  plan,
  onUpdate,
  onRemove,
}: {
  readonly item: FeedbackItem;
  readonly number: number;
  readonly plan: Plan;
  readonly onUpdate: (id: string, requestedChange: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  const status = targetStatus(item, plan);
  return (
    <article className="feedback-editor">
      <header>
        <div>
          <span className="feedback-number">{number}</span>
          <strong>{describeTarget(item.target)}</strong>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove feedback ${number}`}
          onClick={() => onRemove(item.id)}
        >
          <Trash2 aria-hidden="true" size={15} />
        </Button>
      </header>
      <p className={`target-status ${status}`}>
        {status === "current"
          ? `Reviewed at revision ${item.observedVersion}`
          : status === "changed"
            ? `Target changed since revision ${item.observedVersion}`
            : `Target disappeared after revision ${item.observedVersion}`}
      </p>
      <p className="original-reference">{originalReference(item)}</p>
      <label>
        Requested change
        <textarea
          aria-label={`Requested change for feedback ${number}`}
          value={item.requestedChange}
          onChange={(event) => onUpdate(item.id, event.currentTarget.value)}
          placeholder="Describe what the agent should revise"
        />
      </label>
    </article>
  );
}

function originalReference(item: FeedbackItem): string {
  if (item.target.kind === "section") return item.target.originalExcerpt;
  if (item.target.kind === "asset") {
    return `${item.target.caption} · ${item.target.assetDigest}`;
  }
  return `Canvas coordinates ${Math.round(item.target.x)}, ${Math.round(item.target.y)}`;
}
