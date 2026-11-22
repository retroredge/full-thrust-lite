import { rollDie, type Rng } from './fire';
import { weaponLabel, type Ship, type ShipDesign } from './ship';

/**
 * Threshold checks for critical systems damage.
 *
 * When the hull damage from one ship's attack on a target reaches or passes
 * the end of a row of hull boxes, a die is rolled for each of the target's
 * systems (weapons, fire controls and drives). At the first row a system is
 * lost on a 1, at the second on 1–2, at the third on 1–3. If one attack
 * passes more than one row, only the worst row is rolled for, with 1 added.
 * Lost systems never work again. Completing the last row destroys the ship,
 * so it needs no check.
 */

/** One of a ship's systems that a threshold check can knock out. */
export interface ShipSystem {
  kind: 'weapon' | 'fireControl' | 'drive';
  /** Index among the ship's systems of that kind. */
  index: number;
}

/** The threshold an attack reached: the worst row completed, how many rows, and the highest roll that loses a system. */
export interface Threshold {
  /** The worst (highest) row completed, counting from 1. */
  row: number;
  /** How many rows the attack completed. */
  rows: number;
  /** A system is lost on this score or lower. */
  failOn: number;
}

/** The die rolled for one system in a threshold check. */
export interface SystemRoll {
  system: ShipSystem;
  roll: number;
  lost: boolean;
}

/**
 * The threshold reached when hull damage goes from `before` to `after`, or
 * null if no row was completed (or the last row was, which destroys the ship).
 */
export function thresholdFor(hullRows: readonly number[], before: number, after: number): Threshold | null {
  const completed: number[] = [];
  let end = 0;
  hullRows.forEach((count, index) => {
    end += count;
    const last = index === hullRows.length - 1;
    if (!last && end > before && end <= after) {
      completed.push(index + 1);
    }
  });
  if (completed.length === 0) {
    return null;
  }
  const row = Math.max(...completed);
  return { row, rows: completed.length, failOn: row + (completed.length > 1 ? 1 : 0) };
}

/** The ship's systems that still work: weapons in order, then fire controls, then drives. */
export function activeSystems(ship: Ship, design: ShipDesign): ShipSystem[] {
  const systems: ShipSystem[] = [];
  design.weapons.forEach((_, index) => {
    if (!ship.weaponsLost.includes(index)) {
      systems.push({ kind: 'weapon', index });
    }
  });
  for (let index = 0; index < design.fireControls; index += 1) {
    if (!ship.fireControlsLost.includes(index)) {
      systems.push({ kind: 'fireControl', index });
    }
  }
  ship.drives.forEach((drive, index) => {
    if (drive.functional) {
      systems.push({ kind: 'drive', index });
    }
  });
  return systems;
}

/** Rolls one die for each system; each is lost on `failOn` or lower. */
export function rollThreshold(systems: readonly ShipSystem[], failOn: number, rng: Rng): SystemRoll[] {
  return systems.map((system) => {
    const roll = rollDie(rng);
    return { system, roll, lost: roll <= failOn };
  });
}

/** The ship with the systems that failed their rolls knocked out. */
export function applyLosses(ship: Ship, rolls: readonly SystemRoll[]): Ship {
  const lost = rolls.filter((roll) => roll.lost).map((roll) => roll.system);
  const indexes = (kind: ShipSystem['kind']) => lost.filter((system) => system.kind === kind).map((system) => system.index);
  const drivesLost = indexes('drive');
  return {
    ...ship,
    weaponsLost: [...ship.weaponsLost, ...indexes('weapon')].sort((a, b) => a - b),
    fireControlsLost: [...ship.fireControlsLost, ...indexes('fireControl')].sort((a, b) => a - b),
    drives: ship.drives.map((drive, index) => (drivesLost.includes(index) ? { ...drive, functional: false } : drive)),
  };
}

/** A system's name, e.g. "Class 2 beam", "Fire control 1" or "Drive 2 (thrust 3)". */
export function systemLabel(design: ShipDesign, system: ShipSystem): string {
  if (system.kind === 'weapon') {
    const weapon = design.weapons[system.index];
    return weapon === undefined ? `Weapon ${system.index + 1}` : weaponLabel(weapon);
  }
  if (system.kind === 'fireControl') {
    return design.fireControls > 1 ? `Fire control ${system.index + 1}` : 'Fire control';
  }
  const drive = design.drives[system.index];
  const number = design.drives.length > 1 ? ` ${system.index + 1}` : '';
  return `Drive${number}${drive === undefined ? '' : ` (thrust ${drive.thrust})`}`;
}
