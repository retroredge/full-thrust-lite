import { describe, expect, it } from 'vitest';
import {
  applyHullDamage,
  arcOf,
  beamDice,
  damageForDie,
  fireRange,
  hullBoxes,
  inWeaponArc,
  relativeBearing,
  rollBeamVolley,
  rollTorpedoes,
  torpedoToHit,
  wastedTorpedoes,
  rollDie,
  weaponBearing,
} from '../../src/rules/fire';
import type { Arc } from '../../src/rules/ship';
import { beam, dice } from '../support/fireFixtures';

const at = (x: number, y: number, course = 12) => ({ position: { x, y }, course });

/** A point 10 mu away on a clock bearing (12 north, 3 east), measured on the map. */
const onClock = (hour: number) => {
  const radians = (hour * 30 * Math.PI) / 180;
  return { x: Math.sin(radians) * 10, y: -Math.cos(radians) * 10 };
};

describe('rollDie', () => {
  it('turns the random source into faces 1 to 6', () => {
    expect([0, 0.17, 0.34, 0.5, 0.67, 0.84, 0.9999].map((value) => rollDie(() => value))).toEqual([1, 2, 3, 4, 5, 6, 6]);
  });
});

describe('fireRange', () => {
  it('measures centre to centre, rounded to 0.1 mu', () => {
    expect(fireRange({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(fireRange({ x: 0, y: 0 }, { x: 12.000000001, y: 0 })).toBe(12);
    expect(fireRange({ x: 1, y: 1 }, { x: 1 + 18.44, y: 1 })).toBe(18.4);
  });
});

describe('beamDice', () => {
  it('rolls its class up to 12 mu and one die fewer per further 12 mu', () => {
    const table = [0, 6, 12, 12.1, 24, 24.1, 36, 36.1].map((range) => [1, 2, 3].map((beamClass) => beamDice(beamClass, range)));
    expect(table).toEqual([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [0, 1, 2],
      [0, 1, 2],
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 0],
    ]);
  });
});

describe('damageForDie', () => {
  it('scores 1-3 as a miss, 4-5 as one point and 6 as two', () => {
    expect([1, 2, 3, 4, 5, 6].map(damageForDie)).toEqual([0, 0, 0, 1, 1, 2]);
  });
});

describe('fire arcs', () => {
  it('measures bearings clockwise from the bow', () => {
    expect(relativeBearing(at(0, 0, 12), { x: 0, y: -5 })).toBeCloseTo(0);
    expect(relativeBearing(at(0, 0, 12), { x: 5, y: 0 })).toBeCloseTo(90);
    expect(relativeBearing(at(0, 0, 3), { x: 5, y: 0 })).toBeCloseTo(0);
    expect(relativeBearing(at(0, 0, 3), { x: 0, y: 5 })).toBeCloseTo(90);
  });

  it('splits the clock into six arcs relative to the ship', () => {
    // Ship on course 12: the arcs line up with the map clock.
    const expected: Record<number, Arc> = { 12: 'F', 2: 'FS', 4: 'AS', 6: 'A', 8: 'AP', 10: 'FP' };
    for (const [hour, arc] of Object.entries(expected)) {
      expect(arcOf(at(0, 0, 12), onClock(Number(hour)))).toBe(arc);
    }
    // Ship on course 3: a target due north is off its port bow.
    expect(arcOf(at(0, 0, 3), onClock(12))).toBe('AP');
    expect(arcOf(at(0, 0, 3), onClock(3))).toBe('F');
    expect(arcOf(at(0, 0, 9), onClock(3))).toBe('A');
  });

  it('counts a target exactly on an arc edge as in both arcs', () => {
    const edge = onClock(1); // between F and FS for a ship on course 12
    expect(inWeaponArc(beam(1, ['F']), at(0, 0), edge)).toBe(true);
    expect(inWeaponArc(beam(1, ['FS']), at(0, 0), edge)).toBe(true);
    expect(inWeaponArc(beam(1, ['AS']), at(0, 0), edge)).toBe(false);
  });

  it('never fires through the aft arc, even if the design lists it', () => {
    expect(inWeaponArc(beam(1, ['A', 'AS']), at(0, 0), onClock(6))).toBe(false);
    expect(inWeaponArc(beam(1, ['A', 'AS']), at(0, 0), onClock(4))).toBe(true);
  });
});

describe('weaponBearing', () => {
  const ship = at(0, 0, 12);
  it('gives the dice for a beam in arc and range', () => {
    expect(weaponBearing(beam(3, ['F']), 0, ship, { x: 0, y: -18 }, [])).toEqual({ kind: 'ok', dice: 2 });
  });
  it('explains why a weapon cannot fire', () => {
    expect(weaponBearing(beam(3, ['F']), 0, ship, { x: 0, y: -18 }, [0])).toEqual({ kind: 'fired' });
    expect(weaponBearing(beam(3, ['F']), 0, ship, { x: 18, y: 0 }, [])).toEqual({ kind: 'outOfArc' });
    expect(weaponBearing(beam(1, ['F']), 0, ship, { x: 0, y: -12.1 }, [])).toEqual({ kind: 'outOfRange' });
    expect(weaponBearing({ type: 'pulseTorpedo', arcs: ['F'] }, 0, ship, { x: 0, y: -30.1 }, [])).toEqual({ kind: 'outOfRange' });
  });
});

describe('pulse torpedoes', () => {
  const ship = at(0, 0, 12);
  const torpedo = { type: 'pulseTorpedo' as const, arcs: ['F' as const] };

  it('needs 2+ to hit up to 6 mu, 1 more per further 6 mu, and reaches 30 mu', () => {
    expect([0, 6, 6.1, 12, 12.1, 18, 20, 24, 24.1, 30].map(torpedoToHit)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(torpedoToHit(30.1)).toBeNull();
  });

  it('bears on a target in its arc and range, rolling one die that needs the to-hit score', () => {
    expect(weaponBearing(torpedo, 0, ship, { x: 0, y: -20 }, [])).toEqual({ kind: 'ok', dice: 1, toHit: 5 });
    expect(weaponBearing(torpedo, 0, ship, { x: 20, y: 0 }, [])).toEqual({ kind: 'outOfArc' });
    expect(weaponBearing(torpedo, 0, ship, { x: 0, y: -20 }, [0])).toEqual({ kind: 'fired' });
  });

  it('rolls all the to-hit dice first, then a damage die for each hit: the example in the rules', () => {
    // A battlecruiser fires two torpedoes at 20 mu (5+ to hit): it rolls 4 and 6, then 3 for the hit's damage.
    const rolls = rollTorpedoes(
      [
        { weaponIndex: 0, toHit: 5 },
        { weaponIndex: 1, toHit: 5 },
      ],
      dice(4, 6, 3),
    );
    expect(rolls).toEqual([
      { weaponIndex: 0, toHit: 5, hitRoll: 4, hit: false, damageRoll: null, damage: 0 },
      { weaponIndex: 1, toHit: 5, hitRoll: 6, hit: true, damageRoll: 3, damage: 3 },
    ]);
  });

  it('records torpedoes launched at a ship already destroyed as fired but never rolled', () => {
    expect(wastedTorpedoes([{ weaponIndex: 2, toHit: 3 }])).toEqual([
      { weaponIndex: 2, toHit: 3, hitRoll: null, hit: false, damageRoll: null, damage: 0 },
    ]);
  });
});

describe('rollBeamVolley', () => {
  it('matches the example in the rules: 2 class 2s and a class 3 at 18 mu roll 1, 2, 4, 6 for 3 damage', () => {
    const weapons = [2, 2, 3].map((beamClass, weaponIndex) => ({ weaponIndex, dice: beamDice(beamClass, 18) }));
    expect(weapons.reduce((total, weapon) => total + weapon.dice, 0)).toBe(4);
    const rolls = rollBeamVolley(weapons, dice(1, 2, 4, 6));
    expect(rolls).toEqual([
      { weaponIndex: 0, rolls: [1], damage: 0 },
      { weaponIndex: 1, rolls: [2], damage: 0 },
      { weaponIndex: 2, rolls: [4, 6], damage: 3 },
    ]);
  });
});

describe('hull damage', () => {
  it('counts the boxes in every row', () => {
    expect(hullBoxes({ hullRows: [5, 5, 4, 4] })).toBe(18);
  });
  it('adds damage and destroys the ship when every box is gone, never going past the last box', () => {
    const rows = { hullRows: [2, 2] };
    expect(applyHullDamage({ hullDamage: 0 }, 3, rows)).toEqual({ hullDamage: 3, destroyed: false });
    expect(applyHullDamage({ hullDamage: 3 }, 1, rows)).toEqual({ hullDamage: 4, destroyed: true });
    expect(applyHullDamage({ hullDamage: 3 }, 5, rows)).toEqual({ hullDamage: 4, destroyed: true });
    expect(applyHullDamage({ hullDamage: 1 }, 0, rows)).toEqual({ hullDamage: 1, destroyed: false });
  });
});
