import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Camera } from "./canvas-camera.js";
import { elementPoint, type useCanvasCamera } from "./use-canvas-camera.js";

function measure(panel: HTMLElement, world: HTMLElement) {
  const focused = document.activeElement;
  const editor =
    focused instanceof HTMLElement &&
    panel.contains(focused) &&
    focused.closest("fieldset, .planning-compose")
      ? focused
      : undefined;
  return {
    panel,
    ...elementPoint(panel, world),
    width: panel.offsetWidth,
    height: panel.offsetHeight,
    editor,
    editorY: editor ? elementPoint(editor, world).y : undefined,
  };
}

export function usePlanningResize(
  camera: ReturnType<typeof useCanvasCamera>,
  fit: () => void,
  children: ReactNode,
) {
  const { viewport, world, current, move, fitting, focus } = camera;
  const overviewZoom = useRef<number | undefined>(undefined);
  const observerRef = useRef<ResizeObserver | undefined>(undefined);
  const refresh = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    if (!fitting.current) refresh.current?.();
  }, [children, fitting]);
  const selected = useRef<ReturnType<typeof measure> | undefined>(undefined);
  const select = useCallback(
    (panel: HTMLElement) => {
      overviewZoom.current = fitting.current ? current.current.zoom : undefined;
      fitting.current = false;
      const observer = observerRef.current;
      const previous = selected.current?.panel;
      if (previous) {
        observer?.unobserve(previous);
        const section = previous.closest(".planning-section");
        if (section) observer?.unobserve(section);
      }
      if (world.current) selected.current = measure(panel, world.current);
      observer?.observe(panel);
      const section = panel.closest(".planning-section");
      if (section) observer?.observe(section);
    },
    [world, current, fitting],
  );
  const read = useCallback(
    (panel: HTMLElement) => {
      focus(panel);
      select(panel);
    },
    [focus, select],
  );

  useLayoutEffect(() => {
    const view = viewport.current;
    const content = world.current;
    if (!view || !content) return;
    let width = view.clientWidth;
    let height = view.clientHeight;
    const track = () => {
      if (!view.clientWidth || !view.clientHeight) return;
      const resized =
        width !== view.clientWidth || height !== view.clientHeight;
      const previous = current.current;
      view.style.setProperty(
        "--planning-editor-height",
        `${Math.max(48, view.clientHeight / previous.zoom - 80)}px`,
      );
      const anchor = selected.current;
      if (fitting.current) fit();
      else if (resized && anchor?.panel.isConnected) {
        const next = measure(anchor.panel, content);
        move(
          resizedCamera(
            previous,
            anchor,
            next,
            view,
            content,
            overviewZoom.current === previous.zoom ? 1.1 : previous.zoom,
          ),
        );
      } else if (!resized && anchor?.panel.isConnected) {
        const next = measure(anchor.panel, content);
        const dy =
          next.editor && next.editor === anchor.editor
            ? (anchor.editorY ?? anchor.y) - (next.editorY ?? next.y)
            : anchor.y - next.y;
        const dx = anchor.x - next.x;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)
          move({
            ...previous,
            x: previous.x + dx * previous.zoom,
            y: previous.y + dy * previous.zoom,
          });
      } else if (resized) {
        // A manually positioned overview has no document to follow.
        fit();
      }
      if (resized) overviewZoom.current = undefined;
      width = view.clientWidth;
      height = view.clientHeight;
      if (anchor?.panel.isConnected)
        selected.current = measure(anchor.panel, content);
    };
    refresh.current = track;
    const observer = new ResizeObserver(track);
    observerRef.current = observer;
    observer.observe(view);
    observer.observe(content);
    return () => {
      refresh.current = undefined;
      observerRef.current = undefined;
      observer.disconnect();
    };
  }, [viewport, world, current, move, fitting, fit]);
  return { select, read };
}

function resizedCamera(
  previous: Camera,
  anchor: ReturnType<typeof measure>,
  next: ReturnType<typeof measure>,
  view: HTMLElement,
  content: HTMLElement,
  preferredZoom: number,
): Camera {
  const zoom = Math.min(
    preferredZoom,
    Math.max(1, view.clientWidth - 48) / next.width,
  );
  const reading = Math.max(
    0,
    Math.min(
      1,
      (24 - previous.y - anchor.y * previous.zoom) /
        (anchor.height * previous.zoom),
    ),
  );
  let y =
    reading > 0
      ? 24 - (next.y + reading * next.height) * zoom
      : previous.y + anchor.y * previous.zoom - next.y * zoom;
  if (
    next.editor &&
    next.editor === anchor.editor &&
    anchor.editorY !== undefined
  ) {
    y = previous.y + anchor.editorY * previous.zoom - next.editorY! * zoom;
    const actions = next.editor
      .closest("fieldset, .planning-compose")
      ?.querySelector<HTMLElement>(".planning-save-action");
    const bottom = actions
      ? elementPoint(actions, content).y + actions.offsetHeight
      : next.editorY! + next.editor.offsetHeight;
    y = Math.min(y, view.clientHeight - 8 - bottom * zoom);
    y = Math.max(y, 8 - next.editorY! * zoom);
  }
  return {
    x: view.clientWidth / 2 - (next.x + next.width / 2) * zoom,
    y,
    zoom,
  };
}
