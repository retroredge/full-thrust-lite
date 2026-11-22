import { describe, expect, it } from 'vitest';
import type { ShipSystem } from '../../src/rules/threshold';
import { thresholdGroups } from '../../src/ui/thresholdModel';

const roll = (kind: ShipSystem['kind'], index: number, lost = false) => ({
  system: { kind, index },
  label: `${kind} ${index + 1}`,
  roll: lost ? 1 : 5,
  lost,
});

describe('thresholdGroups', () => {
  it('groups the weapons, then the fire controls, then the drives, keeping their order', () => {
    const rolls = [
      roll('weapon', 0),
      roll('weapon', 2, true),
      roll('fireControl', 0),
      roll('fireControl', 1),
      roll('drive', 0, true),
      roll('drive', 1),
    ];
    expect(thresholdGroups(rolls).map((group) => [group.kind, group.rolls.map((r) => r.system.index)])).toEqual([
      ['weapon', [0, 2]],
      ['fireControl', [0, 1]],
      ['drive', [0, 1]],
    ]);
  });

  it('leaves out a kind with no working systems', () => {
    expect(thresholdGroups([roll('weapon', 0), roll('drive', 1)]).map((group) => group.kind)).toEqual(['weapon', 'drive']);
  });

  it('gives no groups for no rolls', () => {
    expect(thresholdGroups([])).toEqual([]);
  });
});
