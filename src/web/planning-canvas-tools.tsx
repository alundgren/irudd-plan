import type { useCanvasCamera } from "./use-canvas-camera.js";

export function PlanningCanvasTools({
  camera,
  sections,
  fit,
}: {
  readonly camera: ReturnType<typeof useCanvasCamera>;
  readonly sections: readonly string[];
  readonly fit: () => void;
}) {
  const { world } = camera;
  return (
    <div
      className="canvas-tools"
      role="toolbar"
      aria-label="Planning canvas tools"
    >
      <select
        aria-label="Go to planning section"
        value=""
        onChange={(event) => {
          const section = Array.from(
            world.current?.querySelectorAll<HTMLElement>(
              "[data-planning-section]",
            ) ?? [],
          ).find(
            (element) => element.dataset.planningSection === event.target.value,
          );
          const panel = section?.querySelector<HTMLElement>(
            "[data-planning-panel]",
          );
          if (panel) camera.focus(panel);
        }}
      >
        <option value="" disabled>
          Go to section
        </option>
        {sections.map((section) => (
          <option key={section}>{section}</option>
        ))}
      </select>
      <span className="planning-pan-hint">Drag background to pan</span>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => camera.zoom(camera.camera.zoom / 1.2)}
      >
        −
      </button>
      <button
        type="button"
        title="Reset to 100%"
        onClick={() => camera.zoom(1)}
      >
        {Math.round(camera.camera.zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => camera.zoom(camera.camera.zoom * 1.2)}
      >
        +
      </button>
      <button type="button" onClick={fit}>
        Fit
      </button>
      <button
        type="button"
        onClick={() => {
          const panel =
            world.current?.querySelector<HTMLElement>(".planning-compose");
          if (panel) {
            camera.focus(panel);
            panel.querySelector("textarea")?.focus({ preventScroll: true });
          }
        }}
      >
        Add a thought
      </button>
    </div>
  );
}
