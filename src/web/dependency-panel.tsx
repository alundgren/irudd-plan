import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { WorkItem } from "../contract/plan.js";

export function DependencyPanel({
  item,
  items,
  onClose,
  onSelect,
}: {
  readonly item: WorkItem;
  readonly items: ReadonlyArray<WorkItem>;
  readonly onClose: () => void;
  readonly onSelect: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const dependencies = items.filter((candidate) =>
    item.dependsOnItemIds?.includes(candidate.id),
  );
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="dependency-panel"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header>
        <h2 id={heading}>Depends on {dependencies.length}</h2>
        <button type="button" onClick={onClose} aria-label="Close dependencies">
          Close
        </button>
      </header>
      <p>{item.title}</p>
      <ul>
        {dependencies.map((dependency) => (
          <li key={dependency.id}>
            <button type="button" onClick={() => onSelect(dependency.id)}>
              {dependency.title}
            </button>
          </li>
        ))}
      </ul>
    </dialog>,
    document.body,
  );
}
