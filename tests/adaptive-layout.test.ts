import { describe, expect, it } from "vite-plus/test";
import { wheelZoom, worldPoint, zoomCamera } from "../src/web/canvas-camera.js";

describe("continuous canvas camera", () => {
  it("keeps the point under the pointer through small deltas and former layout thresholds", () => {
    const point = { x: 287, y: 419 };
    let camera = { x: -321, y: 74, zoom: 0.25 };
    const original = worldPoint(camera, point);
    for (const zoom of [0.349, 0.351, 0.449, 0.451, 0.849, 0.851, 1, 0.2]) {
      camera = zoomCamera(camera, zoom, point);
      expect(worldPoint(camera, point).x).toBeCloseTo(original.x, 10);
      expect(worldPoint(camera, point).y).toBeCloseTo(original.y, 10);
    }
  });
  it("uses gesture magnitude and wheel units, with limits that preserve the anchor", () => {
    expect(wheelZoom(1, 0, 800)).toBeGreaterThan(wheelZoom(20, 0, 800));
    expect(wheelZoom(1, 1, 800)).toBe(wheelZoom(16, 0, 800));
    expect(wheelZoom(0.1, 2, 800)).toBe(wheelZoom(80, 0, 800));
    const camera = { x: 12, y: -15, zoom: 1 };
    const point = { x: 100, y: 150 };
    const next = zoomCamera(camera, 10, point);
    expect(next.zoom).toBe(2);
    expect(worldPoint(next, point)).toEqual(worldPoint(camera, point));
  });
});
