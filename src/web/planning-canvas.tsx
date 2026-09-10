import { useCallback, useRef, type ReactNode } from "react";
import { elementPoint, useCanvasCamera } from "./use-canvas-camera.js";
import { usePlanningGestures } from "./use-planning-gestures.js";
import { usePlanningResize } from "./use-planning-resize.js";
import { PlanningCanvasTools } from "./planning-canvas-tools.js";

export function PlanningCanvas({
  children,
  sections,
}: {
  readonly children: ReactNode;
  readonly sections: readonly string[];
}) {
  const camera = useCanvasCamera();
  const pointerFocus = useRef(false);
  const { viewport, world, move, fitting } = camera;
  const fit = useCallback(() => {
    const view = viewport.current;
    const content = world.current;
    if (!view?.clientWidth || !view.clientHeight || !content) return;
    const zoom = Math.min(
      1,
      (view.clientWidth - 48) / content.offsetWidth,
      (view.clientHeight - 48) / content.offsetHeight,
    );
    fitting.current = true;
    move({ x: 24, y: 24, zoom: Math.max(0.001, zoom) });
  }, [viewport, world, move, fitting]);
  const resize = usePlanningResize(camera, fit, children);
  const readingCamera = { ...camera, focus: resize.read };
  const gestures = usePlanningGestures(camera, fit);
  return (
    <>
      <div
        ref={viewport}
        className="plan-viewport planning-canvas"
        aria-label="Planning canvas"
        tabIndex={0}
        data-zoom={camera.camera.zoom}
        {...gestures}
        onPointerDownCapture={() => {
          pointerFocus.current = true;
        }}
        onPointerUpCapture={() => {
          pointerFocus.current = false;
        }}
        onPointerCancelCapture={() => {
          pointerFocus.current = false;
        }}
        onFocusCapture={(event) => {
          const target = event.target;
          if (target === event.currentTarget) return;
          const panel = target.closest<HTMLElement>("[data-planning-panel]");
          if (panel) {
            resize.select(panel);
            if (pointerFocus.current) return;
            resize.read(panel);
            requestAnimationFrame(() => {
              const view = viewport.current?.getBoundingClientRect();
              const bounds = target.getBoundingClientRect();
              if (view && bounds.bottom > view.bottom - 16)
                camera.pan(0, view.bottom - 16 - bounds.bottom);
            });
          }
        }}
        onClick={(event) => {
          const compare = (event.target as Element).closest(
            "[data-compare-examples]",
          );
          if (compare) {
            compareExamples(camera, compare);
            return;
          }
          const button = (event.target as Element).closest<HTMLElement>(
            "[data-read-panel], [data-read-target]",
          );
          const panel = button?.dataset.readTarget
            ? Array.from(
                world.current?.querySelectorAll<HTMLElement>(
                  "[data-planning-document]",
                ) ?? [],
              ).find(
                (candidate) =>
                  candidate.dataset.planningDocument ===
                  button.dataset.readTarget,
              )
            : button?.closest<HTMLElement>("[data-planning-panel]");
          if (panel) resize.read(panel);
        }}
      >
        <div
          ref={world}
          className="planning-world"
          style={{
            transform: `translate(${camera.camera.x}px, ${camera.camera.y}px) scale(${camera.camera.zoom})`,
          }}
        >
          {children}
        </div>
      </div>
      <PlanningCanvasTools
        camera={readingCamera}
        sections={sections}
        fit={fit}
      />
    </>
  );
}

function compareExamples(
  camera: ReturnType<typeof useCanvasCamera>,
  button: Element,
) {
  const panels = Array.from(
    button
      .closest(".planning-comparison")
      ?.querySelectorAll<HTMLElement>(".planning-artifact") ?? [],
  );
  const content = camera.world.current;
  const view = camera.viewport.current;
  if (!panels.length || !content || !view) return;
  const bounds = panels.map((panel) => ({
    ...elementPoint(panel, content),
    width: panel.offsetWidth,
  }));
  const left = Math.min(...bounds.map((b) => b.x));
  const right = Math.max(...bounds.map((b) => b.x + b.width));
  const top = Math.min(...bounds.map((b) => b.y));
  const zoom = Math.min(1, (view.clientWidth - 48) / (right - left));
  camera.fitting.current = false;
  camera.move({ x: 24 - left * zoom, y: 24 - top * zoom, zoom });
}
