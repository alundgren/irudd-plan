import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Mobile keyboards can resize only the visual viewport, leaving 100dvh unchanged.
export function usePlanningViewport() {
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      const element = ref.current;
      if (!element || element.getClientRects().length === 0) return;
      setHeight(
        Math.max(
          0,
          viewport.height -
            Math.max(
              0,
              element.getBoundingClientRect().top - viewport.offsetTop,
            ),
        ),
      );
    };
    const observer = new ResizeObserver(resize);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    resize();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (
      focused instanceof HTMLTextAreaElement &&
      ref.current?.contains(focused)
    )
      focused.scrollIntoView({ block: "nearest" });
  }, [height]);
  return { ref, height };
}
