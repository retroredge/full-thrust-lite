import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDesign } from '../../src/data/loader';
import type { ShipDesign } from '../../src/rules/ship';
import {
  DRIVE_REACH,
  DRIVE_SIZE,
  FIRE_CONTROL_SIZE,
  HULL_BOX,
  SSD_DIMENSIONS,
  WEAPON_SIZE,
  layoutSsd,
  outlinePath,
  outlinePoints,
  type Point,
} from '../../src/ui/ssdModel';

const load = (key: string): ShipDesign =>
  parseDesign(JSON.parse(readFileSync(new URL(`../../public/data/designs/${key}.json`, import.meta.url), 'utf8')), key);

const CLASSES = ['frigate', 'destroyer', 'light-cruiser', 'heavy-cruiser', 'battlecruiser'];
const DESIGNS = ['red', 'green'].flatMap((fleet) => CLASSES.map((id) => `${fleet}/${id}`));

/** True if a point is inside a polygon (even-odd rule). */
function inside(polygon: Point[], point: Point): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result;
    }
  }
  return result;
}

interface Box {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boxAround = (name: string, centre: Point, halfWidth: number, halfHeight = halfWidth): Box => ({
  name,
  left: centre.x - halfWidth,
  top: centre.y - halfHeight,
  right: centre.x + halfWidth,
  bottom: centre.y + halfHeight,
});

/** Every icon's bounding box, and the hull grid's. */
function boxes(design: ShipDesign): Box[] {
  const layout = layoutSsd(design);
  const widest = Math.max(...design.hullRows);
  return [
    ...layout.weapons.map((at, index) => boxAround(`weapon ${index + 1}`, at, WEAPON_SIZE / 2)),
    ...layout.fireControls.map((at, index) => boxAround(`fire control ${index + 1}`, at, FIRE_CONTROL_SIZE / 2)),
    {
      name: 'hull',
      left: layout.hull.x,
      top: layout.hull.y,
      right: layout.hull.x + widest * HULL_BOX,
      bottom: layout.hull.y + design.hullRows.length * HULL_BOX,
    },
    ...layout.drives.map((at, index) => boxAround(`drive ${index + 1}`, at, DRIVE_SIZE / 2, DRIVE_REACH)),
  ];
}

describe('the SSD outline', () => {
  it('is symmetrical, as wide and tall as its size, and the same shape at every size', () => {
    for (const { width, height } of Object.values(SSD_DIMENSIONS)) {
      const points = outlinePoints(width, height);
      expect(Math.min(...points.map((p) => p.x))).toBeGreaterThanOrEqual(0);
      expect(Math.max(...points.map((p) => p.x))).toBeLessThanOrEqual(width);
      expect(Math.min(...points.map((p) => p.y))).toBe(0);
      expect(Math.max(...points.map((p) => p.y))).toBe(height);
      for (const point of points) {
        expect(points.some((other) => Math.abs(other.x - (width - point.x)) < 1e-9 && other.y === point.y)).toBe(true);
      }
      expect(width / height).toBeCloseTo(SSD_DIMENSIONS[5].width / SSD_DIMENSIONS[5].height, 2);
    }
    expect(outlinePath(100, 200)).toMatch(/^M61 0 L86 58 .* Z$/);
  });

  it('is drawn larger at each size, 1 to 5', () => {
    const heights = [1, 2, 3, 4, 5].map((size) => SSD_DIMENSIONS[size as 1].height);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(new Set(heights).size).toBe(5);
  });

  it('gives each class in a fleet its own size, larger for each bigger class', () => {
    for (const fleet of ['red', 'green']) {
      expect(CLASSES.map((id) => load(`${fleet}/${id}`).ssd.size)).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe('layoutSsd', () => {
  it('puts the weapons in the rows the design gives, each row centred', () => {
    const layout = layoutSsd(load('red/battlecruiser'));
    const rows = [...new Set(layout.weapons.map((at) => at.y))];
    expect(rows).toHaveLength(4);
    expect(rows.map((y) => layout.weapons.filter((at) => at.y === y).length)).toEqual([2, 2, 1, 2]);
    for (const y of rows) {
      const xs = layout.weapons.filter((at) => at.y === y).map((at) => at.x);
      expect(xs.reduce((sum, x) => sum + x, 0) / xs.length).toBeCloseTo(layout.width / 2);
    }
  });

  it('keeps every system the same size on every ship, so only the outline grows', () => {
    const small = layoutSsd(load('red/frigate'));
    const large = layoutSsd(load('red/battlecruiser'));
    expect(large.width).toBeGreaterThan(small.width);
    // The weapons in a pair are the same distance apart on both.
    const pair = (layout: typeof small) => {
      const [a, b] = layout.weapons.filter((at, _, all) => all.filter((other) => other.y === at.y).length === 2);
      return b!.x - a!.x;
    };
    expect(pair(small)).toBe(pair(large));
  });

  for (const key of DESIGNS) {
    describe(key, () => {
      const design = load(key);
      const layout = layoutSsd(design);
      const outline = outlinePoints(layout.width, layout.height);
      const all = boxes(design);

      it('fits every system inside the hull outline', () => {
        for (const box of all) {
          for (const corner of [
            { x: box.left, y: box.top },
            { x: box.right, y: box.top },
            { x: box.left, y: box.bottom },
            { x: box.right, y: box.bottom },
          ]) {
            expect(inside(outline, corner), `${box.name} corner at ${corner.x}, ${corner.y}`).toBe(true);
          }
        }
      });

      it('lets no two systems overlap', () => {
        for (const [index, a] of all.entries()) {
          for (const b of all.slice(index + 1)) {
            const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
            expect(apart, `${a.name} and ${b.name}`).toBe(true);
          }
        }
      });
    });
  }
});
