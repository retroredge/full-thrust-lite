import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../src/rules/course';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  boundsOfCircles,
  centreOn,
  clampZoom,
  fitCamera,
  interpolateCamera,
  panByScreen,
  zoomAbout,
} from '../../src/view/camera';
import { OverheadProjection, type Bounds, type Camera, type Viewport } from '../../src/view/projection';

const projection = new OverheadProjection();
const viewport: Viewport = { width: 800, height: 600 };
const camera: Camera = { centre: { x: 36, y: 24 }, zoom: 10 };

function expectPoint(actual: Vec2, expected: Vec2) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('OverheadProjection', () => {
  it('maps the camera centre to the middle of the viewport', () => {
    expectPoint(projection.worldToScreen(camera.centre, camera, viewport), { x: 400, y: 300 });
    expectPoint(projection.screenToWorld({ x: 400, y: 300 }, camera, viewport), camera.centre);
  });

  it('scales by zoom with north up and east right', () => {
    expectPoint(projection.worldToScreen({ x: 37, y: 24 }, camera, viewport), { x: 410, y: 300 });
    expectPoint(projection.worldToScreen({ x: 36, y: 23 }, camera, viewport), { x: 400, y: 290 });
  });

  it('round-trips world points through the screen', () => {
    const cameras: Camera[] = [camera, { centre: { x: -12.5, y: 700 }, zoom: 2.3 }, { centre: { x: 0, y: 0 }, zoom: 80 }];
    const points: Vec2[] = [
      { x: 0, y: 0 },
      { x: 36.7, y: -4.2 },
      { x: -1000, y: 333.3 },
    ];
    for (const cam of cameras) {
      for (const point of points) {
        expectPoint(projection.screenToWorld(projection.worldToScreen(point, cam, viewport), cam, viewport), point);
      }
    }
  });

  it('fits bounds inside the viewport with padding, centred', () => {
    const bounds: Bounds = { minX: 0, minY: 0, maxX: 72, maxY: 48 };
    const padding = 20;
    const fitted = projection.fit(bounds, viewport, padding);
    expectPoint(fitted.centre, { x: 36, y: 24 });

    const topLeft = projection.worldToScreen({ x: bounds.minX, y: bounds.minY }, fitted, viewport);
    const bottomRight = projection.worldToScreen({ x: bounds.maxX, y: bounds.maxY }, fitted, viewport);
    expect(topLeft.x).toBeGreaterThanOrEqual(padding - 1e-6);
    expect(topLeft.y).toBeGreaterThanOrEqual(padding - 1e-6);
    expect(bottomRight.x).toBeLessThanOrEqual(viewport.width - padding + 1e-6);
    expect(bottomRight.y).toBeLessThanOrEqual(viewport.height - padding + 1e-6);
    // Equal margins left and right, top and bottom.
    expect(topLeft.x).toBeCloseTo(viewport.width - bottomRight.x);
    expect(topLeft.y).toBeCloseTo(viewport.height - bottomRight.y);
    // One axis touches the padding exactly: the fit is as tight as possible.
    const touches = Math.abs(topLeft.x - padding) < 1e-6 || Math.abs(topLeft.y - padding) < 1e-6;
    expect(touches).toBe(true);
  });

  it('fits a single point without dividing by zero', () => {
    const fitted = projection.fit({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, viewport, 10);
    expect(Number.isFinite(fitted.zoom)).toBe(true);
    expectPoint(fitted.centre, { x: 5, y: 5 });
  });
});

describe('clampZoom', () => {
  it('keeps zoom within the limits', () => {
    expect(clampZoom(MIN_ZOOM / 2)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM * 2)).toBe(MAX_ZOOM);
    expect(clampZoom(10)).toBe(10);
  });
});

describe('zoomAbout', () => {
  const cursors: Vec2[] = [
    { x: 400, y: 300 },
    { x: 120, y: 45 },
    { x: 790, y: 590 },
  ];

  it('keeps the world point under the cursor fixed', () => {
    for (const cursor of cursors) {
      for (const factor of [1.25, 0.8, 3]) {
        const before = projection.screenToWorld(cursor, camera, viewport);
        const zoomed = zoomAbout(camera, viewport, projection, cursor, factor);
        expect(zoomed.zoom).toBeCloseTo(camera.zoom * factor);
        expectPoint(projection.screenToWorld(cursor, zoomed, viewport), before);
        expectPoint(projection.worldToScreen(before, zoomed, viewport), cursor);
      }
    }
  });

  it('respects the zoom limits and still keeps the cursor point fixed', () => {
    const cursor = cursors[1]!;
    const before = projection.screenToWorld(cursor, camera, viewport);
    const zoomedIn = zoomAbout(camera, viewport, projection, cursor, 1000);
    expect(zoomedIn.zoom).toBe(MAX_ZOOM);
    expectPoint(projection.screenToWorld(cursor, zoomedIn, viewport), before);

    const zoomedOut = zoomAbout(camera, viewport, projection, cursor, 0.001);
    expect(zoomedOut.zoom).toBe(MIN_ZOOM);
    expectPoint(projection.screenToWorld(cursor, zoomedOut, viewport), before);
  });

  it('does not change the camera it was given', () => {
    const original = structuredClone(camera);
    zoomAbout(camera, viewport, projection, { x: 10, y: 10 }, 2);
    expect(camera).toEqual(original);
  });
});

describe('panByScreen', () => {
  it('moves the grabbed world point to the new screen point', () => {
    const from = { x: 200, y: 150 };
    const to = { x: 260, y: 90 };
    const grabbed = projection.screenToWorld(from, camera, viewport);
    const panned = panByScreen(camera, viewport, projection, from, to);
    expect(panned.zoom).toBe(camera.zoom);
    expectPoint(projection.worldToScreen(grabbed, panned, viewport), to);
    // Dragging right by 60 px at 10 px/mu moves the view 6 mu west.
    expectPoint(panned.centre, { x: 30, y: 30 });
  });

  it('does nothing when the pointer has not moved', () => {
    const panned = panByScreen(camera, viewport, projection, { x: 5, y: 5 }, { x: 5, y: 5 });
    expectPoint(panned.centre, camera.centre);
  });
});

describe('centreOn', () => {
  it('moves the centre and keeps the zoom', () => {
    const point = { x: -3, y: 7 };
    const centred = centreOn(camera, point);
    expect(centred).toEqual({ centre: { x: -3, y: 7 }, zoom: 10 });
    point.x = 100;
    expect(centred.centre.x).toBe(-3);
  });
});

describe('fitCamera', () => {
  it('matches the projection fit when the zoom is in range', () => {
    const bounds = { minX: 0, minY: 0, maxX: 72, maxY: 48 };
    expect(fitCamera(projection, bounds, viewport, 20)).toEqual(projection.fit(bounds, viewport, 20));
  });

  it('clamps the zoom for tiny bounds', () => {
    const fitted = fitCamera(projection, { minX: 0, minY: 0, maxX: 0.1, maxY: 0.1 }, viewport, 0);
    expect(fitted.zoom).toBe(MAX_ZOOM);
    expectPoint(fitted.centre, { x: 0.05, y: 0.05 });
  });

  it('clamps the zoom for huge bounds', () => {
    const fitted = fitCamera(projection, { minX: 0, minY: 0, maxX: 100000, maxY: 100000 }, viewport, 0);
    expect(fitted.zoom).toBe(MIN_ZOOM);
    expectPoint(fitted.centre, { x: 50000, y: 50000 });
  });
});

describe('withMinimumSize', () => {
  it('grows a small rectangle evenly about its centre', async () => {
    const { withMinimumSize } = await import('../../src/view/camera');
    expect(withMinimumSize({ minX: 10, minY: 10, maxX: 12, maxY: 14 }, 10, 8)).toEqual({
      minX: 6,
      minY: 8,
      maxX: 16,
      maxY: 16,
    });
  });

  it('leaves a rectangle that is already large enough unchanged', async () => {
    const { withMinimumSize } = await import('../../src/view/camera');
    const bounds = { minX: 0, minY: 0, maxX: 50, maxY: 40 };
    expect(withMinimumSize(bounds, 10, 8)).toEqual(bounds);
  });
});

describe('fitting fleets far apart', () => {
  it('shows ships thousands of mu apart, as the map has no edges', () => {
    const projection = new OverheadProjection();
    const viewport = { width: 1000, height: 560 };
    const ships = [
      { x: -1500, y: 200 },
      { x: 1500, y: -300 },
      { x: 20, y: 1800 },
    ];
    const camera = fitCamera(projection, boundsOfCircles(ships.map((ship) => ({ ...ship, radius: 3 })))!, viewport, 70);
    expect(camera.zoom).toBeGreaterThan(MIN_ZOOM);
    for (const ship of ships) {
      const screen = projection.worldToScreen(ship, camera, viewport);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(viewport.width);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(viewport.height);
    }
  });
});

describe('boundsOfCircles', () => {
  it('returns null for no circles', () => {
    expect(boundsOfCircles([])).toBeNull();
  });

  it("contains every circle in full, so each ship's whole ring fits", () => {
    expect(
      boundsOfCircles([
        { x: -30, y: 0, radius: 3.4 },
        { x: 30, y: -15, radius: 1.86 },
        { x: 30, y: 15, radius: 1.86 },
      ]),
    ).toEqual({ minX: -33.4, minY: -16.86, maxX: 31.86, maxY: 16.86 });
  });

  it('treats a zero radius as a point', () => {
    expect(boundsOfCircles([{ x: 2, y: 3, radius: 0 }])).toEqual({ minX: 2, minY: 3, maxX: 2, maxY: 3 });
  });
});

describe('interpolateCamera', () => {
  const from: Camera = { centre: { x: 0, y: 0 }, zoom: 1 };
  const to: Camera = { centre: { x: 10, y: -20 }, zoom: 100 };

  it('starts at the first camera and ends at the second', () => {
    expect(interpolateCamera(from, to, 0)).toEqual(from);
    const end = interpolateCamera(from, to, 1);
    expectPoint(end.centre, to.centre);
    expect(end.zoom).toBeCloseTo(100, 6);
  });

  it('moves the centre in a straight line', () => {
    expectPoint(interpolateCamera(from, to, 0.25).centre, { x: 2.5, y: -5 });
  });

  it('zooms evenly on a log scale, so halfway between 1 and 100 is 10', () => {
    expect(interpolateCamera(from, to, 0.5).zoom).toBeCloseTo(10, 6);
  });
});
