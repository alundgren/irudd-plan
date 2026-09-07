import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";

export function useCanvasTouch() {
  const flow = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    let start:
      | { x: number; y: number; viewport: ReturnType<typeof flow.getViewport> }
      | undefined;
    const stop = () => {
      start = undefined;
    };
    const begin = (event: TouchEvent) => {
      const point = event.touches[0];
      start =
        event.touches.length === 1 &&
        point !== undefined &&
        !(event.target as Element).closest(
          "button, a, input, textarea, select, iframe, [contenteditable]",
        )
          ? { x: point.clientX, y: point.clientY, viewport: flow.getViewport() }
          : undefined;
    };
    const pan = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        window.getSelection()?.isCollapsed === false
      )
        stop();
      const point = event.touches[0];
      if (start === undefined || point === undefined) return;
      event.preventDefault();
      void flow.setViewport({
        ...start.viewport,
        x: start.viewport.x + point.clientX - start.x,
        y: start.viewport.y + point.clientY - start.y,
      });
    };
    element?.addEventListener("touchstart", begin);
    element?.addEventListener("touchmove", pan, { passive: false });
    element?.addEventListener("selectstart", stop);
    element?.addEventListener("touchend", stop);
    element?.addEventListener("touchcancel", stop);
    return () => {
      element?.removeEventListener("touchstart", begin);
      element?.removeEventListener("touchmove", pan);
      element?.removeEventListener("selectstart", stop);
      element?.removeEventListener("touchend", stop);
      element?.removeEventListener("touchcancel", stop);
    };
  }, [flow]);
  return container;
}
