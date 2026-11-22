import { describe, expect, it } from 'vitest';
import { availableThrust, maxTurnPoints, weaponLabel, type DriveState } from '../../src/rules/ship';

const drives = (...list: [number, boolean][]): { drives: DriveState[] } => ({
  drives: list.map(([thrust, functional]) => ({ thrust, functional })),
});

describe('availableThrust', () => {
  it('sums the thrust of every functioning drive', () => {
    expect(availableThrust(drives([6, true]))).toBe(6);
    expect(availableThrust(drives([3, true], [3, true]))).toBe(6);
    expect(availableThrust(drives([2, true], [4, true], [1, true]))).toBe(7);
  });

  it('ignores drives that are not functional', () => {
    expect(availableThrust(drives([3, true], [3, false]))).toBe(3);
    expect(availableThrust(drives([2, false], [4, true], [1, false]))).toBe(4);
  });

  it('is zero when every drive is out', () => {
    expect(availableThrust(drives([3, false], [3, false]))).toBe(0);
    expect(availableThrust(drives([6, false]))).toBe(0);
  });

  it('is zero with no drives at all', () => {
    expect(availableThrust({ drives: [] })).toBe(0);
  });
});

describe('maxTurnPoints', () => {
  it('is half the thrust rounded up', () => {
    const expected: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4 };
    for (const [thrust, max] of Object.entries(expected)) {
      expect(maxTurnPoints(Number(thrust))).toBe(max);
    }
  });

  it('allows 3 turn points with thrust 5', () => {
    expect(maxTurnPoints(5)).toBe(3);
  });
});

describe('weaponLabel', () => {
  it('names beams by class and pulse torpedoes by type', () => {
    expect(weaponLabel({ type: 'beam', class: 1, arcs: ['F'] })).toBe('Class 1 beam');
    expect(weaponLabel({ type: 'beam', class: 3, arcs: ['F'] })).toBe('Class 3 beam');
    expect(weaponLabel({ type: 'pulseTorpedo', arcs: ['F'] })).toBe('Pulse torpedo launcher');
  });
});
