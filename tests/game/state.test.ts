import { describe, expect, it } from 'vitest';
import { parseDesign, parseScenario, type Scenario } from '../../src/data/loader';
import {
  createGame,
  endTurn,
  findShip,
  lockInOrders,
  orderFor,
  plottingPlayer,
  resign,
  resolveMovement,
  setOrder,
  type GameState,
} from '../../src/game/state';
import { startFirePhase } from '../../src/game/fire';
import { IllegalOrderError } from '../../src/rules/movement';
import { NO_ORDER, type Order, type TurnDirection } from '../../src/rules/orders';
import type { Ship, ShipDesign } from '../../src/rules/ship';

const order = (thrustChange: number, turnDirection: TurnDirection = 'P', turnPoints = 0): Order => ({
  thrustChange,
  turnDirection,
  turnPoints,
});

const makeDesign = (id: string, thrusts: number[]): ShipDesign =>
  parseDesign({
    id,
    fleet: 'red',
    className: id,
    code: id.slice(0, 2).toUpperCase(),
    sprite: 'ships/ship.png',
    length: 3,
    drives: thrusts.map((thrust) => ({ thrust })),
    hullRows: [2, 2],
    fireControls: 0,
    weapons: [],
    ssd: { size: 1, weaponRows: [] },
  });

/** Runs the fire phase, which these unarmed test ships complete at once, then ends the turn. */
const fireAndEndTurn = (moved: GameState): GameState => endTurn(startFirePhase(moved, () => 0));

const DESIGNS: ReadonlyMap<string, ShipDesign> = new Map([
  ['red/escort', makeDesign('escort', [3, 3])],
  ['red/cruiser', makeDesign('cruiser', [4])],
]);

interface ShipSpec {
  id: string;
  design?: string;
  x: number;
  y: number;
  course: number;
  velocity: number;
}

const makeScenario = (red: ShipSpec[], blue: ShipSpec[]): Scenario => {
  const toEntry = (spec: ShipSpec) => ({ design: 'escort', name: `${spec.id} name`, ...spec });
  return parseScenario(
    {
      id: 'test',
      number: 1,
      name: 'Test scenario',
      description: 'A test.',
      players: [
        { id: 'red', name: 'Red', colour: '#f00', fleet: 'red', ships: red.map(toEntry) },
        { id: 'blue', name: 'Blue', colour: '#00f', fleet: 'red', ships: blue.map(toEntry) },
      ],
    },
    DESIGNS,
  );
};

/** R1 at (50, 50) heading north at 4, R2 at (20, 80) heading east at 2, B1 at (80, 20) heading west at 0. */
const standardGame = (): GameState =>
  createGame(
    makeScenario(
      [
        { id: 'R1', x: 50, y: 50, course: 12, velocity: 4 },
        { id: 'R2', x: 20, y: 80, course: 3, velocity: 2 },
      ],
      [{ id: 'B1', design: 'cruiser', x: 80, y: 20, course: 9, velocity: 0 }],
    ),
    DESIGNS,
  );

const ship = (state: GameState, id: string): Ship => {
  const found = findShip(state, id);
  if (found === undefined) {
    throw new Error(`No ship ${id}`);
  }
  return found;
};

function expectPosition(found: Ship, x: number, y: number) {
  expect(found.position.x).toBeCloseTo(x);
  expect(found.position.y).toBeCloseTo(y);
}

/** Locks in every player still to plot this turn, leaving the game in the moving phase. */
function lockInAll(state: GameState): GameState {
  let current = state;
  while (current.phase.kind === 'plotting') {
    current = lockInOrders(current, current.phase.playerId);
  }
  return current;
}

/** The state as JSON, without the designs map, for checking nothing was mutated. */
const snapshotOf = (state: GameState): string => JSON.stringify({ ...state, designs: undefined });

function catchError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error but nothing was thrown.');
}

describe('createGame', () => {
  it('starts turn 1 with the first player plotting, no orders and an empty log', () => {
    const state = standardGame();
    expect(state.scenarioName).toBe('Test scenario');
    expect(state.turn).toBe(1);
    expect(state.phase).toEqual({ kind: 'plotting', playerId: 'red' });
    expect(state.orders).toEqual({});
    expect(state.log).toEqual([]);
    expect(state.designs).toBe(DESIGNS);
  });

  it('lists the players without their ships', () => {
    expect(standardGame().players).toEqual([
      { id: 'red', name: 'Red', colour: '#f00' },
      { id: 'blue', name: 'Blue', colour: '#00f' },
    ]);
  });

  it('creates every ship owned by its player, with working drives', () => {
    const state = standardGame();
    expect(state.ships.map((item) => item.id)).toEqual(['R1', 'R2', 'B1']);
    expect(ship(state, 'R2').playerId).toBe('red');
    expect(ship(state, 'B1').playerId).toBe('blue');
    expect(ship(state, 'B1').drives).toEqual([{ thrust: 4, functional: true }]);
    expect(ship(state, 'R1')).toMatchObject({ position: { x: 50, y: 50 }, course: 12, velocity: 4 });
  });
});

describe('plottingPlayer', () => {
  it('is the first player at the start of the game', () => {
    expect(plottingPlayer(standardGame())).toEqual({ id: 'red', name: 'Red', colour: '#f00' });
  });

  it('is the next player once the first has locked in', () => {
    const state = lockInOrders(standardGame(), 'red');
    expect(plottingPlayer(state)).toEqual({ id: 'blue', name: 'Blue', colour: '#00f' });
  });

  it('is null during the moving phase', () => {
    expect(plottingPlayer(lockInAll(standardGame()))).toBeNull();
  });
});

describe('orderFor', () => {
  it('defaults to no order', () => {
    const state = standardGame();
    expect(orderFor(state, 'R1')).toEqual(NO_ORDER);
    expect(orderFor(state, 'nobody')).toEqual(NO_ORDER);
  });
});

describe('setOrder', () => {
  it('stores a legal order', () => {
    const state = setOrder(standardGame(), 'R1', order(2, 'P', 2));
    expect(orderFor(state, 'R1')).toEqual(order(2, 'P', 2));
    expect(orderFor(state, 'R2')).toEqual(NO_ORDER);
  });

  it('replaces an earlier order for the same ship', () => {
    let state = setOrder(standardGame(), 'R1', order(2));
    state = setOrder(state, 'R1', order(-1, 'S', 1));
    expect(orderFor(state, 'R1')).toEqual(order(-1, 'S', 1));
  });

  it('throws IllegalOrderError for an illegal order', () => {
    const state = standardGame();
    for (const bad of [order(5, 'P', 2), order(0, 'S', 4), order(-5), order(1.5)]) {
      const error = catchError(() => setOrder(state, 'R1', bad));
      expect(error).toBeInstanceOf(IllegalOrderError);
      expect((error as IllegalOrderError).shipId).toBe('R1');
      expect((error as IllegalOrderError).reasons.length).toBeGreaterThan(0);
    }
    // B1 is at velocity 0 and cannot decelerate.
    const bluePlotting = lockInOrders(state, 'red');
    expect(() => setOrder(bluePlotting, 'B1', order(-1))).toThrow(IllegalOrderError);
  });

  it('refuses orders outside the plotting phase with a plain error', () => {
    const moving = lockInAll(standardGame());
    const error = catchError(() => setOrder(moving, 'R1', order(1)));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(IllegalOrderError);
    expect((error as Error).message).toMatch(/plotting phase/);
    expect(() => setOrder(moving, 'B1', order(1))).toThrow(/plotting phase/);
  });

  it('refuses an order for a blue ship while red is plotting, without changing the state', () => {
    const state = setOrder(standardGame(), 'R1', order(1));
    const snapshot = snapshotOf(state);
    const error = catchError(() => setOrder(state, 'B1', order(1)));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(IllegalOrderError);
    expect((error as Error).message).toMatch(/another player/);
    expect(snapshotOf(state)).toBe(snapshot);
    expect(orderFor(state, 'B1')).toEqual(NO_ORDER);
  });

  it('refuses an order for a red ship once red has locked in and blue is plotting, without changing the state', () => {
    const state = setOrder(lockInOrders(setOrder(standardGame(), 'R1', order(1)), 'red'), 'B1', order(2));
    const snapshot = snapshotOf(state);
    const error = catchError(() => setOrder(state, 'R2', order(1)));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(IllegalOrderError);
    expect((error as Error).message).toMatch(/another player/);
    // Red's locked-in order cannot be changed either.
    expect(() => setOrder(state, 'R1', order(-1))).toThrow(/another player/);
    expect(snapshotOf(state)).toBe(snapshot);
    expect(orderFor(state, 'R1')).toEqual(order(1));
    expect(orderFor(state, 'R2')).toEqual(NO_ORDER);
  });

  it('refuses unknown ships', () => {
    expect(() => setOrder(standardGame(), 'XX', order(1))).toThrow(/no ship with id "XX"/);
  });

  it("does not mutate the previous state or keep the caller's order object", () => {
    const before = standardGame();
    const snapshot = JSON.stringify({ ...before, designs: undefined });
    const given = order(1, 'S', 1);
    const after = setOrder(before, 'R1', given);
    expect(JSON.stringify({ ...before, designs: undefined })).toBe(snapshot);
    expect(before.orders).toEqual({});
    expect(after).not.toBe(before);

    given.thrustChange = 3;
    expect(orderFor(after, 'R1')).toEqual(order(1, 'S', 1));
  });
});

describe('lockInOrders', () => {
  it('passes plotting from the first player to the second, then to the moving phase', () => {
    const start = standardGame();
    const blue = lockInOrders(start, 'red');
    expect(blue.phase).toEqual({ kind: 'plotting', playerId: 'blue' });
    const moving = lockInOrders(blue, 'blue');
    expect(moving.phase).toEqual({ kind: 'moving' });
    expect(moving.turn).toBe(1);
    // Earlier states are untouched.
    expect(start.phase).toEqual({ kind: 'plotting', playerId: 'red' });
    expect(blue.phase).toEqual({ kind: 'plotting', playerId: 'blue' });
  });

  it('refuses a player whose turn to plot it is not', () => {
    expect(() => lockInOrders(standardGame(), 'blue')).toThrow(/not blue's turn/);
    expect(() => lockInOrders(standardGame(), 'nobody')).toThrow();
  });

  it('refuses a second lock-in by the same player', () => {
    const state = lockInOrders(standardGame(), 'red');
    expect(() => lockInOrders(state, 'red')).toThrow(/not red's turn/);
  });

  it('refuses any lock-in during the moving phase', () => {
    const moving = lockInAll(standardGame());
    expect(() => lockInOrders(moving, 'red')).toThrow();
    expect(() => lockInOrders(moving, 'blue')).toThrow();
  });

  it('keeps the orders already plotted', () => {
    let state = setOrder(standardGame(), 'R1', order(1, 'S', 1));
    state = lockInOrders(state, 'red');
    expect(state.orders).toEqual({ R1: order(1, 'S', 1) });
    state = setOrder(state, 'B1', order(2, 'P', 1));
    state = lockInOrders(state, 'blue');
    expect(state.orders).toEqual({ R1: order(1, 'S', 1), B1: order(2, 'P', 1) });
  });

  it('does not mutate the state it locks in', () => {
    const state = setOrder(standardGame(), 'R1', order(1));
    const snapshot = snapshotOf(state);
    lockInOrders(state, 'red');
    expect(snapshotOf(state)).toBe(snapshot);
  });
});

describe('resolveMovement', () => {
  it('moves every ship by its order, and ships with no order coast', () => {
    let state = standardGame();
    // R1: north at 4, +2 and S3: pivot S1, move 3, pivot S2, move 3.
    state = setOrder(state, 'R1', order(2, 'S', 3));
    state = lockInOrders(state, 'red');
    // B1: west at 0, +2 and P1: pivot 0, move 1, pivot P1 (to 8), move 1.
    state = setOrder(state, 'B1', order(2, 'P', 1));
    state = lockInOrders(state, 'blue');
    const { next, moves } = resolveMovement(state);

    const r1 = ship(next, 'R1');
    expect(r1.velocity).toBe(6);
    expect(r1.course).toBe(3);
    // Course 1 for 3 mu, then course 3 for 3 mu.
    expectPosition(r1, 50 + 3 * Math.sin(Math.PI / 6) + 3, 50 - 3 * Math.cos(Math.PI / 6));

    const r2 = ship(next, 'R2');
    expect(r2.velocity).toBe(2);
    expect(r2.course).toBe(3);
    expectPosition(r2, 22, 80);

    const b1 = ship(next, 'B1');
    expect(b1.velocity).toBe(2);
    expect(b1.course).toBe(8);
    // Course 8 points west-south-west, so y grows.
    expectPosition(b1, 80 - 1 - Math.cos(Math.PI / 6), 20 + Math.sin(Math.PI / 6));

    expect(Object.keys(moves).sort()).toEqual(['B1', 'R1', 'R2']);
    expect(moves.R1!.end.position.x).toBeCloseTo(r1.position.x);
  });

  it('moves ships simultaneously, so ship order does not matter', () => {
    let state = standardGame();
    state = setOrder(state, 'R1', order(1, 'P', 2));
    state = setOrder(state, 'R2', order(-2));
    state = lockInAll(state);
    const forwards = resolveMovement(state).next;
    const backwards = resolveMovement({ ...state, ships: [...state.ships].reverse() }).next;
    for (const id of ['R1', 'R2', 'B1']) {
      expect(ship(backwards, id)).toEqual(ship(forwards, id));
    }
  });

  it('stays on the same turn, with the orders kept, once movement is complete', () => {
    const state = lockInAll(setOrder(standardGame(), 'R1', order(1)));
    const { next } = resolveMovement(state);
    expect(next.turn).toBe(1);
    expect(next.phase).toEqual({ kind: 'movementComplete' });
    expect(next.orders).toEqual(state.orders);
    expect(plottingPlayer(next)).toBeNull();
  });

  it('refuses orders, lock-ins and a second movement once movement is complete', () => {
    const { next } = resolveMovement(lockInAll(standardGame()));
    expect(() => setOrder(next, 'R1', order(1))).toThrow(/plotting phase/);
    expect(() => lockInOrders(next, 'red')).toThrow();
    expect(() => resolveMovement(next)).toThrow(/locked in/);
  });

  it('refuses to move ships while any player is still plotting', () => {
    const redPlotting = setOrder(standardGame(), 'R1', order(1));
    expect(() => resolveMovement(redPlotting)).toThrow(/locked in/);
    const bluePlotting = lockInOrders(redPlotting, 'red');
    expect(() => resolveMovement(bluePlotting)).toThrow(/locked in/);
  });

  it('runs a full turn cycle: plot, lock in, plot, lock in, move', () => {
    let state = standardGame();
    state = setOrder(state, 'R1', order(1, 'S', 1));
    state = setOrder(state, 'R2', order(-1));
    state = lockInOrders(state, 'red');
    state = setOrder(state, 'B1', order(2, 'P', 2));
    state = lockInOrders(state, 'blue');
    expect(state.phase).toEqual({ kind: 'moving' });
    expect(Object.keys(state.orders).sort()).toEqual(['B1', 'R1', 'R2']);

    const moved = resolveMovement(state).next;
    expect(moved.phase).toEqual({ kind: 'movementComplete' });
    const next = fireAndEndTurn(moved);
    expect(next.turn).toBe(2);
    expect(next.phase).toEqual({ kind: 'plotting', playerId: 'red' });
    expect(plottingPlayer(next)?.id).toBe('red');
    expect(next.orders).toEqual({});
    expect(next.log.map((entry) => entry.order)).toEqual(['+1, S1', '-1', '+2, P2']);
    expect(ship(next, 'B1').velocity).toBe(2);

    // The second turn's plotting works the same way.
    expect(() => setOrder(next, 'B1', order(1))).toThrow(/another player/);
    expect(() => resolveMovement(next)).toThrow();
    const turnTwo = lockInAll(setOrder(next, 'R1', order(1)));
    expect(fireAndEndTurn(resolveMovement(turnTwo).next).turn).toBe(3);
  });

  it('does not mutate the state it resolves', () => {
    const state = lockInAll(setOrder(standardGame(), 'R1', order(1, 'S', 1)));
    const snapshot = JSON.stringify({ ...state, designs: undefined });
    resolveMovement(state);
    expect(JSON.stringify({ ...state, designs: undefined })).toBe(snapshot);
  });

  it('writes a log entry per ship in the rules notation', () => {
    let state = standardGame();
    state = setOrder(state, 'R1', order(2, 'P', 2));
    state = setOrder(state, 'R2', order(-1, 'S', 1));
    const { next } = resolveMovement(lockInAll(state));
    expect(next.log).toEqual([
      { turn: 1, shipId: 'R1', shipName: 'R1 name', playerId: 'red', order: '+2, P2', velocity: 6, course: 10 },
      { turn: 1, shipId: 'R2', shipName: 'R2 name', playerId: 'red', order: '-1, S1', velocity: 1, course: 4 },
      { turn: 1, shipId: 'B1', shipName: 'B1 name', playerId: 'blue', order: '–', velocity: 0, course: 9 },
    ]);
  });

  it('lets ships fly any distance, including to negative positions, as long as they stay in reach of each other', () => {
    let state = createGame(
      makeScenario([{ id: 'R1', x: 0, y: 3, course: 12, velocity: 40 }], [{ id: 'B1', x: -100, y: 0, course: 12, velocity: 40 }]),
      DESIGNS,
    );
    for (let turn = 1; turn <= 10; turn += 1) {
      state = fireAndEndTurn(resolveMovement(lockInAll(state)).next);
    }
    expect(ship(state, 'R1').position.x).toBeCloseTo(0);
    expect(ship(state, 'R1').position.y).toBeCloseTo(-397);
    expect(ship(state, 'B1').position.x).toBeCloseTo(-100);
    expect(ship(state, 'B1').position.y).toBeCloseTo(-400);
    // Both ships can still be given orders.
    expect(() => setOrder(state, 'R1', order(-1, 'S', 1))).not.toThrow();
    expect(() => setOrder(lockInOrders(state, 'red'), 'B1', order(1, 'P', 1))).not.toThrow();
  });

  it('keeps every turn in the log', () => {
    let state = createGame(
      makeScenario(
        [{ id: 'R1', x: 500, y: 500, course: 3, velocity: 2 }],
        [{ id: 'B1', x: 600, y: 500, course: 9, velocity: 2 }],
      ),
      DESIGNS,
    );
    for (let turn = 1; turn <= 5; turn += 1) {
      state = fireAndEndTurn(resolveMovement(lockInAll(state)).next);
    }
    expect(state.turn).toBe(6);
    expect([...new Set(state.log.map((entry) => entry.turn))].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(state.log).toHaveLength(10);
  });

  it('lets a ship with no working drives coast but not change course or speed', () => {
    let state = standardGame();
    state = {
      ...state,
      ships: state.ships.map((item) =>
        item.id === 'R2' ? { ...item, drives: item.drives.map((drive) => ({ ...drive, functional: false })) } : item,
      ),
    };
    expect(() => setOrder(state, 'R2', order(1))).toThrow(IllegalOrderError);
    expect(() => setOrder(state, 'R2', order(0, 'S', 1))).toThrow(IllegalOrderError);
    expect(() => setOrder(state, 'R2', NO_ORDER)).not.toThrow();

    const { next } = resolveMovement(lockInAll(state));
    const r2 = ship(next, 'R2');
    expect(r2.velocity).toBe(2);
    expect(r2.course).toBe(3);
    expectPosition(r2, 22, 80);
    expect(r2.drives.every((drive) => !drive.functional)).toBe(true);
  });
});

describe('the battle area', () => {
  /** One move and the fire phase for these unarmed ships, ending ready for the next turn's plotting. */
  const playTurn = (state: GameState): GameState => fireAndEndTurn(resolveMovement(lockInAll(state)).next);

  /** R1 at the origin; B2 10 mu away; B1 150 mu away, out of reach of R1. Nobody moves. */
  const oneFar = (): GameState =>
    createGame(
      makeScenario(
        [{ id: 'R1', x: 0, y: 0, course: 3, velocity: 0 }],
        [
          { id: 'B1', x: 150, y: 0, course: 9, velocity: 0 },
          { id: 'B2', x: 10, y: 0, course: 9, velocity: 0 },
        ],
      ),
      DESIGNS,
    );

  /** R1 and B1 150 mu apart, each other's only enemy. Nobody moves. */
  const loneShips = (): GameState =>
    createGame(
      makeScenario([{ id: 'R1', x: 0, y: 0, course: 3, velocity: 0 }], [{ id: 'B1', x: 150, y: 0, course: 9, velocity: 0 }]),
      DESIGNS,
    );

  it('starts with no ship leaving and none gone', () => {
    expect(oneFar().leaving).toEqual([]);
    expect(oneFar().withdrawn).toEqual([]);
  });

  it('warns a ship that ends a move out of reach of every enemy, but keeps it in play', () => {
    const { next } = resolveMovement(lockInAll(oneFar()));
    expect(next.leaving).toEqual(['B1']);
    expect(next.ships.map((found) => found.id)).toEqual(['R1', 'B1', 'B2']);
    expect(next.phase).toEqual({ kind: 'movementComplete' });
  });

  it('takes a warned ship out of the battle if it is still out of reach after the next move', () => {
    const { next } = resolveMovement(lockInAll(playTurn(oneFar())));
    expect(next.ships.map((found) => found.id)).toEqual(['R1', 'B2']);
    expect(next.withdrawn).toEqual([{ ship: ship(playTurn(oneFar()), 'B1'), turn: 2 }]);
    expect(next.leaving).toEqual([]);
    expect(next.phase).toEqual({ kind: 'movementComplete' });
  });

  it('lets a warned ship that closes to within 144 mu stay in the battle', () => {
    // B1 is 150 mu east of R1, heading west: thrust 6 takes it to exactly 144 mu.
    const closing = setOrder(lockInOrders(playTurn(oneFar()), 'red'), 'B1', order(6));
    const { next } = resolveMovement(lockInAll(closing));
    expectPosition(ship(next, 'B1'), 144, 0);
    expect(next.leaving).toEqual([]);
    expect(next.withdrawn).toEqual([]);
  });

  it('warns afresh, rather than taking out, a ship that came back into reach and then goes out again', () => {
    const closing = setOrder(lockInOrders(playTurn(oneFar()), 'red'), 'B1', order(6));
    const back = fireAndEndTurn(resolveMovement(lockInAll(closing)).next);
    expect(back.leaving).toEqual([]);
    // B1 is at 144 mu heading west at 6; put R1 out of its reach as if R1 had run.
    const r1Away = {
      ...back,
      ships: back.ships.map((found) => (found.id === 'R1' ? { ...found, position: { x: -20, y: 0 } } : found)),
    };
    const { next } = resolveMovement(lockInAll(r1Away));
    expect(next.leaving).toContain('B1');
    expect(next.ships.some((found) => found.id === 'B1')).toBe(true);
    expect(next.withdrawn).toEqual([]);
  });

  it('ends the game when a side has no ships left in the battle', () => {
    // B2 is destroyed in a fight between moves, leaving B1, already warned, as Blue's last ship.
    const warned = playTurn(oneFar());
    const b2Gone = { ...warned, ships: warned.ships.filter((found) => found.id !== 'B2') };
    const { next } = resolveMovement(lockInAll(b2Gone));
    expect(next.ships.map((found) => found.id)).toEqual(['R1']);
    expect(next.phase).toEqual({ kind: 'gameOver', winnerId: 'red' });
    // R1 is out of reach of B1 now too, but B1 has gone, so the game is over before that matters.
    expect(next.leaving).toEqual(['R1']);
  });

  it('is a draw when the last ships on both sides leave in the same move', () => {
    const first = resolveMovement(lockInAll(loneShips())).next;
    expect(first.leaving).toEqual(['R1', 'B1']);
    const { next } = resolveMovement(lockInAll(fireAndEndTurn(first)));
    expect(next.ships).toEqual([]);
    expect(next.withdrawn.map((gone) => gone.ship.id)).toEqual(['R1', 'B1']);
    expect(next.phase).toEqual({ kind: 'gameOver', winnerId: null });
  });

  it('judges every ship from where all the ships ended, before any leaves', () => {
    // Were R1 judged after B1 had gone, it would have no enemies left and so would not count as out of reach.
    const { next } = resolveMovement(lockInAll(playTurn(loneShips())));
    expect(next.withdrawn.map((gone) => gone.ship.id).sort()).toEqual(['B1', 'R1']);
  });
});

describe('resign', () => {
  it('ends the game at once, with the other player winning', () => {
    const state = resign(standardGame(), 'red');
    expect(state.phase).toEqual({ kind: 'gameOver', winnerId: 'blue', resignedId: 'red' });
  });

  it('can happen in any phase, by either player', () => {
    const moved = resolveMovement(lockInAll(standardGame())).next;
    expect(resign(moved, 'blue').phase).toEqual({ kind: 'gameOver', winnerId: 'red', resignedId: 'blue' });
  });

  it('is refused once the game is over, or for an unknown player', () => {
    expect(() => resign(resign(standardGame(), 'red'), 'blue')).toThrow(/already over/);
    expect(() => resign(standardGame(), 'green')).toThrow(/no player/);
  });
});

describe('endTurn', () => {
  it('starts the next turn with the first player plotting and no orders', () => {
    const moved = startFirePhase(resolveMovement(lockInAll(setOrder(standardGame(), 'R1', order(1)))).next, () => 0);
    const next = endTurn(moved);
    expect(next.turn).toBe(2);
    expect(next.phase).toEqual({ kind: 'plotting', playerId: 'red' });
    expect(next.orders).toEqual({});
    expect(next.fire).toBeNull();
    // Ships and the log are carried over unchanged.
    expect(next.ships).toBe(moved.ships);
    expect(next.log).toBe(moved.log);
  });

  it('can only end the turn once the fire phase is complete', () => {
    const plotting = standardGame();
    expect(() => endTurn(plotting)).toThrow(/fire phase is complete/);
    expect(() => endTurn(lockInAll(plotting))).toThrow(/fire phase is complete/);
    expect(() => endTurn(resolveMovement(lockInAll(plotting)).next)).toThrow(/fire phase is complete/);
  });

  it('does not change the state it ends', () => {
    const moved = startFirePhase(resolveMovement(lockInAll(standardGame())).next, () => 0);
    const snapshot = JSON.stringify({ ...moved, designs: undefined });
    endTurn(moved);
    expect(JSON.stringify({ ...moved, designs: undefined })).toBe(snapshot);
  });
});
