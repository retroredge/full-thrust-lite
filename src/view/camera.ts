import type { Vec2 } from '../rules/course';
import type { Bounds, Camera, Projection, Viewport } from './projection';

/**
 * Zoom limits in pixels per mu. The map has no edges, so the lower limit is
 * set far enough out that Fit all can frame fleets thousands of mu apart.
 */
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 80;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zooms by `factor` while keeping the world point under `screenPoint` fixed on screen. */
export function zoomAbout(camera: Camera, viewport: Viewport, projection: Projection, screenPoint: Vec2, factor: number): Camera {
  const before = projection.screenToWorld(screenPoint, camera, viewport);
  const zoomed: Camera = { centre: camera.centre, zoom: clampZoom(camera.zoom * factor) };
  const after = projection.screenToWorld(screenPoint, zoomed, viewport);
  return {
    centre: { x: camera.centre.x + before.x - after.x, y: camera.centre.y + before.y - after.y },
    zoom: zoomed.zoom,
  };
}

/** Moves the view so the world point that was under `from` ends up under `to` (a drag). */
export function panByScreen(camera: Camera, viewport: Viewport, projection: Projection, from: Vec2, to: Vec2): Camera {
  const start = projection.screenToWorld(from, camera, viewport);
  const end = projection.screenToWorld(to, camera, viewport);
  return {
    centre: { x: camera.centre.x + start.x - end.x, y: camera.centre.y + start.y - end.y },
    zoom: camera.zoom,
  };
}

export function centreOn(camera: Camera, point: Vec2): Camera {
  return { centre: { ...point }, zoom: camera.zoom };
}

/** The camera that shows all of `bounds`, kept within the zoom limits. */
export function fitCamera(projection: Projection, bounds: Bounds, viewport: Viewport, padding: number): Camera {
  const fitted = projection.fit(bounds, viewport, padding);
  return { centre: fitted.centre, zoom: clampZoom(fitted.zoom) };
}

/** Grows `bounds` evenly about its centre so it is at least `minWidth` by `minHeight` mu. */
export function withMinimumSize(bounds: Bounds, minWidth: number, minHeight: number): Bounds {
  const extraX = Math.max(0, minWidth - (bounds.maxX - bounds.minX)) / 2;
  const extraY = Math.max(0, minHeight - (bounds.maxY - bounds.minY)) / 2;
  return {
    minX: bounds.minX - extraX,
    minY: bounds.minY - extraY,
    maxX: bounds.maxX + extraX,
    maxY: bounds.maxY + extraY,
  };
}

/** A circle on the game plane, in mu. */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Smallest rectangle containing every circle in full, or null if there are none. */
export function boundsOfCircles(circles: readonly Circle[]): Bounds | null {
  if (circles.length === 0) {
    return null;
  }
  return {
    minX: Math.min(...circles.map((circle) => circle.x - circle.radius)),
    minY: Math.min(...circles.map((circle) => circle.y - circle.radius)),
    maxX: Math.max(...circles.map((circle) => circle.x + circle.radius)),
    maxY: Math.max(...circles.map((circle) => circle.y + circle.radius)),
  };
}

/**
 * The camera part-way from `from` to `to`, `t` running from 0 to 1 (already
 * eased, if wanted). The zoom is interpolated on its logarithm, so zooming in
 * and out feel equally quick.
 */
export function interpolateCamera(from: Camera, to: Camera, t: number): Camera {
  return {
    centre: {
      x: from.centre.x + (to.centre.x - from.centre.x) * t,
      y: from.centre.y + (to.centre.y - from.centre.y) * t,
    },
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t),
  };
}
