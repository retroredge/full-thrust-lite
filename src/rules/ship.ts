import type { Vec2 } from './course';

export type Arc = 'F' | 'FS' | 'AS' | 'A' | 'AP' | 'FP';
export const ARCS: readonly Arc[] = ['F', 'FS', 'AS', 'A', 'AP', 'FP'];

/** Each arc's name in plain English, e.g. "fore starboard". */
export const ARC_NAMES: Record<Arc, string> = {
  F: 'fore',
  FS: 'fore starboard',
  AS: 'aft starboard',
  A: 'aft',
  AP: 'aft port',
  FP: 'fore port',
};

export type WeaponType = 'beam' | 'pulseTorpedo';

export interface WeaponDesign {
  type: WeaponType;
  /** Beam class (1 to 3). Not used for pulse torpedoes. */
  class?: number;
  /** Arcs the weapon can fire through. */
  arcs: Arc[];
}

export interface DriveDesign {
  thrust: number;
}

/**
 * How big a ship's systems display is drawn, from 1 (smallest) to 5. Every
 * ship shares one outline, drawn bigger for each larger class: 1 for a
 * frigate up to 5 for the battlecruiser. The system icons are the same size
 * on all of them.
 */
export type SsdSize = 1 | 2 | 3 | 4 | 5;
export const SSD_SIZES: readonly SsdSize[] = [1, 2, 3, 4, 5];

/** How a design's ship systems display (SSD) is laid out. */
export interface SsdDesign {
  size: SsdSize;
  /** How many weapons sit side by side in each row, bow first, taking the weapons in order. */
  weaponRows: number[];
}

export interface ShipDesign {
  /** The class within its fleet, e.g. "frigate". */
  id: string;
  /** The fleet record sheet the design comes from, e.g. "red" or "green". The same class differs between fleets. */
  fleet: string;
  className: string;
  /** Naval shorthand for the class, e.g. "FF" for a frigate or "BC" for a battlecruiser. */
  code: string;
  /** Top-down image used on the map, relative to the assets folder. */
  sprite: string;
  /** Length of the ship on the map, in mu. Purely cosmetic. */
  length: number;
  drives: DriveDesign[];
  /** Number of hull boxes in each row, top row first. */
  hullRows: number[];
  fireControls: number;
  weapons: WeaponDesign[];
  ssd: SsdDesign;
}

export interface DriveState {
  thrust: number;
  functional: boolean;
}

export interface Ship {
  id: string;
  designId: string;
  playerId: string;
  name: string;
  position: Vec2;
  course: number;
  velocity: number;
  drives: DriveState[];
  /** Hull boxes crossed off, counted from the top row, left to right. */
  hullDamage: number;
  /** Indexes of weapons knocked out by threshold checks; they never work again. */
  weaponsLost: number[];
  /** Indexes of fire control systems knocked out by threshold checks. */
  fireControlsLost: number[];
}

/** A weapon's name, e.g. "Class 2 beam". */
export function weaponLabel(weapon: WeaponDesign): string {
  return weapon.type === 'beam' ? `Class ${weapon.class} beam` : 'Pulse torpedo launcher';
}

/** Total thrust from the drives that are still working. */
export function availableThrust(ship: Pick<Ship, 'drives'>): number {
  return ship.drives.reduce((total, drive) => total + (drive.functional ? drive.thrust : 0), 0);
}

/** Most thrust points that may go on course changes: half the total, rounded up. */
export function maxTurnPoints(thrust: number): number {
  return Math.ceil(thrust / 2);
}
