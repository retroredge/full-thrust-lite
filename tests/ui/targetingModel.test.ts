import { describe, expect, it } from 'vitest';
import { fireVolley, pass, startFirePhase } from '../../src/game/fire';
import type { GameState } from '../../src/game/state';
import { firedStatus, targetsFor, weaponChoices } from '../../src/ui/targetingModel';
import { CRUISER, dice, movedState, ship } from '../support/fireFixtures';

/** Red's cruiser R1 faces north, with blue's escorts B1 10 mu ahead and B3 off its aft starboard quarter. */
const redToFire = (): GameState =>
  startFirePhase(
    movedState([
      ship('R1', 'red', 'cruiser', 0, 0, 12),
      ship('B1', 'blue', 'escort', 0, -10, 6),
      ship('B3', 'blue', 'escort', 8, 6, 6),
    ]),
    dice(6, 1),
  );

describe('weaponChoices', () => {
  it('chooses every beam that bears, with its dice, and counts why the rest cannot fire', () => {
    const result = weaponChoices(CRUISER, [
      { kind: 'ok', dice: 3 },
      { kind: 'fired' },
      { kind: 'outOfRange' },
      { kind: 'outOfArc' },
    ]);
    expect(result.choices).toEqual([{ index: 0, kind: 'beam', dice: 3, label: 'Class 3 beam', selected: true }]);
    expect([...result.marks]).toEqual([
      [0, 'selected'],
      [1, 'fired'],
      [2, 'unavailable'],
      [3, 'unavailable'],
    ]);
    expect([...result.badges]).toEqual([[0, '3']]);
    expect(result.titles.get(0)).toBe('Class 3 beam: 3 dice at this range. Click to fire it or hold it back.');
    expect(result.titles.get(2)).toBe('Class 1 beam: out of range');
    expect(result.notes).toEqual(['1 already fired', '1 out of range', '1 out of arc']);
  });

  it('chooses a pulse torpedo that bears, showing the score it needs to hit', () => {
    const result = weaponChoices(CRUISER, [
      { kind: 'outOfArc' },
      { kind: 'outOfArc' },
      { kind: 'outOfArc' },
      { kind: 'ok', dice: 1, toHit: 4 },
    ]);
    expect(result.choices).toEqual([
      { index: 3, kind: 'torpedo', dice: 1, toHit: 4, label: 'Pulse torpedo launcher', selected: true },
    ]);
    expect(result.badges.get(3)).toBe('4+');
    expect(result.titles.get(3)).toBe('Pulse torpedo launcher: 4+ to hit at this range. Click to fire it or hold it back.');
  });

  it('adds up several weapons out of arc', () => {
    const result = weaponChoices(CRUISER, [{ kind: 'outOfArc' }, { kind: 'outOfArc' }, { kind: 'ok', dice: 1 }]);
    // The torpedo has no bearing given, so it counts as out of arc too.
    expect(result.notes).toEqual(['3 out of arc']);
    expect(result.titles.get(2)).toBe('Class 1 beam: 1 die at this range. Click to fire it or hold it back.');
  });
});

describe('firedStatus', () => {
  it('notes a ship that has already fired this turn, and says nothing otherwise', () => {
    const start = redToFire();
    expect(firedStatus(start, 'R1')).toBe('');
    const after = fireVolley(start, 'R1', 'B1', [0], dice(1, 1, 1)).next;
    expect(firedStatus(after, 'R1')).toBe('Has already fired this turn');
    expect(firedStatus(after, 'B1')).toBe('');
  });
});

describe('targetsFor', () => {
  it('lists the ships the shooter can fire at, with range, arc and how each weapon bears', () => {
    const targets = targetsFor(redToFire(), 'R1');
    expect(targets.map((target) => [target.ship.id, target.range, target.arc])).toEqual([
      ['B1', 10, 'F'],
      ['B3', 10, 'AS'],
    ]);
    expect(targets[1]!.bearings.map((bearing) => bearing.kind)).toEqual(['outOfArc', 'ok', 'ok', 'outOfArc']);
  });

  it('drops a ship already fired at, and is empty once the shooter has finished', () => {
    const first = fireVolley(redToFire(), 'R1', 'B1', [0], dice(1, 1, 1)).next;
    expect(targetsFor(first, 'R1').map((target) => target.ship.id)).toEqual(['B3']);
    const second = fireVolley(first, 'R1', 'B3', [1], dice(1, 1)).next;
    expect(targetsFor(second, 'R1')).toEqual([]);
  });

  it("is empty for a ship whose side isn't firing", () => {
    expect(targetsFor(redToFire(), 'B1')).toEqual([]);
    expect(targetsFor(pass(redToFire(), 'red'), 'R1')).toEqual([]);
  });
});
