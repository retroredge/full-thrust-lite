import { courseToDegrees, type Vec2 } from './course';
import { ARCS, type Arc, type Ship, type ShipDesign, type WeaponDesign } from './ship';

/**
 * Weapons fire rules for beams and pulse torpedoes. Pure functions: dice come
 * from an injected random source so the game can use Math.random and tests can
 * script every roll.
 */

/** A source of random numbers in [0, 1), like Math.random. */
export type Rng = () => number;

/** Rolls one six-sided die. */
export function rollDie(rng: Rng): number {
  return Math.min(6, Math.floor(rng() * 6) + 1);
}

/** Width of each range band, in mu. */
export const RANGE_BAND = 12;

/**
 * Range from one ship to another, centre to centre, rounded to 0.1 mu. The
 * rounded value is both what the players see and what the dice are worked out
 * from, so a range shown as "12.0" never loses a die to floating point.
 */
export function fireRange(from: Vec2, to: Vec2): number {
  return Math.round(Math.hypot(to.x - from.x, to.y - from.y) * 10) / 10;
}

/** Dice a beam of this class rolls at this range: its class up to 12 mu, one fewer per further 12 mu. */
export function beamDice(beamClass: number, range: number): number {
  const extraBands = Math.max(0, Math.ceil(range / RANGE_BAND) - 1);
  return Math.max(0, beamClass - extraBands);
}

/** Furthest a pulse torpedo can reach, in mu. */
export const TORPEDO_RANGE = 30;
/** Each further band this wide adds 1 to the score a pulse torpedo needs to hit. */
export const TORPEDO_BAND = 6;

/**
 * Score a pulse torpedo needs to hit at this range: 2+ up to 6 mu, then 1
 * more per further 6 mu, so 6 at 24–30 mu. Null beyond 30 mu.
 */
export function torpedoToHit(range: number): number | null {
  if (range > TORPEDO_RANGE) {
    return null;
  }
  return Math.max(2, Math.ceil(range / TORPEDO_BAND) + 1);
}

/** Damage points from one beam die: 1–3 miss, 4–5 one point, 6 two. */
export function damageForDie(score: number): number {
  if (score >= 6) {
    return 2;
  }
  return score >= 4 ? 1 : 0;
}

/** Centre of each fire arc, in degrees clockwise from the ship's bow. */
export const ARC_CENTRES: Record<Arc, number> = { F: 0, FS: 60, AS: 120, A: 180, AP: 240, FP: 300 };

/** Slack on arc edges, in degrees, so a target exactly on a boundary counts for both arcs. */
const ARC_TOLERANCE = 0.05;

function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Bearing from a ship to a point, in degrees clockwise from the ship's bow. */
export function relativeBearing(ship: Pick<Ship, 'position' | 'course'>, point: Vec2): number {
  const dx = point.x - ship.position.x;
  const dy = point.y - ship.position.y;
  const absolute = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return wrapDegrees(absolute - courseToDegrees(ship.course));
}

/** True if a relative bearing lies in an arc (edges included). */
export function bearingInArc(relative: number, arc: Arc): boolean {
  const difference = Math.abs(wrapDegrees(relative - ARC_CENTRES[arc] + 180) - 180);
  return difference <= 30 + ARC_TOLERANCE;
}

/** The arc a point lies in from a ship. On an edge, the first arc clockwise from the bow wins. */
export function arcOf(ship: Pick<Ship, 'position' | 'course'>, point: Vec2): Arc {
  const relative = relativeBearing(ship, point);
  return ARCS.find((arc) => bearingInArc(relative, arc)) ?? 'A';
}

/** Arcs a weapon may actually fire through: no weapon ever fires through the aft arc. */
export function firingArcs(weapon: WeaponDesign): Arc[] {
  return weapon.arcs.filter((arc) => arc !== 'A');
}

/** True if the point is in one of the weapon's usable arcs from the ship. */
export function inWeaponArc(weapon: WeaponDesign, ship: Pick<Ship, 'position' | 'course'>, point: Vec2): boolean {
  const relative = relativeBearing(ship, point);
  return firingArcs(weapon).some((arc) => bearingInArc(relative, arc));
}

/** Why a weapon can or can't fire at a target. */
export type WeaponBearing =
  /** It can fire: a beam rolls `dice`; a pulse torpedo rolls one die and needs `toHit` or more. */
  | { kind: 'ok'; dice: number; toHit?: number }
  | { kind: 'fired' }
  | { kind: 'outOfArc' }
  | { kind: 'outOfRange' }
  /** Lost to a threshold check: it never fires again. */
  | { kind: 'knockedOut' };

/**
 * Whether one of a ship's weapons can fire at a target position this turn.
 * @param fired indexes of the ship's weapons already fired this turn
 */
export function weaponBearing(
  weapon: WeaponDesign,
  weaponIndex: number,
  ship: Pick<Ship, 'position' | 'course'>,
  target: Vec2,
  fired: readonly number[],
): WeaponBearing {
  if (fired.includes(weaponIndex)) {
    return { kind: 'fired' };
  }
  if (!inWeaponArc(weapon, ship, target)) {
    return { kind: 'outOfArc' };
  }
  const range = fireRange(ship.position, target);
  if (weapon.type === 'pulseTorpedo') {
    const toHit = torpedoToHit(range);
    return toHit === null ? { kind: 'outOfRange' } : { kind: 'ok', dice: 1, toHit };
  }
  const dice = beamDice(weapon.class ?? 0, range);
  return dice > 0 ? { kind: 'ok', dice } : { kind: 'outOfRange' };
}

/** One weapon's dice in a volley. */
export interface WeaponRoll {
  weaponIndex: number;
  rolls: number[];
  damage: number;
}

/** Rolls the dice for every weapon in a volley. All the beams fired at one target are rolled together. */
export function rollBeamVolley(weapons: readonly { weaponIndex: number; dice: number }[], rng: Rng): WeaponRoll[] {
  return weapons.map(({ weaponIndex, dice }) => {
    const rolls = Array.from({ length: dice }, () => rollDie(rng));
    return { weaponIndex, rolls, damage: rolls.reduce((total, score) => total + damageForDie(score), 0) };
  });
}

/** One pulse torpedo in a volley: its roll to hit and, if it hit, its damage roll. */
export interface TorpedoRoll {
  weaponIndex: number;
  /** Score needed to hit. */
  toHit: number;
  /** The to-hit die, or null if it was never rolled (launched at a ship the beams had already destroyed). */
  hitRoll: number | null;
  hit: boolean;
  /** The damage die for a hit, or null. */
  damageRoll: number | null;
  damage: number;
}

/**
 * Rolls a volley of pulse torpedoes: all the to-hit dice together, then one
 * damage die for each hit, in launcher order. The damage is the number rolled.
 */
export function rollTorpedoes(torpedoes: readonly { weaponIndex: number; toHit: number }[], rng: Rng): TorpedoRoll[] {
  const hitRolls = torpedoes.map(() => rollDie(rng));
  return torpedoes.map(({ weaponIndex, toHit }, index) => {
    const hitRoll = hitRolls[index]!;
    const hit = hitRoll >= toHit;
    const damageRoll = hit ? rollDie(rng) : null;
    return { weaponIndex, toHit, hitRoll, hit, damageRoll, damage: damageRoll ?? 0 };
  });
}

/** Torpedoes launched at a ship already destroyed by the beams: fired, but never rolled. */
export function wastedTorpedoes(torpedoes: readonly { weaponIndex: number; toHit: number }[]): TorpedoRoll[] {
  return torpedoes.map(({ weaponIndex, toHit }) => ({
    weaponIndex,
    toHit,
    hitRoll: null,
    hit: false,
    damageRoll: null,
    damage: 0,
  }));
}

/** Total hull boxes on a design. */
export function hullBoxes(design: Pick<ShipDesign, 'hullRows'>): number {
  return design.hullRows.reduce((total, count) => total + count, 0);
}

/** A ship's hull damage after taking some points, capped at its hull boxes, and whether that destroys it. */
export function applyHullDamage(
  ship: Pick<Ship, 'hullDamage'>,
  points: number,
  design: Pick<ShipDesign, 'hullRows'>,
): { hullDamage: number; destroyed: boolean } {
  const total = hullBoxes(design);
  const hullDamage = Math.min(total, ship.hullDamage + points);
  return { hullDamage, destroyed: hullDamage >= total };
}
