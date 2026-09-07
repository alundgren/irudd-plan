import { useEffect, useRef, type RefObject } from "react";

export function useCanvasTouch(viewport: RefObject<HTMLDivElement | null>) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    let start: { x: number; y: number; left: number; top: number } | undefined;
    let selecting = false;
    const stop = () => {
      start = undefined;
    };
    const begin = (event: TouchEvent) => {
      selecting = false;
      const point = event.touches[0];
      start =
        event.touches.length === 1 &&
        point !== undefined &&
        !(event.target as Element).closest(
          "button, a, input, textarea, select, iframe, [contenteditable]",
        )
          ? {
              x: point.clientX,
              y: point.clientY,
              left: viewport.current?.scrollLeft ?? 0,
              top: viewport.current?.scrollTop ?? 0,
            }
          : undefined;
    };
    const pan = (event: TouchEvent) => {
      if (selecting || window.getSelection()?.isCollapsed === false) {
        event.preventDefault();
        stop();
        return;
      }
      if (
        event.touches.length !== 1 ||
        window.getSelection()?.isCollapsed === false
      )
        stop();
      const point = event.touches[0];
      if (start === undefined || point === undefined) return;
      event.preventDefault();
      viewport.current?.scrollTo(
        start.left + start.x - point.clientX,
        start.top + start.y - point.clientY,
      );
    };
    element?.addEventListener("touchstart", begin);
    element?.addEventListener("touchmove", pan, { passive: false });
    const select = () => {
      selecting = true;
      stop();
    };
    element?.addEventListener("selectstart", select);
    element?.addEventListener("touchend", stop);
    element?.addEventListener("touchcancel", stop);
    return () => {
      element?.removeEventListener("touchstart", begin);
      element?.removeEventListener("touchmove", pan);
      element?.removeEventListener("selectstart", select);
      element?.removeEventListener("touchend", stop);
      element?.removeEventListener("touchcancel", stop);
    };
  }, [viewport]);
  return container;
}
