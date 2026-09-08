import type { FeedbackItem } from "./feedback.js";

export function canvasExtent(items: ReadonlyArray<FeedbackItem>) {
  const points = items.flatMap((item) =>
    item.target.kind === "canvas" ? [item.target] : [],
  );
  const left = Math.min(0, ...points.map((point) => point.x - 40));
  const top = Math.min(0, ...points.map((point) => point.y - 40));
  return {
    left,
    top,
    width: Math.max(0, ...points.map((point) => point.x - left + 300)),
    height: Math.max(0, ...points.map((point) => point.y - top + 300)),
  };
}
