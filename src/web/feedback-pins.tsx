import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNodesInitialized, useStore, ViewportPortal } from "@xyflow/react";
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
}: {
  readonly plan: Plan;
  readonly items: ReadonlyArray<FeedbackItem>;
  readonly selectedId?: string;
  readonly onOpen: (item: FeedbackItem) => void;
}) {
  const initialized = useNodesInitialized();
  const zoom = useStore((state) => state.transform[2]);
  const [hosts, setHosts] = useState<Map<string, HTMLElement>>(new Map());
  useEffect(() => {
    const next = new Map<string, HTMLElement>();
    for (const item of items) {
      if (targetStatus(item, plan) !== "current") continue;
      const element = feedbackElement(item.target);
      if (element !== undefined) next.set(item.id, element);
    }
    setHosts(next);
  }, [items, plan, initialized]);
  return (
    <>
      {items.map((item, index) => {
        if (targetStatus(item, plan) !== "current") return null;
        const target = item.target;
        const point =
          target.kind === "canvas"
            ? target
            : (target.position ?? { x: 0.95, y: 0.1 });
        const pin = (
          <button
            type="button"
            className={`canvas-feedback-pin nodrag nopan ${selectedId === item.id ? "selected" : ""}`}
            style={{
              transform: `scale(${1 / zoom}) translate(-6px, -100%)`,
              left: target.kind === "canvas" ? point.x : `${point.x * 100}%`,
              top: target.kind === "canvas" ? point.y : `${point.y * 100}%`,
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
          <ViewportPortal key={item.id}>{pin}</ViewportPortal>
        ) : host === undefined ? null : (
          createPortal(pin, host, item.id)
        );
      })}
    </>
  );
}
