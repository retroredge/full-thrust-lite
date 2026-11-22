import { describe, expect, it } from 'vitest';
import { BATTLE_AREA_RANGE, outOfReach } from '../../src/rules/battleArea';

const at = (playerId: string, x: number, y: number) => ({ playerId, position: { x, y } });

describe('outOfReach', () => {
  it('is 144 mu', () => {
    expect(BATTLE_AREA_RANGE).toBe(144);
  });

  it('is true when every enemy ship is more than 144 mu away', () => {
    const ship = at('red', 0, 0);
    expect(outOfReach(ship, [ship, at('blue', 150, 0), at('blue', 0, -200)])).toBe(true);
  });

  it('is false when any enemy ship is within 144 mu, measured centre to centre', () => {
    const ship = at('red', 0, 0);
    expect(outOfReach(ship, [ship, at('blue', 150, 0), at('blue', 100, 100)])).toBe(false);
  });

  it('counts an enemy exactly 144 mu away as in reach', () => {
    const ship = at('red', 10, 10);
    expect(outOfReach(ship, [ship, at('blue', 10, 154)])).toBe(false);
    expect(outOfReach(ship, [ship, at('blue', 10, 154.01)])).toBe(true);
  });

  it('ignores ships on its own side', () => {
    const ship = at('red', 0, 0);
    expect(outOfReach(ship, [ship, at('red', 1, 0), at('blue', 200, 0)])).toBe(true);
  });

  it('is false when there are no enemy ships', () => {
    const ship = at('red', 0, 0);
    expect(outOfReach(ship, [ship, at('red', 500, 0)])).toBe(false);
  });
});
