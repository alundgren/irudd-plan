import { useCanvasTouch } from "./use-canvas-touch.js";
import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { wheelZoom, type Point } from "./canvas-camera.js";

import type { Plan } from "../contract/plan.js";
import {
  sectionText,
  type FeedbackTarget,
  type FeedbackPosition,
} from "./feedback.js";

export type CanvasTool = "comment" | "pan";
export const CanvasToolContext = createContext<CanvasTool>("comment");
const controls =
  "button, a, input, textarea, select, summary, dialog, [contenteditable], [role=button]";

export function relativePosition(
  element: Element,
  x: number,
  y: number,
): FeedbackPosition {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (x - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (y - bounds.top) / bounds.height)),
  };
}

export function CanvasComments({
  plan,
  viewport,
  onPan,
  toWorld,
  onScale,
  onAdd,
  children,
}: {
  readonly plan: Plan;
  readonly viewport: RefObject<HTMLDivElement | null>;
  readonly onPan: (x: number, y: number) => void;
  readonly toWorld: (point: Point) => Point;
  readonly onScale: (factor: number, point?: Point) => void;
  readonly onAdd: (target: FeedbackTarget) => void;
  readonly children: (
    tool: CanvasTool,
    onTool: (tool: CanvasTool) => void,
  ) => ReactNode;
}) {
  const [tool, onTool] = useState<CanvasTool>("comment");
  const container = useCanvasTouch(viewport, onPan, onScale);
  useEffect(() => {
    const view = viewport.current;
    const wheel = (event: WheelEvent) => {
      if (!view || (event.target as Element).closest("input, textarea, select"))
        return;
      event.preventDefault();
      if (
        (tool === "pan" && !event.ctrlKey && !event.metaKey) ||
        event.shiftKey
      ) {
        const unit =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? view.clientHeight
              : 1;
        onPan(-event.deltaX * unit, -event.deltaY * unit);
      } else {
        const bounds = view.getBoundingClientRect();
        onScale(wheelZoom(event.deltaY, event.deltaMode, view.clientHeight), {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        });
      }
    };
    view?.addEventListener("wheel", wheel, { passive: false });
    return () => view?.removeEventListener("wheel", wheel);
  }, [viewport, onScale, onPan, tool]);
  const gesture = useRef<
    | {
        x: number;
        y: number;
        id: number;
        moved: boolean;
        pan: boolean;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const pendingClick = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    const cancelSelection = () => {
      if (window.getSelection()?.isCollapsed === false)
        clearTimeout(pendingClick.current);
    };
    document.addEventListener("selectionchange", cancelSelection);
    return () => {
      clearTimeout(pendingClick.current);
      document.removeEventListener("selectionchange", cancelSelection);
    };
  }, [tool, plan]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter")
        clearTimeout(pendingClick.current);
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !(event.target instanceof Element) ||
        event.target.closest(controls)
      )
        return;
      if (event.key.toLowerCase() === "c") onTool("comment");
      if (event.key.toLowerCase() === "v") onTool("pan");
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [onTool]);
  return (
    <CanvasToolContext value={tool}>
      <div
        ref={container}
        className={`canvas-comments ${tool}-mode`}
        tabIndex={-1}
        onPointerDownCapture={(event) => {
          suppressClick.current = false;
          gesture.current = undefined;
          clearTimeout(pendingClick.current);
          if (
            (event.target as Element).closest(controls) ||
            ![0, 1].includes(event.button)
          )
            return;
          const pan = tool === "pan" || event.button === 1;
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
            moved: false,
            pan,
          };
          if (pan && event.pointerType !== "touch") {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMoveCapture={(event) => {
          const start = gesture.current;
          if (start === undefined || start.id !== event.pointerId) return;
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y;
          if (Math.hypot(dx, dy) > 5) start.moved = true;
          if (start.pan && event.pointerType !== "touch") {
            start.pan = true;
            event.preventDefault();
            onPan(event.clientX - start.x, event.clientY - start.y);
            start.x = event.clientX;
            start.y = event.clientY;
          }
        }}
        onPointerUpCapture={(event) => {
          suppressClick.current =
            gesture.current?.moved === true || gesture.current?.pan === true;
          gesture.current = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancelCapture={() => {
          gesture.current = undefined;
          suppressClick.current = true;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (
            event.detail > 1 ||
            tool !== "comment" ||
            (event.target as Element).closest(controls) ||
            window.getSelection()?.isCollapsed === false
          )
            return;
          const target = commentTarget(
            plan,
            event.target as Element,
            event.clientX,
            event.clientY,
          );
          if (target !== undefined) {
            const host = event.currentTarget;
            if (target.kind === "section") {
              // Allow a second click or text selection to cancel a text comment.
              pendingClick.current = setTimeout(() => {
                host.focus({ preventScroll: true });
                onAdd(target);
              }, 300);
            } else {
              host.focus({ preventScroll: true });
              onAdd(target);
            }
          } else if (
            !(event.target as Element).closest(".item-frame, .plan-sheet") &&
            viewport.current?.contains(event.target as Element)
          ) {
            event.currentTarget.focus({ preventScroll: true });
            onAdd({
              kind: "canvas",
              ...toWorld({
                x:
                  event.clientX - viewport.current.getBoundingClientRect().left,
                y: event.clientY - viewport.current.getBoundingClientRect().top,
              }),
            });
          }
        }}
      >
        {children(tool, onTool)}
      </div>
    </CanvasToolContext>
  );
}

function commentTarget(
  plan: Plan,
  element: Element,
  x: number,
  y: number,
): FeedbackTarget | undefined {
  const sheet = element.closest<HTMLElement>(".plan-sheet");
  if (sheet === null) return undefined;
  const itemId = sheet.dataset.itemId;
  const assetId = sheet.dataset.assetId;
  if (assetId !== undefined && itemId !== undefined) {
    const asset = plan.assets.find((candidate) => candidate.id === assetId);
    const frame = sheet.querySelector(".asset-frame");
    if (asset === undefined || frame === null) return undefined;
    return {
      kind: "asset",
      itemId,
      sectionId: "visuals",
      assetId,
      assetDigest: asset.digest,
      caption: asset.caption,
      position: relativePosition(frame, x, y),
    };
  }
  let container = element.closest<HTMLElement>("[data-feedback-container]");
  if (
    container?.querySelector("[data-feedback-label]") === null ||
    container === null
  ) {
    container = sheet.querySelector<HTMLElement>(
      itemId === undefined
        ? '[data-section="epic-goal"]'
        : '[data-section="header"]',
    );
  }
  if (container === null) return undefined;
  const id = container.dataset.section;
  if (id === undefined) return undefined;
  const sectionId =
    itemId !== undefined && id.startsWith(`${itemId}:`)
      ? id.slice(itemId.length + 1)
      : id;
  const target = { ...(itemId === undefined ? {} : { itemId }), sectionId };
  const originalText = sectionText(plan, target);
  if (originalText === undefined) return undefined;
  return {
    kind: "section",
    ...target,
    label:
      container.querySelector<HTMLElement>("[data-feedback-label]")?.dataset
        .feedbackLabel ?? "Epic goal",
    originalText,
    originalExcerpt: originalText,
    excerptOccurrence: 1,
    position: relativePosition(container, x, y),
  };
}
