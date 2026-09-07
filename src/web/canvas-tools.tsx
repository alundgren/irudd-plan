import type { CanvasTool } from "./canvas-comments.js";
import type { LayoutMode } from "./plan-canvas.js";

export function CanvasTools({
  tool,
  onTool,
  zoom,
  mode,
  onZoom,
  onFit,
  onAddCanvas,
}: {
  readonly tool: CanvasTool;
  readonly onTool: (tool: CanvasTool) => void;
  readonly zoom: number;
  readonly mode: LayoutMode;
  readonly onZoom: (zoom: number) => void;
  readonly onFit: () => void;
  readonly onAddCanvas: () => void;
}) {
  return (
    <div className="canvas-tools" role="toolbar" aria-label="Canvas tools">
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
        disabled={mode === "overview"}
        onClick={() => onZoom(zoom / 1.2)}
      >
        −
      </button>
      <button type="button" title="Reset to 100%" onClick={() => onZoom(1)}>
        {mode === "overview" ? "Overview" : `${Math.round(zoom * 100)}%`}
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        disabled={zoom === 2}
        onClick={() => onZoom(zoom * 1.2)}
      >
        +
      </button>
      <button type="button" title="Fit complete overview" onClick={onFit}>
        Fit
      </button>
      <button type="button" className="keyboard-comment" onClick={onAddCanvas}>
        Comment on canvas center
      </button>
    </div>
  );
}
