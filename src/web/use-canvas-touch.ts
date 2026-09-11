import { useEffect, useRef, type RefObject } from "react";
import type { Point } from "./canvas-camera.js";

export function useCanvasTouch(
  viewport: RefObject<HTMLDivElement | null>,
  onPan: (x: number, y: number) => void,
  onScale: (factor: number, point?: Point) => void,
) {
  const container = useRef<HTMLDivElement>(null);
  const actions = useRef({ onPan, onScale });
  actions.current = { onPan, onScale };
  useEffect(() => {
    const element = viewport.current;
    let previous: { x: number; y: number; distance: number } | undefined;
    let selecting = false;
    const stop = () => {
      previous = undefined;
    };
    const point = (event: TouchEvent) => {
      const first = event.touches[0],
        second = event.touches[1];
      if (!first) return undefined;
      return {
        x: second ? (first.clientX + second.clientX) / 2 : first.clientX,
        y: second ? (first.clientY + second.clientY) / 2 : first.clientY,
        distance: second
          ? Math.hypot(
              first.clientX - second.clientX,
              first.clientY - second.clientY,
            )
          : 0,
      };
    };
    const begin = (event: TouchEvent) => {
      selecting = false;
      previous =
        (event.target as Element).closest(
          "button, a, input, textarea, select, summary, iframe, [contenteditable], [data-canvas-scroll]",
        ) && event.touches.length === 1
          ? undefined
          : point(event);
    };
    const move = (event: TouchEvent) => {
      if (selecting || window.getSelection()?.isCollapsed === false) {
        event.preventDefault();
        stop();
        return;
      }
      const next = point(event);
      if (!previous || !next || !element) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      if (previous.distance && next.distance) {
        actions.current.onScale(next.distance / previous.distance, {
          x: previous.x - bounds.left,
          y: previous.y - bounds.top,
        });
      }
      actions.current.onPan(next.x - previous.x, next.y - previous.y);
      previous = next;
    };
    const select = () => {
      selecting = true;
      stop();
    };
    element?.addEventListener("touchstart", begin);
    element?.addEventListener("touchmove", move, { passive: false });
    element?.addEventListener("selectstart", select);
    element?.addEventListener("touchend", stop);
    element?.addEventListener("touchcancel", stop);
    return () => {
      element?.removeEventListener("touchstart", begin);
      element?.removeEventListener("touchmove", move);
      element?.removeEventListener("selectstart", select);
      element?.removeEventListener("touchend", stop);
      element?.removeEventListener("touchcancel", stop);
    };
  }, [viewport]);
  return container;
}
