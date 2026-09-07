import { useEffect, useRef, useState } from "react";

import { type FeedbackItem } from "./feedback.js";
import { Button } from "./ui/button.js";

export function FeedbackDialog({
  item,
  editing,
  onSave,
  onClose,
}: {
  readonly item: FeedbackItem;
  readonly editing: boolean;
  readonly onSave: (item: FeedbackItem) => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const feedback = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(item.subject ?? "Canvas area");
  const [text, setText] = useState(item.requestedChange);
  const dirty = editing
    ? text !== item.requestedChange ||
      subject !== (item.subject ?? "Canvas area")
    : text.trim() !== "";
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) =>
      event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    feedback.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="feedback-dialog"
      aria-labelledby="comment-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (subject.trim() && text.trim())
            onSave({
              ...item,
              subject: subject.trim(),
              requestedChange: text.trim(),
            });
        }}
      >
        <h2 id="comment-heading">{editing ? "Edit comment" : "New comment"}</h2>
        <label>
          About
          <input
            required
            maxLength={300}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label>
          Your feedback
          <textarea
            ref={feedback}
            required
            maxLength={10000}
            rows={5}
            value={text}
            placeholder="What should change in the next draft?"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            {editing ? "Save comment" : "Add comment"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
