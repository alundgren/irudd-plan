export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}
export interface Point {
  readonly x: number;
  readonly y: number;
}

export function zoomCamera(camera: Camera, zoom: number, point: Point): Camera {
  const next = Math.max(0.001, Math.min(2, zoom));
  const ratio = next / camera.zoom;
  return {
    x: point.x - (point.x - camera.x) * ratio,
    y: point.y - (point.y - camera.y) * ratio,
    zoom: next,
  };
}

export function worldPoint(camera: Camera, point: Point): Point {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function wheelZoom(delta: number, mode: number, height: number): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return Math.exp(-Math.max(-500, Math.min(500, pixels)) * 0.002);
}
