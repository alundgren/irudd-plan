import { canvasExtent } from "./canvas-coordinates.js";
import { collectRequiredContent } from "./required-content.js";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Plan } from "../contract/plan.js";
import { CanvasComments } from "./canvas-comments.js";
import { CanvasTools } from "./canvas-tools.js";
import { feedbackElement, FeedbackPins } from "./feedback-pins.js";
import {
  targetStatus,
  type FeedbackItem,
  type FeedbackTarget,
} from "./feedback.js";
import { PlanSheet } from "./plan-sheet.js";
import { ItemFrame } from "./item-frame.js";

export interface PlanCanvasProps {
  readonly plan: Plan;
  readonly selectedItemId?: string;
  readonly changedSections: ReadonlySet<string>;
  readonly feedbackItems: ReadonlyArray<FeedbackItem>;
  readonly onSelect: (itemId?: string) => void;
  readonly onAddFeedback: (target: FeedbackTarget) => void;
  readonly focusedFeedback?: FeedbackItem;
  readonly selectedFeedbackId?: string;
  readonly onSelectFeedback: (item: FeedbackItem) => void;
}
export type LayoutMode = "overview" | "sections" | "reading";
export function layoutMode(zoom: number): LayoutMode {
  return zoom < 0.35 ? "overview" : zoom < 0.85 ? "sections" : "reading";
}

export function PlanCanvas(props: PlanCanvasProps) {
  const { plan, selectedItemId, onSelect, focusedFeedback } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(selectedItemId === undefined ? 0.25 : 1);
  const [selected, setSelected] = useState(selectedItemId);
  const [referenceId, setReferenceId] = useState<string>();
  const mode = layoutMode(zoom);
  const extent = canvasExtent(props.feedbackItems);
  useLayoutEffect(() => {
    const item = plan.items.find((item) => item.id === selected);
    if (
      referenceId !== undefined &&
      (!item ||
        !collectRequiredContent(plan, item).assets.some(
          (asset) => asset.id === referenceId,
        ))
    ) {
      setReferenceId(undefined);
      if (viewport.current) viewport.current.scrollTop = 0;
    }
  }, [plan, selected, referenceId]);
  const positions = useRef(new Map<string, { top: number; left: number }>());
  const positionKey =
    mode === "reading" ? `reading:${selected ?? "epic"}` : mode;
  const currentKey = useRef(positionKey);
  const previousRoute = useRef(selectedItemId);
  const requestedRoute = useRef<string | undefined | null>(null);
  const navigate = (id?: string) => {
    requestedRoute.current = id;
    onSelect(id);
  };
  const pending = useRef<(() => void) | undefined>(undefined);
  const appliedFeedback = useRef<FeedbackItem | undefined>(undefined);
  const stopFeedbackTracking = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    appliedFeedback.current = undefined;
    return () => {
      stopFeedbackTracking.current?.();
      stopFeedbackTracking.current = undefined;
    };
  }, [focusedFeedback]);
  const [request, setRequest] = useState(0);
  const savePosition = () => {
    stopFeedbackTracking.current?.();
    if (viewport.current)
      positions.current.set(currentKey.current, {
        top: viewport.current.scrollTop,
        left: viewport.current.scrollLeft,
      });
  };
  const reveal = useCallback((element?: HTMLElement) => {
    const view = viewport.current;
    if (element?.closest("details")) element.closest("details")!.open = true;
    if (view && element)
      view.scrollTop +=
        element.getBoundingClientRect().top -
        view.getBoundingClientRect().top -
        24;
  }, []);
  const itemElement = (id: string) =>
    Array.from(
      viewport.current?.querySelectorAll<HTMLElement>(".item-frame") ?? [],
    ).find((el) => el.dataset.frameItem === id);
  const selectItem = (id?: string) => {
    setReferenceId(undefined);
    savePosition();
    if (id !== undefined) setSelected(id);
    setZoom(id === undefined ? 0.25 : 1);
    if (id !== selectedItemId) navigate(id);
    else {
      pending.current = () => {
        if (viewport.current) viewport.current.scrollTop = 0;
      };
      setRequest((n) => n + 1);
    }
  };
  const changeZoom = (value: number, itemId?: string) => {
    savePosition();
    const next = Math.max(0.25, Math.min(2, value));
    let nextSelected =
      itemId ??
      (plan.items.some((item) => item.id === selected) ? selected : undefined);
    if (itemId !== undefined) setSelected(itemId);
    if (layoutMode(next) === "reading" && nextSelected === undefined) {
      const view = viewport.current;
      const center = view
        ? view.getBoundingClientRect().top + view.clientHeight / 2
        : 0;
      const nearest =
        plan.items.reduce<{ id?: string; distance: number }>(
          (best, item) => {
            const bounds = itemElement(item.id)?.getBoundingClientRect();
            const distance = bounds
              ? Math.abs((bounds.top + bounds.bottom) / 2 - center)
              : Infinity;
            return distance < best.distance ? { id: item.id, distance } : best;
          },
          { distance: Infinity },
        ).id ?? plan.items[0]?.id;
      setSelected(nearest);
      nextSelected = nearest;
    }
    if (layoutMode(next) === "reading" && nextSelected !== selectedItemId)
      navigate(nextSelected);
    setZoom(next);
  };
  const selectReference = (itemId: string, assetId: string) => {
    setReferenceId(assetId);
    savePosition();
    setSelected(itemId);
    setZoom(1);
    if (itemId !== selectedItemId) navigate(itemId);
    pending.current = () => {
      const element = Array.from(
        viewport.current?.querySelectorAll<HTMLElement>(".reference-sheet") ??
          [],
      ).find(
        (el) => el.dataset.itemId === itemId && el.dataset.assetId === assetId,
      );
      reveal(element);
    };
    setRequest((n) => n + 1);
  };
  useLayoutEffect(() => {
    if (previousRoute.current === selectedItemId) return;
    previousRoute.current = selectedItemId;
    if (requestedRoute.current === selectedItemId) {
      requestedRoute.current = null;
      return;
    }
    savePosition();
    if (selectedItemId !== undefined) setSelected(selectedItemId);
    setZoom(selectedItemId === undefined ? 0.25 : 1);
  }, [selectedItemId]);
  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view) return;
    if (currentKey.current !== positionKey) {
      currentKey.current = positionKey;
      view.scrollTop =
        positions.current.get(positionKey)?.top ??
        (mode === "sections" ? -extent.top : 0);
      view.scrollLeft =
        positions.current.get(positionKey)?.left ??
        (mode === "sections" ? -extent.left : 0);
    }
    pending.current?.();
    pending.current = undefined;
  }, [positionKey, request, selectedItemId]);
  useLayoutEffect(() => {
    if (
      !focusedFeedback ||
      appliedFeedback.current === focusedFeedback ||
      targetStatus(focusedFeedback, plan) !== "current"
    )
      return;
    const target = focusedFeedback.target;
    if (target.kind === "canvas") {
      if (mode !== "sections") {
        savePosition();
        setZoom(0.6);
        return;
      }
      const view = viewport.current;
      if (view) {
        view.scrollTop = Math.max(0, target.y - extent.top - 120);
        view.scrollLeft = Math.max(
          0,
          target.x - extent.left - view.clientWidth / 2,
        );
      }
    } else {
      if (mode !== "reading" || selected !== target.itemId) {
        savePosition();
        setSelected(target.itemId);
        if (target.itemId !== selectedItemId) navigate(target.itemId);
        setReferenceId(target.kind === "asset" ? target.assetId : undefined);
        setZoom(1);
        return;
      }
      const element = feedbackElement(target);
      if (element?.querySelector(".asset-loading")) {
        const observer = new MutationObserver(() => setRequest((n) => n + 1));
        observer.observe(element, { childList: true, subtree: true });
        return () => observer.disconnect();
      }
      const view = viewport.current;
      if (element && view) {
        const focus = () => {
          reveal(element);
          view.scrollTop += element.offsetHeight * (target.position?.y ?? 0);
        };
        focus();
        appliedFeedback.current = focusedFeedback;
        // Earlier references can finish loading after this target is available.
        const observer = new ResizeObserver(focus);
        observer.observe(element);
        observer.observe(element.closest(".item-frame") ?? element);
        const stop = () => {
          observer.disconnect();
          for (const event of ["wheel", "pointerdown", "touchstart", "keydown"])
            view.removeEventListener(event, stop);
        };
        for (const event of ["wheel", "pointerdown", "touchstart", "keydown"])
          view.addEventListener(event, stop, { once: true });
        stopFeedbackTracking.current = stop;
      }
    }
    appliedFeedback.current = focusedFeedback;
  });
  const visibleItems =
    mode === "reading"
      ? plan.items.filter((item) => item.id === selected)
      : plan.items;
  return (
    <CanvasComments
      plan={plan}
      onAdd={props.onAddFeedback}
      viewport={viewport}
      mode={mode}
      onZoom={changeZoom}
      zoom={zoom}
    >
      {(tool, onTool) => (
        <>
          <nav className="canvas-navigation" aria-label="Plan navigation">
            <button type="button" onClick={() => selectItem()}>
              Overview
            </button>
            <span>
              {mode === "reading"
                ? "Reading view"
                : mode === "sections"
                  ? "Section layout"
                  : "Overview layout"}
            </span>
          </nav>
          <div
            ref={viewport}
            className={`plan-viewport ${mode}-mode`}
            data-mode={mode}
            aria-label="Plan canvas"
            tabIndex={0}
            onScroll={() => {
              if (viewport.current)
                positions.current.set(currentKey.current, {
                  top: viewport.current.scrollTop,
                  left: viewport.current.scrollLeft,
                });
            }}
            style={
              {
                "--reading-font": `${Math.min(22, 16 + Math.max(0, zoom - 0.85) * 6)}px`,
              } as CSSProperties
            }
          >
            <div
              className="plan-layout"
              data-origin-x={mode === "sections" ? extent.left : 0}
              data-origin-y={mode === "sections" ? extent.top : 0}
              style={
                mode === "sections"
                  ? {
                      minHeight: extent.height,
                      width: `calc(100% + ${-extent.left}px)`,
                      paddingTop: 24 - extent.top,
                      paddingLeft: `calc(var(--layout-side) + ${-extent.left}px)`,
                    }
                  : undefined
              }
            >
              {(mode !== "reading" || selected === undefined) && (
                <PlanSheet
                  {...props}
                  selected={mode === "overview" || selected === undefined}
                  onSelect={selectItem}
                  onReference={selectReference}
                />
              )}
              {mode === "overview" && (
                <p className="overview-limit">
                  Overview keeps a minimum readable size. Larger plans continue
                  below.
                </p>
              )}
              <div className="item-grid">
                {visibleItems.map((item) => (
                  <ItemFrame
                    key={item.id}
                    {...props}
                    item={item}
                    mode={mode}
                    referenceId={referenceId}
                    selected={item.id === selected}
                    onSelect={selectItem}
                    onReference={selectReference}
                  />
                ))}
              </div>
              {mode === "sections" && (
                <div
                  aria-hidden="true"
                  className="canvas-extent"
                  style={{ width: extent.width, height: extent.height }}
                />
              )}
              <FeedbackPins
                {...props}
                mode={mode}
                renderKey={positionKey}
                selectedId={props.selectedFeedbackId}
                onOpen={props.onSelectFeedback}
                items={props.feedbackItems}
              />
            </div>
          </div>
          <CanvasTools
            tool={tool}
            onTool={onTool}
            zoom={zoom}
            mode={mode}
            onZoom={changeZoom}
            onFit={() => {
              savePosition();
              setZoom(0.25);
              pending.current = () => {
                if (viewport.current) viewport.current.scrollTop = 0;
              };
              setRequest((n) => n + 1);
            }}
            onAddCanvas={() => {
              savePosition();
              setZoom(0.6);
              pending.current = () => {
                props.onAddFeedback({
                  kind: "canvas",
                  x:
                    extent.left +
                    (viewport.current?.scrollLeft ?? 0) +
                    (viewport.current?.clientWidth ?? 0) / 2,
                  y: extent.top + (viewport.current?.scrollTop ?? 0) + 150,
                });
              };
              setRequest((n) => n + 1);
            }}
          />
        </>
      )}
    </CanvasComments>
  );
}
