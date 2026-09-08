import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Plan } from "../contract/plan.js";
import {
  targetStatus,
  type FeedbackItem,
  type FeedbackTarget,
} from "./feedback.js";

export function feedbackElement(
  target: FeedbackTarget,
): HTMLElement | undefined {
  if (target.kind === "canvas") return undefined;
  if (
    target.kind === "section" &&
    target.itemId !== undefined &&
    target.sectionId === "header"
  ) {
    return (
      Array.from(document.querySelectorAll<HTMLElement>(".item-frame"))
        .find((el) => el.dataset.frameItem === target.itemId)
        ?.querySelector<HTMLElement>(".frame-heading") ?? undefined
    );
  }
  const sheets = Array.from(
    document.querySelectorAll<HTMLElement>(".plan-sheet"),
  );
  const sheet = sheets.find(
    (candidate) =>
      candidate.dataset.itemId === target.itemId &&
      candidate.dataset.assetId ===
        (target.kind === "asset" ? target.assetId : undefined),
  );
  if (target.kind === "asset")
    return sheet?.querySelector<HTMLElement>(".asset-frame") ?? undefined;
  const id =
    target.itemId === undefined || target.sectionId === "header"
      ? target.sectionId
      : `${target.itemId}:${target.sectionId}`;
  return Array.from(
    sheet?.querySelectorAll<HTMLElement>("[data-section]") ?? [],
  ).find((element) => element.dataset.section === id);
}

export function FeedbackPins({
  plan,
  items,
  selectedId,
  onOpen,
  summary,
}: {
  readonly plan: Plan;
  readonly items: ReadonlyArray<FeedbackItem>;
  readonly selectedId?: string | undefined;
  readonly summary: boolean;
  readonly onOpen: (item: FeedbackItem) => void;
}) {
  const [hosts, setHosts] = useState<Map<string, HTMLElement>>(new Map());
  useEffect(() => {
    const next = new Map<string, HTMLElement>();
    for (const item of items) {
      if (targetStatus(item, plan) !== "current") continue;
      if (
        summary &&
        item.target.kind !== "canvas" &&
        item.target.itemId !== undefined
      )
        continue;
      const element = feedbackElement(item.target);
      if (element !== undefined) next.set(item.id, element);
    }
    setHosts(next);
  }, [items, plan, summary]);
  return (
    <>
      {items.map((item, index) => {
        if (targetStatus(item, plan) !== "current") return null;
        const target = item.target;
        const point =
          target.kind === "canvas"
            ? target
            : (target.position ?? { x: 1, y: 0 });
        const pin = (
          <button
            type="button"
            data-canvas-pin={target.kind === "canvas" ? "" : undefined}
            className={`canvas-feedback-pin nodrag nopan ${selectedId === item.id ? "selected" : ""}`}
            style={{
              left:
                target.kind === "canvas"
                  ? point.x
                  : `clamp(0px, calc(${point.x * 100}% - 16px), calc(100% - 32px))`,
              top:
                target.kind === "canvas"
                  ? point.y
                  : `clamp(0px, calc(${point.y * 100}% - 16px), calc(100% - 32px))`,
            }}
            aria-label={`Open ${target.kind} feedback ${index + 1}`}
            aria-pressed={selectedId === item.id}
            title={item.requestedChange}
            onClick={() => onOpen(item)}
          >
            {index + 1}
          </button>
        );
        const host = hosts.get(item.id);
        return target.kind === "canvas" ? (
          <span key={item.id}>{pin}</span>
        ) : host === undefined ? null : (
          createPortal(pin, host, item.id)
        );
      })}
    </>
  );
}
