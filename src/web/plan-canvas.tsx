import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Plan } from "../contract/plan.js";
import { CanvasComments } from "./canvas-comments.js";
import { WorkItemChooser } from "./work-item-chooser.js";
import { CanvasTools } from "./canvas-tools.js";
import { feedbackElement, FeedbackPins } from "./feedback-pins.js";
import {
  targetStatus,
  type FeedbackItem,
  type FeedbackTarget,
} from "./feedback.js";
import { PlanSheet } from "./plan-sheet.js";
import { ItemFrame } from "./item-frame.js";
import { elementPoint, useCanvasCamera } from "./use-canvas-camera.js";

export interface PlanCanvasProps {
  readonly navigationHost: HTMLDivElement | null;
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

export function PlanCanvas(props: PlanCanvasProps) {
  const { plan, selectedItemId, onSelect, focusedFeedback } = props;
  const camera = useCanvasCamera();
  const { viewport, world, focus, fit } = camera;
  const [selected, setSelected] = useState(selectedItemId);
  const [referenceId, setReferenceId] = useState<string>();
  const [reading, setReading] = useState(selectedItemId !== undefined);
  const previousRoute = useRef<string | undefined | null>(null);
  const requestedRoute = useRef<string | undefined | null>(null);
  const stoppedFeedback = useRef<FeedbackItem | undefined>(undefined);
  const targetElement = (id?: string, assetId?: string) =>
    Array.from(
      world.current?.querySelectorAll<HTMLElement>(".plan-sheet") ?? [],
    ).find(
      (element) =>
        element.dataset.itemId === id && element.dataset.assetId === assetId,
    );
  const navigate = (id?: string) => {
    if (id !== selectedItemId) {
      requestedRoute.current = id;
      onSelect(id);
    }
  };
  const selectItem = (id?: string, assetId?: string) => {
    stoppedFeedback.current = focusedFeedback;
    setSelected(id);
    setReferenceId(assetId);
    setReading(true);
    navigate(id);
    const element = targetElement(id, assetId);
    if (element) focus(element);
  };
  useLayoutEffect(() => {
    if (previousRoute.current === selectedItemId) return;
    previousRoute.current = selectedItemId;
    if (requestedRoute.current === selectedItemId) {
      requestedRoute.current = null;
      return;
    }
    stoppedFeedback.current = focusedFeedback;
    setSelected(selectedItemId);
    setReferenceId(undefined);
    setReading(selectedItemId !== undefined);
    const element = targetElement(selectedItemId);
    if (selectedItemId !== undefined && element) focus(element);
    else fit();
  }, [selectedItemId, focus, fit]);

  // Keep the selected document at the same camera position when a revision moves its row.
  const anchor = useRef<
    { element: HTMLElement; x: number; y: number } | undefined
  >(undefined);
  useLayoutEffect(() => {
    const element =
      targetElement(selected, referenceId) ?? targetElement(selected);
    if (!element) return;
    if (referenceId && !targetElement(selected, referenceId)) {
      setReferenceId(undefined);
      focus(element);
    }
    let width = viewport.current!.clientWidth;
    const track = () => {
      const origin = elementPoint(element, world.current!);
      const point = { x: origin.x + element.offsetWidth / 2, y: origin.y };
      if (camera.fitting.current) fit();
      else if (width !== viewport.current!.clientWidth) {
        camera.move({
          ...camera.current.current,
          x:
            viewport.current!.clientWidth / 2 -
            point.x * camera.current.current.zoom,
          y:
            camera.current.current.y +
            ((anchor.current?.y ?? point.y) - point.y) *
              camera.current.current.zoom,
        });
      } else if (anchor.current?.element === element) {
        camera.pan(
          (anchor.current.x - point.x) * camera.current.current.zoom,
          (anchor.current.y - point.y) * camera.current.current.zoom,
        );
      }
      width = viewport.current!.clientWidth;
      anchor.current = { element, ...point };
    };
    track();
    const observer = new ResizeObserver(track);
    if (world.current) observer.observe(world.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [plan, selected, referenceId]);

  useLayoutEffect(() => {
    if (
      !focusedFeedback ||
      stoppedFeedback.current === focusedFeedback ||
      targetStatus(focusedFeedback, plan) !== "current"
    )
      return;
    const target = focusedFeedback.target;
    let observer: ResizeObserver | undefined;
    if (target.kind === "canvas") {
      const view = viewport.current;
      camera.fitting.current = false;
      if (view)
        camera.move({
          x: view.clientWidth / 2 - target.x,
          y: view.clientHeight / 2 - target.y,
          zoom: 1,
        });
    } else {
      setSelected(target.itemId);
      setReferenceId(target.kind === "asset" ? target.assetId : undefined);
      setReading(true);
      navigate(target.itemId);
      const element = feedbackElement(target);
      if (!element) return;
      const reveal = () => {
        if (stoppedFeedback.current === focusedFeedback) {
          observer?.disconnect();
          return;
        }
        focus(element, target.position);
      };
      reveal();
      observer = new ResizeObserver(reveal);
      observer.observe(element);
      if (world.current) observer.observe(world.current);
    }
    const view = viewport.current?.parentElement;
    const stop = () => {
      stoppedFeedback.current = focusedFeedback;
      observer?.disconnect();
    };
    const events = ["wheel", "pointerdown", "touchstart", "keydown"];
    events.forEach((event) =>
      view?.addEventListener(event, stop, { once: true }),
    );
    return () => {
      observer?.disconnect();
      events.forEach((event) => view?.removeEventListener(event, stop));
    };
  }, [focusedFeedback, plan]);
  const summary = !reading && camera.camera.zoom < 0.45;
  const changeZoom = (zoom: number, point?: { x: number; y: number }) => {
    setReading(false);
    camera.zoom(zoom, point);
  };
  return (
    <CanvasComments
      plan={plan}
      onAdd={props.onAddFeedback}
      viewport={viewport}
      onScale={(factor, point) =>
        changeZoom(camera.current.current.zoom * factor, point)
      }
      onPan={camera.pan}
      toWorld={camera.toWorld}
    >
      {(tool, onTool) => (
        <>
          {props.navigationHost &&
            createPortal(
              <WorkItemChooser
                items={plan.items}
                selected={selected}
                onSelect={selectItem}
              />,
              props.navigationHost,
            )}
          <div
            ref={viewport}
            className="plan-viewport"
            aria-label="Plan canvas"
            tabIndex={0}
            data-zoom={camera.camera.zoom}
            onFocusCapture={(event) => {
              if (event.target === event.currentTarget) return;
              const target = event.target.getBoundingClientRect();
              const view = event.currentTarget.getBoundingClientRect();
              const x =
                target.left < view.left + 16
                  ? view.left + 16 - target.left
                  : Math.min(0, view.right - 16 - target.right);
              const y =
                target.top < view.top + 16
                  ? view.top + 16 - target.top
                  : Math.min(0, view.bottom - 16 - target.bottom);
              if (x || y) camera.pan(x, y);
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const step = event.shiftKey ? 300 : 80;
              const moves: Record<string, [number, number]> = {
                ArrowDown: [0, -step],
                ArrowUp: [0, step],
                ArrowLeft: [step, 0],
                ArrowRight: [-step, 0],
              };
              if (moves[event.key]) {
                event.preventDefault();
                camera.pan(...moves[event.key]!);
              }
              if (event.key === "+" || event.key === "=" || event.key === "-") {
                event.preventDefault();
                changeZoom(
                  camera.camera.zoom * (event.key === "-" ? 1 / 1.2 : 1.2),
                );
              }
              if (event.key === "Home") {
                event.preventDefault();
                setReading(false);
                fit();
              }
            }}
          >
            <div
              ref={world}
              className={`plan-layout ${summary ? "show-summaries" : "show-details"}`}
              style={
                {
                  transform: `translate(${camera.camera.x}px, ${camera.camera.y}px) scale(${camera.camera.zoom})`,
                  "--heading-size": `${Math.min(80, Math.max(18, 15 / camera.camera.zoom))}px`,
                } as CSSProperties
              }
            >
              <PlanSheet
                {...props}
                selected={selected === undefined}
                onSelect={selectItem}
                onReference={selectItem}
              />
              <div
                className="item-grid"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(Math.sqrt(plan.items.length)))}, 1200px)`,
                }}
              >
                {plan.items.map((item) => (
                  <ItemFrame
                    key={item.id}
                    {...props}
                    item={item}
                    summary={summary}
                    referenceId={referenceId}
                    selected={item.id === selected}
                    onSelect={selectItem}
                    onReference={selectItem}
                  />
                ))}
              </div>
              <FeedbackPins
                {...props}
                selectedId={props.selectedFeedbackId}
                onOpen={props.onSelectFeedback}
                items={props.feedbackItems}
                summary={summary}
              />
            </div>
          </div>
          <CanvasTools
            tool={tool}
            onTool={onTool}
            zoom={camera.camera.zoom}
            onZoom={changeZoom}
            onFit={() => {
              setReading(false);
              fit();
            }}
            onAddCanvas={() =>
              props.onAddFeedback({
                kind: "canvas",
                ...camera.toWorld({
                  x: (viewport.current?.clientWidth ?? 0) / 2,
                  y: (viewport.current?.clientHeight ?? 0) / 2,
                }),
              })
            }
          />
        </>
      )}
    </CanvasComments>
  );
}
