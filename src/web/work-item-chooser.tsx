import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { WorkItem } from "../contract/plan.js";

export function WorkItemChooser({
  items,
  selected,
  onSelect,
}: {
  readonly items: ReadonlyArray<WorkItem>;
  readonly selected: string | undefined;
  readonly onSelect: (id?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const choices = [{ id: "", title: "Epic goal" }, ...items].filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  );
  const current = Math.min(active, choices.length - 1);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (id: string) => {
    onSelect(id || undefined);
    close();
  };
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${listId}-${current}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, current, listId]);
  return (
    <div
      className="work-item-chooser"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        aria-label="Read work item"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(!open);
        }}
      >
        <span>
          {items.find((item) => item.id === selected)?.title ?? "Epic goal"}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="work-item-menu">
          <div className="work-item-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={input}
              role="combobox"
              aria-label="Find work item"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                current >= 0 ? `${listId}-${current}` : undefined
              }
              placeholder="Find work item…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive(
                    Math.max(
                      0,
                      Math.min(
                        choices.length - 1,
                        current + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                }
                if (event.key === "Enter" && choices[current]) {
                  event.preventDefault();
                  choose(choices[current]!.id);
                }
              }}
            />
          </div>
          <div
            role="listbox"
            id={listId}
            aria-label="Work items"
            className="work-item-options"
          >
            {choices.map((item, index) => (
              <button
                type="button"
                role="option"
                key={item.id}
                id={`${listId}-${index}`}
                tabIndex={-1}
                aria-selected={item.id === (selected ?? "")}
                className={index === current ? "active" : ""}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item.id)}
              >
                <span>{item.title}</span>
                {item.id === (selected ?? "") && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          {choices.length === 0 && <p role="status">No matching work items.</p>}
        </div>
      )}
    </div>
  );
}
