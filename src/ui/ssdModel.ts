import type { ShipDesign, SsdSize } from '../rules/ship';

/**
 * Where everything goes on a ship systems display (SSD). Every ship shares
 * one hull outline, a simplified battlecruiser from the rules' record sheet,
 * drawn bigger for each larger class, from size 1 for a frigate to 5 for the
 * battlecruiser. The system icons are the same size on every ship, so a
 * bigger ship looks bigger. All measurements are in pixels at full size.
 */

/** Diameter of a weapon icon. */
export const WEAPON_SIZE = 40;
/** Side of a fire control icon. */
export const FIRE_CONTROL_SIZE = 17;
/** Spacing of the hull boxes; each box is drawn a little smaller than this. */
export const HULL_BOX = 22;
/** Width of a drive icon. */
export const DRIVE_SIZE = 45;
/** How far a drive icon, box and nozzle together, reaches above and below its centre. */
export const DRIVE_REACH = DRIVE_SIZE * 0.6375;

/** Width and height of the outline at each size, all in the same proportions. */
export const SSD_DIMENSIONS: Record<SsdSize, { width: number; height: number }> = {
  1: { width: 211, height: 330 },
  2: { width: 230, height: 360 },
  3: { width: 250, height: 392 },
  4: { width: 273, height: 428 },
  5: { width: 300, height: 470 },
};

/** The tallest SSD. When the panel is too short, every SSD is shrunk by the same factor that fits this one. */
export const LARGEST_SSD_HEIGHT = SSD_DIMENSIONS[5].height;

/**
 * The right-hand half of the outline, bow first, as [distance from the centre
 * line, depth], each a fraction of the outline's width and height: a tapered
 * bow, a broad forward section, a pinched waist, flared midships, a wide stern
 * and a stepped tail for the drives.
 */
const OUTLINE_HALF: readonly (readonly [number, number])[] = [
  [0.11, 0],
  [0.36, 0.29],
  [0.36, 0.4],
  [0.34, 0.45],
  [0.27, 0.47],
  [0.27, 0.52],
  [0.32, 0.55],
  [0.37, 0.64],
  [0.49, 0.7],
  [0.49, 0.86],
  [0.34, 0.89],
  [0.25, 0.95],
  [0.22, 1],
];

export interface Point {
  x: number;
  y: number;
}

/** The outline's corners, clockwise from the bow, for an SSD of this size. */
export function outlinePoints(width: number, height: number): Point[] {
  const right = OUTLINE_HALF.map(([dx, y]) => ({ x: width / 2 + dx * width, y: y * height }));
  const left = [...OUTLINE_HALF].reverse().map(([dx, y]) => ({ x: width / 2 - dx * width, y: y * height }));
  return [...right, ...left];
}

/** The outline as SVG path data. */
export function outlinePath(width: number, height: number): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  return `M${outlinePoints(width, height)
    .map((point) => `${round(point.x)} ${round(point.y)}`)
    .join(' L')} Z`;
}

/** Where each of a ship's systems is drawn on its SSD. */
export interface SsdLayout {
  width: number;
  height: number;
  /** Centre of each weapon icon, in weapon order. */
  weapons: Point[];
  /** Centre of each fire control icon. */
  fireControls: Point[];
  /** Top-left corner of the hull box grid. */
  hull: Point;
  /** Centre of each drive icon, nozzle included. */
  drives: Point[];
}

/** Centres for `count` icons in a row, `pitch` apart, centred on `centre`. */
function row(count: number, pitch: number, centre: number, y: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({ x: centre + (index - (count - 1) / 2) * pitch, y }));
}

/**
 * Lays out a design's SSD from the bow down: the weapons in the rows the
 * design gives, just behind the bow taper; then the fire controls; then the
 * hull boxes, each row centred on the widest. The drives sit in the tail.
 */
export function layoutSsd(design: ShipDesign): SsdLayout {
  const { width, height } = SSD_DIMENSIONS[design.ssd.size];
  const centre = width / 2;

  let top = height * 0.13;
  const weapons: Point[] = [];
  for (const count of design.ssd.weaponRows) {
    weapons.push(...row(count, WEAPON_SIZE + 10, centre, top + WEAPON_SIZE / 2));
    top += WEAPON_SIZE + 6;
  }

  top += 2;
  const fireControls = row(design.fireControls, FIRE_CONTROL_SIZE + 9, centre, top + FIRE_CONTROL_SIZE / 2);
  top += FIRE_CONTROL_SIZE + 10;

  const widest = Math.max(...design.hullRows);
  // Each box is 90% of the spacing, so the grid is nudged right by half the gap to sit centred.
  const hull = { x: centre - (widest * HULL_BOX) / 2 + HULL_BOX * 0.05, y: top };

  const drives = row(design.drives.length, DRIVE_SIZE + 8, centre, height - 8 - DRIVE_REACH);

  return { width, height, weapons, fireControls, hull, drives };
}
