import { useCallback, useRef, useState } from "react";
import {
  type Camera,
  type Point,
  worldPoint,
  zoomCamera,
} from "./canvas-camera.js";

export function elementPoint(element: HTMLElement, world: HTMLElement): Point {
  const bounds = element.getBoundingClientRect();
  const origin = world.getBoundingClientRect();
  const scale = new DOMMatrixReadOnly(getComputedStyle(world).transform).a;
  return {
    x: (bounds.left - origin.left) / scale,
    y: (bounds.top - origin.top) / scale,
  };
}

export function useCanvasCamera() {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [camera, render] = useState<Camera>({ x: 24, y: 24, zoom: 1 });
  const current = useRef(camera);
  const fitting = useRef(true);
  const move = useCallback((next: Camera) => {
    current.current = next;
    render(next);
  }, []);
  const pan = useCallback(
    (x: number, y: number) => {
      fitting.current = false;
      move({
        ...current.current,
        x: current.current.x + x,
        y: current.current.y + y,
      });
    },
    [move],
  );
  const zoom = useCallback(
    (value: number, point?: Point) => {
      const view = viewport.current;
      if (!view) return;
      fitting.current = false;
      move(
        zoomCamera(
          current.current,
          value,
          point ?? {
            x: view.clientWidth / 2,
            y: view.clientHeight / 2,
          },
        ),
      );
    },
    [move],
  );
  const toWorld = useCallback(
    (point: Point) => worldPoint(current.current, point),
    [],
  );
  const focus = useCallback(
    (element: HTMLElement, position?: Point) => {
      const view = viewport.current;
      if (!view) return;
      element.closest("details")?.setAttribute("open", "");
      if (!world.current) return;
      fitting.current = false;
      const point = elementPoint(element, world.current);
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const nextZoom = Math.min(
        1.1,
        Math.max(1, view.clientWidth - 48) / Math.min(width, 640),
      );
      move({
        x:
          view.clientWidth / 2 -
          (point.x + width * (position?.x ?? 0.5)) * nextZoom,
        y: 24 - (point.y + height * (position?.y ?? 0)) * nextZoom,
        zoom: nextZoom,
      });
    },
    [move],
  );
  const fit = useCallback(() => {
    const view = viewport.current,
      content = world.current;
    if (!view || !content) return;
    const bounds = Array.from(
      content.querySelectorAll<HTMLElement>(
        ".item-frame, .overview-sheet, [data-canvas-pin]",
      ),
    ).map((element) => ({
      ...elementPoint(element, content),
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
    fitting.current = true;
    const left = Math.min(0, ...bounds.map((b) => b.x));
    const top = Math.min(0, ...bounds.map((b) => b.y));
    const width = Math.max(1, ...bounds.map((b) => b.x + b.width)) - left;
    const height = Math.max(1, ...bounds.map((b) => b.y + b.height)) - top;
    const scale = Math.min(
      1,
      Math.max(1, view.clientWidth - 48) / width,
      Math.max(1, view.clientHeight - 48) / height,
    );
    move({
      x: (view.clientWidth - width * scale) / 2 - left * scale,
      y: (view.clientHeight - height * scale) / 2 - top * scale,
      zoom: scale,
    });
  }, [move]);
  return {
    fitting,
    viewport,
    world,
    camera,
    current,
    move,
    pan,
    zoom,
    toWorld,
    focus,
    fit,
  };
}
