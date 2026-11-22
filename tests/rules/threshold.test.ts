import { describe, expect, it } from 'vitest';
import { activeSystems, applyLosses, rollThreshold, systemLabel, thresholdFor } from '../../src/rules/threshold';
import { CRUISER, dice, ship } from '../support/fireFixtures';

describe('thresholdFor', () => {
  // A destroyer's hull: rows end at boxes 3, 5, 7 and 9.
  const rows = [3, 2, 2, 2];

  it('is null until a row is completed', () => {
    expect(thresholdFor(rows, 0, 2)).toBeNull();
    expect(thresholdFor(rows, 0, 0)).toBeNull();
  });

  it('loses systems on 1 at the first row, 1–2 at the second and 1–3 at the third', () => {
    expect(thresholdFor(rows, 0, 3)).toEqual({ row: 1, rows: 1, failOn: 1 });
    expect(thresholdFor(rows, 3, 5)).toEqual({ row: 2, rows: 1, failOn: 2 });
    expect(thresholdFor(rows, 6, 7)).toEqual({ row: 3, rows: 1, failOn: 3 });
  });

  it('rolls only for the worst row, with 1 added, when one attack completes several', () => {
    expect(thresholdFor(rows, 0, 5)).toEqual({ row: 2, rows: 2, failOn: 3 });
    expect(thresholdFor(rows, 2, 8)).toEqual({ row: 3, rows: 3, failOn: 4 });
  });

  it('follows the heavy cruiser example in the rules', () => {
    const heavyCruiser = [5, 5, 4, 4];
    expect(thresholdFor(heavyCruiser, 0, 6)).toEqual({ row: 1, rows: 1, failOn: 1 });
    // A later hit of 8 more completes rows 2 and 3: systems are lost on 1 to 4.
    expect(thresholdFor(heavyCruiser, 6, 14)).toEqual({ row: 3, rows: 2, failOn: 4 });
  });

  it('ignores rows completed before, and the last row, which destroys the ship', () => {
    expect(thresholdFor(rows, 3, 4)).toBeNull();
    expect(thresholdFor(rows, 7, 9)).toBeNull();
    expect(thresholdFor(rows, 5, 9)).toEqual({ row: 3, rows: 1, failOn: 3 });
  });
});

describe('activeSystems', () => {
  it('lists weapons, then fire controls, then drives', () => {
    expect(activeSystems(ship('R1', 'red', 'cruiser', 0, 0), CRUISER)).toEqual([
      { kind: 'weapon', index: 0 },
      { kind: 'weapon', index: 1 },
      { kind: 'weapon', index: 2 },
      { kind: 'weapon', index: 3 },
      { kind: 'fireControl', index: 0 },
      { kind: 'fireControl', index: 1 },
      { kind: 'drive', index: 0 },
    ]);
  });

  it('leaves out systems already lost', () => {
    const damaged = {
      ...ship('R1', 'red', 'cruiser', 0, 0),
      weaponsLost: [1],
      fireControlsLost: [0],
      drives: [{ thrust: 4, functional: false }],
    };
    expect(activeSystems(damaged, CRUISER)).toEqual([
      { kind: 'weapon', index: 0 },
      { kind: 'weapon', index: 2 },
      { kind: 'weapon', index: 3 },
      { kind: 'fireControl', index: 1 },
    ]);
  });
});

describe('rollThreshold and applyLosses', () => {
  const systems = [
    { kind: 'weapon', index: 2 },
    { kind: 'fireControl', index: 1 },
    { kind: 'drive', index: 0 },
  ] as const;

  it('loses a system on the fail number or lower', () => {
    expect(rollThreshold(systems, 2, dice(2, 3, 1)).map((roll) => [roll.roll, roll.lost])).toEqual([
      [2, true],
      [3, false],
      [1, true],
    ]);
  });

  it('knocks out the lost systems on a copy of the ship', () => {
    const before = { ...ship('R1', 'red', 'cruiser', 0, 0), weaponsLost: [3] };
    const after = applyLosses(before, rollThreshold(systems, 6, dice(1, 1, 1)));
    expect(after.weaponsLost).toEqual([2, 3]);
    expect(after.fireControlsLost).toEqual([1]);
    expect(after.drives).toEqual([{ thrust: 4, functional: false }]);
    expect(before.weaponsLost).toEqual([3]);
    expect(before.drives).toEqual([{ thrust: 4, functional: true }]);
  });
});

describe('systemLabel', () => {
  it('names weapons, fire controls and drives', () => {
    expect(systemLabel(CRUISER, { kind: 'weapon', index: 0 })).toBe('Class 3 beam');
    expect(systemLabel(CRUISER, { kind: 'weapon', index: 3 })).toBe('Pulse torpedo launcher');
    expect(systemLabel(CRUISER, { kind: 'fireControl', index: 1 })).toBe('Fire control 2');
    expect(systemLabel(CRUISER, { kind: 'drive', index: 0 })).toBe('Drive (thrust 4)');
  });
});
