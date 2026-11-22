import { describe, expect, it } from 'vitest';
import type { Ship } from '../../src/rules/ship';
import { cycleShip } from '../../src/ui/shipCycle';

const makeShip = (id: string, playerId: string): Ship => ({
  id,
  designId: 'destroyer',
  playerId,
  name: `${id} name`,
  position: { x: 0, y: 0 },
  course: 12,
  velocity: 0,
  drives: [],
  hullDamage: 0,
  weaponsLost: [],
  fireControlsLost: [],
});

// The fleets are interleaved, as they can be in a scenario's ship list.
const SHIPS: Ship[] = [
  makeShip('R1', 'red'),
  makeShip('B1', 'blue'),
  makeShip('R2', 'red'),
  makeShip('R3', 'red'),
  makeShip('B2', 'blue'),
];

const idOf = (ship: Ship | null): string | null => ship?.id ?? null;

describe('cycleShip', () => {
  it("steps forward through one player's ships, skipping the others", () => {
    expect(idOf(cycleShip(SHIPS, 'R1', 1, 'red'))).toBe('R2');
    expect(idOf(cycleShip(SHIPS, 'R2', 1, 'red'))).toBe('R3');
    expect(idOf(cycleShip(SHIPS, 'B1', 1, 'blue'))).toBe('B2');
  });

  it("steps back through one player's ships", () => {
    expect(idOf(cycleShip(SHIPS, 'R3', -1, 'red'))).toBe('R2');
    expect(idOf(cycleShip(SHIPS, 'R2', -1, 'red'))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, 'B2', -1, 'blue'))).toBe('B1');
  });

  it('wraps from the last ship to the first and back', () => {
    expect(idOf(cycleShip(SHIPS, 'R3', 1, 'red'))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, 'R1', -1, 'red'))).toBe('R3');
    expect(idOf(cycleShip(SHIPS, 'B2', 1, 'blue'))).toBe('B1');
    expect(idOf(cycleShip(SHIPS, 'B1', -1, 'blue'))).toBe('B2');
  });

  it('visits every ship when no player is given', () => {
    const visited: string[] = [];
    let current: string | null = null;
    for (let index = 0; index < SHIPS.length; index += 1) {
      current = idOf(cycleShip(SHIPS, current, 1, null));
      visited.push(current!);
    }
    expect(visited).toEqual(['R1', 'B1', 'R2', 'R3', 'B2']);
    expect(idOf(cycleShip(SHIPS, 'B2', 1, null))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, 'R1', -1, null))).toBe('B2');
    expect(idOf(cycleShip(SHIPS, 'R2', -1, null))).toBe('B1');
  });

  it('picks the first ship stepping forward, and the last stepping back, with nothing selected', () => {
    expect(idOf(cycleShip(SHIPS, null, 1, 'red'))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, null, -1, 'red'))).toBe('R3');
    expect(idOf(cycleShip(SHIPS, null, 1, 'blue'))).toBe('B1');
    expect(idOf(cycleShip(SHIPS, null, -1, 'blue'))).toBe('B2');
    expect(idOf(cycleShip(SHIPS, null, 1, null))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, null, -1, null))).toBe('B2');
  });

  it('treats a selected ship from another fleet as nothing selected', () => {
    expect(idOf(cycleShip(SHIPS, 'B1', 1, 'red'))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, 'B1', -1, 'red'))).toBe('R3');
    expect(idOf(cycleShip(SHIPS, 'R2', 1, 'blue'))).toBe('B1');
    expect(idOf(cycleShip(SHIPS, 'R2', -1, 'blue'))).toBe('B2');
  });

  it('treats an unknown ship id as nothing selected', () => {
    expect(idOf(cycleShip(SHIPS, 'XX', 1, 'red'))).toBe('R1');
    expect(idOf(cycleShip(SHIPS, 'XX', -1, null))).toBe('B2');
  });

  it('stays on the only ship of a one-ship fleet', () => {
    const ships = [makeShip('R1', 'red'), makeShip('B1', 'blue')];
    expect(idOf(cycleShip(ships, 'R1', 1, 'red'))).toBe('R1');
    expect(idOf(cycleShip(ships, 'R1', -1, 'red'))).toBe('R1');
  });

  it('returns null for an empty fleet', () => {
    expect(cycleShip([], null, 1, null)).toBeNull();
    expect(cycleShip([], 'R1', -1, 'red')).toBeNull();
    expect(cycleShip(SHIPS, null, 1, 'green')).toBeNull();
    expect(cycleShip(SHIPS, 'R1', -1, 'green')).toBeNull();
  });

  it('returns the ship object itself', () => {
    expect(cycleShip(SHIPS, 'R1', 1, 'red')).toBe(SHIPS[2]);
  });
});
