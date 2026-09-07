import {
  getViewportForBounds,
  Panel,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import type { CanvasTool } from "./canvas-comments.js";

export function CanvasTools({
  tool,
  onTool,
  onAddCanvas,
}: {
  readonly tool: CanvasTool;
  readonly onTool: (tool: CanvasTool) => void;
  readonly onAddCanvas: (point: { x: number; y: number }) => void;
}) {
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const zoom = useStore((state) => state.transform[2]);
  return (
    <>
      <Panel position="top-right" className="canvas-hint">
        {tool === "comment"
          ? "Click anywhere to leave a comment"
          : "Drag to pan · Scroll to move · Ctrl + scroll to zoom"}
      </Panel>
      <Panel
        position="bottom-center"
        className="canvas-tools"
        role="toolbar"
        aria-label="Canvas tools"
      >
        <button
          type="button"
          aria-label="Comment"
          aria-pressed={tool === "comment"}
          onClick={() => onTool("comment")}
        >
          Comment <kbd>C</kbd>
        </button>
        <button
          type="button"
          aria-label="Pan"
          aria-pressed={tool === "pan"}
          onClick={() => onTool("pan")}
        >
          Pan <kbd>V</kbd>
        </button>
        <span className="tool-divider" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => void flow.zoomTo(zoom / 1.2)}
        >
          −
        </button>
        <button
          type="button"
          title="Reset to 100%"
          onClick={() => void flow.zoomTo(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => void flow.zoomTo(zoom * 1.2)}
        >
          +
        </button>
        <button
          type="button"
          title="Fit all sheets"
          onClick={() =>
            void flow.setViewport(
              getViewportForBounds(
                flow.getNodesBounds(flow.getNodes()),
                width,
                height,
                0.02,
                1,
                0.12,
              ),
            )
          }
        >
          Fit
        </button>
        <button
          type="button"
          className="keyboard-comment"
          onClick={() => {
            const view = flow.getViewport();
            onAddCanvas({
              x: (width / 2 - view.x) / view.zoom,
              y: (height / 2 - view.y) / view.zoom,
            });
          }}
        >
          Comment on canvas center
        </button>
      </Panel>
    </>
  );
}
