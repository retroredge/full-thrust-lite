import { canFire, fireRecord, validTargets, weaponBearings } from '../game/fire';
import { designOf, findShip, type GameState } from '../game/state';
import { arcOf, fireRange, type WeaponBearing } from '../rules/fire';
import { weaponLabel, type Arc, type Ship, type ShipDesign } from '../rules/ship';
import type { WeaponMark } from './ssdPanel';
import { plural } from '../text';

/** A ship the shooter could fire at, as the targeting panels show it. */
export interface FireTarget {
  ship: Ship;
  design: ShipDesign;
  /** Range in mu, as used for the dice. */
  range: number;
  /** The shooter's arc the target is in. */
  arc: Arc;
  /** Whether each of the shooter's weapons can fire at this target, in weapon order. */
  bearings: WeaponBearing[];
}

/** A weapon that can fire at the current target, and whether the player has chosen it. */
export interface WeaponChoice {
  index: number;
  kind: 'beam' | 'torpedo';
  /** Dice it rolls: a beam's class dice at this range, or 1 to hit for a torpedo. */
  dice: number;
  /** Score a torpedo needs to hit at this range. */
  toHit?: number;
  label: string;
  selected: boolean;
}

/** How the shooter's weapons stand against one target. */
export interface WeaponChoices {
  /** Weapons that can fire at it, beams and torpedoes, all chosen to start with. */
  choices: WeaponChoice[];
  /** How to draw each weapon icon on the shooter's SSD. */
  marks: Map<number, WeaponMark>;
  /** The dice each available beam rolls, or the score a torpedo needs to hit, shown on its icon. */
  badges: Map<number, string>;
  /** Tooltip for each weapon icon. */
  titles: Map<number, string>;
  /** Why the other weapons can't fire, counted: e.g. "3 already fired". */
  notes: string[];
}

const REASONS: Record<Exclude<WeaponBearing['kind'], 'ok'>, string> = {
  fired: 'already fired',
  outOfArc: 'out of arc',
  outOfRange: 'out of range',
  knockedOut: 'knocked out',
};

export function weaponChoices(design: ShipDesign, bearings: readonly WeaponBearing[]): WeaponChoices {
  const result: WeaponChoices = { choices: [], marks: new Map(), badges: new Map(), titles: new Map(), notes: [] };
  const unavailable = new Map<string, number>();
  design.weapons.forEach((weapon, index) => {
    const bearing = bearings[index] ?? { kind: 'outOfArc' as const };
    const label = weaponLabel(weapon);
    if (bearing.kind === 'ok' && bearing.toHit !== undefined) {
      result.marks.set(index, 'selected');
      result.badges.set(index, `${bearing.toHit}+`);
      result.titles.set(index, `${label}: ${bearing.toHit}+ to hit at this range. Click to fire it or hold it back.`);
      result.choices.push({ index, kind: 'torpedo', dice: 1, toHit: bearing.toHit, label, selected: true });
    } else if (bearing.kind === 'ok') {
      const dice = `${bearing.dice} ${plural(bearing.dice, 'die', 'dice')}`;
      result.marks.set(index, 'selected');
      result.badges.set(index, String(bearing.dice));
      result.titles.set(index, `${label}: ${dice} at this range. Click to fire it or hold it back.`);
      result.choices.push({ index, kind: 'beam', dice: bearing.dice, label, selected: true });
    } else {
      const reason = REASONS[bearing.kind];
      result.marks.set(index, bearing.kind === 'fired' ? 'fired' : 'unavailable');
      result.titles.set(index, `${label}: ${reason}`);
      unavailable.set(reason, (unavailable.get(reason) ?? 0) + 1);
    }
  });
  result.notes = [...unavailable.entries()].map(([reason, count]) => `${count} ${reason}`);
  return result;
}

/** A note for a targeted ship's SSD if it has already fired this turn, or '' if it hasn't. */
export function firedStatus(state: GameState, shipId: string): string {
  return fireRecord(state, shipId).weaponsFired.length > 0 ? 'Has already fired this turn' : '';
}

/**
 * The ships `shooterId` can fire at now, with range, arc and how each weapon
 * bears. Empty once it has finished, or while another ship is part-way
 * through firing.
 */
export function targetsFor(state: GameState, shooterId: string): FireTarget[] {
  const phase = state.phase;
  const shooter = findShip(state, shooterId);
  const turnToFire =
    phase.kind === 'firing' &&
    shooter?.playerId === phase.playerId &&
    (phase.activeShipId === null || phase.activeShipId === shooterId);
  if (!turnToFire || shooter === undefined || !canFire(state, shooterId)) {
    return [];
  }
  return validTargets(state, shooter).map((ship) => ({
    ship,
    design: designOf(state, ship),
    range: fireRange(shooter.position, ship.position),
    arc: arcOf(shooter, ship.position),
    bearings: weaponBearings(state, shooter, ship),
  }));
}
