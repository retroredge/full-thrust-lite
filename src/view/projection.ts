import type { Vec2 } from '../rules/course';

/** Size of the drawing surface in CSS pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/** Where the view is looking: a point on the game plane and a scale in pixels per mu. */
export interface Camera {
  centre: Vec2;
  zoom: number;
}

/** A rectangle on the game plane, in mu. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Maps between the flat game plane (mu) and the screen (pixels).
 *
 * Everything that needs to turn a world position into a screen position, or a
 * click into a world position, goes through this interface. The overhead view
 * is one implementation; an isometric or perspective view would be another,
 * with `screenToWorld` picking the point on the game plane under the cursor.
 */
export interface Projection {
  worldToScreen(point: Vec2, camera: Camera, viewport: Viewport): Vec2;
  screenToWorld(point: Vec2, camera: Camera, viewport: Viewport): Vec2;
  /** The camera that shows the whole of `bounds`, leaving `padding` pixels clear at each edge. */
  fit(bounds: Bounds, viewport: Viewport, padding: number): Camera;
}

/** Straight-down view: north is up and one mu is `camera.zoom` pixels in both directions. */
export class OverheadProjection implements Projection {
  worldToScreen(point: Vec2, camera: Camera, viewport: Viewport): Vec2 {
    return {
      x: (point.x - camera.centre.x) * camera.zoom + viewport.width / 2,
      y: (point.y - camera.centre.y) * camera.zoom + viewport.height / 2,
    };
  }

  screenToWorld(point: Vec2, camera: Camera, viewport: Viewport): Vec2 {
    return {
      x: (point.x - viewport.width / 2) / camera.zoom + camera.centre.x,
      y: (point.y - viewport.height / 2) / camera.zoom + camera.centre.y,
    };
  }

  fit(bounds: Bounds, viewport: Viewport, padding: number): Camera {
    const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
    const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
    const availableWidth = Math.max(viewport.width - padding * 2, 1);
    const availableHeight = Math.max(viewport.height - padding * 2, 1);
    return {
      centre: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      zoom: Math.min(availableWidth / width, availableHeight / height),
    };
  }
}
