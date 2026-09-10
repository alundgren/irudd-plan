import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { wheelZoom } from "./canvas-camera.js";
import type { useCanvasCamera } from "./use-canvas-camera.js";
import { useCanvasTouch } from "./use-canvas-touch.js";

export function usePlanningGestures(
  camera: ReturnType<typeof useCanvasCamera>,
  fit: () => void,
) {
  const { viewport, pan, zoom, current } = camera;
  useCanvasTouch(viewport, pan, (factor, point) =>
    zoom(current.current.zoom * factor, point),
  );
  useEffect(() => {
    const view = viewport.current;
    const wheel = (event: WheelEvent) => {
      if (
        !view ||
        (event.target as Element).closest(
          "textarea, input, select, .planning-source-content, pre",
        )
      )
        return;
      event.preventDefault();
      if (event.shiftKey) {
        const unit =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? view.clientHeight
              : 1;
        pan(-event.deltaX * unit, -event.deltaY * unit);
      } else {
        const rect = view.getBoundingClientRect();
        zoom(
          current.current.zoom *
            wheelZoom(event.deltaY, event.deltaMode, view.clientHeight),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
        );
      }
    };
    view?.addEventListener("wheel", wheel, { passive: false });
    return () => view?.removeEventListener("wheel", wheel);
  }, [viewport, pan, zoom, current]);
  const drag = useRef<{ x: number; y: number; id: number } | undefined>(
    undefined,
  );
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch" || ![0, 1].includes(event.button))
        return;
      const target = event.target as Element;
      if (
        target.closest(
          "button, a, textarea, input, select, summary, iframe, [contenteditable]",
        )
      )
        return;
      if (event.button === 0 && target.closest("[data-planning-panel]")) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      pan(event.clientX - start.x, event.clientY - start.y);
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
      };
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
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
        pan(...moves[event.key]!);
      }
      if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        zoom(current.current.zoom * (event.key === "-" ? 1 / 1.2 : 1.2));
      }
      if (event.key === "Home") {
        event.preventDefault();
        fit();
      }
    },
  };
}
