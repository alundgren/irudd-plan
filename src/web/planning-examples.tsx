import { useEffect, useRef, useState } from "react";
import type { StoredPlanningEntry } from "../contract/planning.js";
import { questionAttachments } from "./planning-attention.js";
import { AssetView } from "./asset-view.js";
import { Button } from "./ui/button.js";

export function ExampleWorkspace({
  question,
  entries,
  planId,
  onClose,
}: {
  readonly question: StoredPlanningEntry;
  readonly entries: readonly StoredPlanningEntry[];
  readonly planId: string;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [original] = useState(() => questionAttachments(question, entries));
  const current = questionAttachments(question, entries);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus({ preventScroll: true });
  }, []);
  return (
    <dialog
      ref={dialog}
      className="example-workspace"
      onCancel={onClose}
      onClose={onClose}
    >
      <header>
        <Button variant="outline" onClick={onClose}>
          Back to question
        </Button>
        <h2>Compare examples</h2>
        <label>
          Canvas zoom{" "}
          <select
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
          </select>
        </label>
      </header>
      <div className="example-scroll">
        <div className="example-documents" style={{ zoom }}>
          <aside>
            <p className="guided-label">This question</p>
            <h2>{question.body}</h2>
            <p>
              Full attached files. Reading size and width affect one document at
              a time.
            </p>
          </aside>
          {original.map((reference) => {
            const live = current.find(
              (candidate) => candidate.key === reference.key,
            );
            return (
              <ExampleDocument
                key={reference.key}
                reference={reference}
                planId={planId}
                changed={
                  !live
                    ? "This attachment was removed. The original remains below when available."
                    : live.asset.digest !== reference.asset.digest
                      ? "This file changed. You are reading the version opened for comparison."
                      : undefined
                }
              />
            );
          })}
          {current.some(
            (reference) =>
              !original.some((previous) => previous.key === reference.key),
          ) ? (
            <p role="status">
              New examples are available. Return to the question and open
              comparison again to read them.
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function ExampleDocument({
  reference,
  planId,
  changed,
}: {
  readonly reference: ReturnType<typeof questionAttachments>[number];
  readonly planId: string;
  readonly changed: string | undefined;
}) {
  const [size, setSize] = useState(1);
  const [wide, setWide] = useState(false);
  return (
    <article
      className={`example-document ${wide ? "example-wide" : ""}`}
      aria-label={reference.asset.caption}
    >
      <nav aria-label={`Reading controls for ${reference.asset.caption}`}>
        <label>
          Reading size{" "}
          <select
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          >
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={wide}
          onClick={() => setWide(!wide)}
        >
          Wider
        </Button>
      </nav>
      {changed ? <p role="status">{changed}</p> : null}
      <div className="example-file-scroll">
        <div style={{ zoom: size }}>
          <AssetView
            key={reference.asset.digest}
            planId={planId}
            asset={reference.asset}
            feedbackCount={0}
          />
        </div>
      </div>
    </article>
  );
}
