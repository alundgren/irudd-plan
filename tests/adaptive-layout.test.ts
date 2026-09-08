import { describe, expect, it } from "vite-plus/test";
import { layoutMode } from "../src/web/plan-canvas.js";
import { canvasExtent } from "../src/web/canvas-coordinates.js";
import type { FeedbackItem } from "../src/web/feedback.js";

describe("requested layout thresholds", () => {
  it("does not depend on measured content or viewport dimensions", () => {
    expect([0.02, 0.34999, 0.35, 0.84999, 0.85, 2].map(layoutMode)).toEqual([
      "overview",
      "overview",
      "sections",
      "sections",
      "reading",
      "reading",
    ]);
  });
  it("includes old negative and distant canvas notes without changing coordinates", () => {
    const notes = [
      { target: { kind: "canvas", x: -900, y: -500 } },
      { target: { kind: "canvas", x: 9000, y: 8000 } },
    ] as FeedbackItem[];
    const before = JSON.stringify(notes);
    const bounds = canvasExtent(notes);
    expect(bounds).toEqual({
      left: -940,
      top: -540,
      width: 10240,
      height: 8840,
    });
    expect(JSON.stringify(notes)).toBe(before);
  });
});
