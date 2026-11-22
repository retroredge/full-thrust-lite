import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../src/game/log';
import type { GameState, Phase } from '../../src/game/state';
import { viewFor } from '../../src/game/visibility';
import type { Order } from '../../src/rules/orders';
import type { Ship } from '../../src/rules/ship';
import { gameState } from '../support/gameState';

const makeShip = (id: string, playerId: string): Ship => ({
  id,
  designId: 'destroyer',
  playerId,
  name: `${id} name`,
  position: { x: 10, y: 10 },
  course: 12,
  velocity: 4,
  drives: [{ thrust: 6, functional: true }],
  hullDamage: 0,
  weaponsLost: [],
  fireControlsLost: [],
});

const order = (thrustChange: number): Order => ({ thrustChange, turnDirection: 'P', turnPoints: 0 });

const LOG: LogEntry[] = [
  { turn: 1, shipId: 'A1', shipName: 'A1 name', playerId: 'p1', order: '+1', velocity: 5, course: 12 },
  { turn: 1, shipId: 'B1', shipName: 'B1 name', playerId: 'p2', order: '-1', velocity: 3, course: 12 },
];

/** p1 owns A1 and A2, p2 owns B1 and B2, and every ship has an order. */
const makeState = (phase: Phase): GameState =>
  gameState({
    ships: [makeShip('A1', 'p1'), makeShip('B1', 'p2'), makeShip('A2', 'p1'), makeShip('B2', 'p2')],
    turn: 2,
    phase,
    orders: { A1: order(1), A2: order(2), B1: order(-1), B2: order(-2) },
    log: LOG,
  });

const P1_PLOTTING: Phase = { kind: 'plotting', playerId: 'p1' };
const P2_PLOTTING: Phase = { kind: 'plotting', playerId: 'p2' };
const MOVING: Phase = { kind: 'moving' };

const snapshotOf = (state: GameState): string => JSON.stringify({ ...state, designs: undefined });

describe('viewFor', () => {
  it('shows the plotting player only their own orders', () => {
    const view = viewFor(makeState(P2_PLOTTING), 'p2');
    expect(view.orders).toEqual({ B1: order(-1), B2: order(-2) });
  });

  it("keeps the first player's own orders while they plot", () => {
    const view = viewFor(makeState(P1_PLOTTING), 'p1');
    expect(view.orders).toEqual({ A1: order(1), A2: order(2) });
  });

  it('shows a player who has locked in only their own orders while the other plots', () => {
    const view = viewFor(makeState(P2_PLOTTING), 'p1');
    expect(view.orders).toEqual({ A1: order(1), A2: order(2) });
  });

  it('shows an onlooker no orders during plotting', () => {
    expect(viewFor(makeState(P1_PLOTTING), null).orders).toEqual({});
    expect(viewFor(makeState(P2_PLOTTING), null).orders).toEqual({});
  });

  it('shows an unknown viewer no orders during plotting', () => {
    expect(viewFor(makeState(P1_PLOTTING), 'stranger').orders).toEqual({});
  });

  it('shows every order to any viewer during movement', () => {
    const state = makeState(MOVING);
    for (const viewer of ['p1', 'p2', null]) {
      expect(viewFor(state, viewer).orders).toEqual(state.orders);
    }
  });

  it('keeps the log, ships and everything else', () => {
    for (const phase of [P1_PLOTTING, P2_PLOTTING, MOVING]) {
      const state = makeState(phase);
      for (const viewer of ['p1', 'p2', null]) {
        const view = viewFor(state, viewer);
        expect(view.log).toEqual(LOG);
        expect(view.ships).toEqual(state.ships);
        expect(view.players).toEqual(state.players);
        expect(view.phase).toEqual(phase);
        expect(view.turn).toBe(2);
        expect(view.designs).toBe(state.designs);
      }
    }
  });

  it('does not mutate the state it is given', () => {
    for (const phase of [P1_PLOTTING, P2_PLOTTING, MOVING]) {
      const state = makeState(phase);
      const snapshot = snapshotOf(state);
      for (const viewer of ['p1', 'p2', null]) {
        viewFor(state, viewer);
      }
      expect(snapshotOf(state)).toBe(snapshot);
      expect(Object.keys(state.orders)).toHaveLength(4);
    }
  });

  it('returns a separate state during plotting', () => {
    const state = makeState(P1_PLOTTING);
    const view = viewFor(state, 'p1');
    expect(view).not.toBe(state);
    expect(view.orders).not.toBe(state.orders);
  });
});
