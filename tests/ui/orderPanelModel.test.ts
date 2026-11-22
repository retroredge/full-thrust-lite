import { describe, expect, it } from 'vitest';
import { startFirePhase } from '../../src/game/fire';
import { parseDesign, parseScenario, type Scenario } from '../../src/data/loader';
import { createGame, endTurn, lockInOrders, resolveMovement, setOrder, type GameState } from '../../src/game/state';
import { viewFor } from '../../src/game/visibility';
import type { Order, TurnDirection } from '../../src/rules/orders';
import type { ShipDesign } from '../../src/rules/ship';
import { buildOrderPanel, type OrderPanel } from '../../src/ui/orderPanelModel';

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

/**
 * R1 (escort, thrust 6) at course 1, velocity 6; B1 (cruiser, thrust 4) at course 9, velocity 3.
 * Red plots first, then blue.
 */
const newGame = (): GameState =>
  createGame(
    makeScenario(
      [{ id: 'R1', x: 50, y: 50, course: 1, velocity: 6 }],
      [{ id: 'B1', design: 'cruiser', x: 80, y: 20, course: 9, velocity: 3 }],
    ),
    DESIGNS,
  );

/** Red's distinctive order: +2, P2 from V6 C1 gives V8 C11. */
const RED_ORDER = order(2, 'P', 2);
const RED_ORDER_TEXT = '+2, P2';
const RED_NEW_VELOCITY = 8;
const RED_NEW_COURSE = 11;

/** Blue's order: -1, S1 from V3 C9 gives V2 C10. */
const BLUE_ORDER = order(-1, 'S', 1);

/** Red has plotted and locked in; blue is now plotting. */
const blueToPlot = (): GameState => lockInOrders(setOrder(newGame(), 'R1', RED_ORDER), 'red');

/** Both sides have plotted and locked in; ships have not yet moved. */
const movingGame = (): GameState => lockInOrders(setOrder(blueToPlot(), 'B1', BLUE_ORDER), 'blue');

const movedGame = (): GameState => resolveMovement(movingGame()).next;

const turnTwo = (): GameState => endTurn(startFirePhase(movedGame(), () => 0));

function expectKind<K extends OrderPanel['kind']>(panel: OrderPanel, kind: K): Extract<OrderPanel, { kind: K }> {
  expect(panel.kind).toBe(kind);
  if (panel.kind !== kind) {
    throw new Error(`Expected a ${kind} panel, got ${panel.kind}`);
  }
  return panel as Extract<OrderPanel, { kind: K }>;
}

/** True when the JSON has `value` as a whole number anywhere, as a property value or array item. */
const hasNumber = (json: string, value: number): boolean => new RegExp(`[:\\[,]${value}[,\\]}]`).test(json);

describe('buildOrderPanel', () => {
  describe('none', () => {
    it('says whether the ship is leaving the battle, in every kind of panel', () => {
      expect(buildOrderPanel(newGame(), 'R1', 'red')).toHaveProperty('leaving', false);
      expect(buildOrderPanel({ ...newGame(), leaving: ['R1'] }, 'R1', 'red')).toMatchObject({ kind: 'edit', leaving: true });
      expect(buildOrderPanel({ ...newGame(), leaving: ['B1'] }, 'B1', 'red')).toMatchObject({ kind: 'secret', leaving: true });
      expect(buildOrderPanel({ ...movedGame(), leaving: ['B1'] }, 'B1', null)).toMatchObject({ kind: 'result', leaving: true });
    });

    it('returns none when no ship is selected', () => {
      const state = newGame();
      expect(buildOrderPanel(viewFor(state, 'red'), null, 'red')).toEqual({ kind: 'none' });
    });

    it('returns none for an unknown ship id', () => {
      const state = newGame();
      expect(buildOrderPanel(viewFor(state, 'red'), 'NOPE', 'red')).toEqual({ kind: 'none' });
    });
  });

  describe('edit', () => {
    it("gives the plotting viewer's own ship an edit panel reflecting its order", () => {
      const state = setOrder(newGame(), 'R1', RED_ORDER);
      const panel = expectKind(buildOrderPanel(viewFor(state, 'red'), 'R1', 'red'), 'edit');
      expect(panel.shipId).toBe('R1');
      expect(panel.shipName).toBe('R1 name');
      expect(panel.playerId).toBe('red');
      expect(panel.velocity).toBe(6);
      expect(panel.course).toBe(1);
      expect(panel.lastTurn).toBeNull();
      expect(panel.plot.shipId).toBe('R1');
      expect(panel.plot.order).toEqual(RED_ORDER);
      expect(panel.plot.order.thrustChange).toBe(2);
      expect(panel.plot.newVelocity).toBe(RED_NEW_VELOCITY);
      expect(panel.plot.newCourse).toBe(RED_NEW_COURSE);
      expect(panel.plot.thrustUsed).toBe(4);
      expect(panel.plot.canPlot).toBe(true);
    });

    it('still gives an edit panel for a ship with all drives knocked out, but locked', () => {
      const base = newGame();
      const state: GameState = {
        ...base,
        ships: base.ships.map((ship) =>
          ship.id === 'R1' ? { ...ship, drives: ship.drives.map((drive) => ({ ...drive, functional: false })) } : ship,
        ),
      };
      const panel = expectKind(buildOrderPanel(viewFor(state, 'red'), 'R1', 'red'), 'edit');
      expect(panel.plot.canPlot).toBe(false);
      expect(panel.plot.lockedReason).toBe('No working drives');
    });
  });

  describe('secret', () => {
    it('shows a blue ship to red, while red plots, as secret and not locked in', () => {
      const state = newGame();
      const panel = expectKind(buildOrderPanel(viewFor(state, 'red'), 'B1', 'red'), 'secret');
      expect(panel.lockedIn).toBe(false);
      expect(panel.playerId).toBe('blue');
      expect(panel.velocity).toBe(3);
      expect(panel.course).toBe(9);
    });

    it('shows a red ship to blue, after red locks in, as secret and locked in', () => {
      const state = blueToPlot();
      const panel = expectKind(buildOrderPanel(viewFor(state, 'blue'), 'R1', 'blue'), 'secret');
      expect(panel.lockedIn).toBe(true);
    });

    it('shows a red ship as secret, not edit, when blue views while red is plotting', () => {
      const state = setOrder(newGame(), 'R1', RED_ORDER);
      const panel = expectKind(buildOrderPanel(viewFor(state, 'blue'), 'R1', 'blue'), 'secret');
      expect(panel.lockedIn).toBe(false);
      expect(panel).not.toHaveProperty('plot');
    });
  });

  describe('secrecy of the current turn order', () => {
    const expectNoLeak = (panel: OrderPanel) => {
      const secret = expectKind(panel, 'secret');
      const json = JSON.stringify(secret);
      expect(json).not.toContain(RED_ORDER_TEXT);
      expect(json).not.toContain('P2');
      expect(json).not.toContain(String(RED_NEW_VELOCITY));
      expect(json).not.toContain(String(RED_NEW_COURSE));
      expect(hasNumber(json, RED_NEW_VELOCITY)).toBe(false);
      expect(hasNumber(json, RED_NEW_COURSE)).toBe(false);
      expect(secret).not.toHaveProperty('plot');
      expect(secret).not.toHaveProperty('thisTurn');
      // The public, current V/C are the pre-move values, which are open book.
      expect(secret.velocity).toBe(6);
      expect(secret.course).toBe(1);
    };

    it("reveals nothing of red's order to blue through the filtered view", () => {
      const state = blueToPlot();
      expectNoLeak(buildOrderPanel(viewFor(state, 'blue'), 'R1', 'blue'));
    });

    it("reveals nothing of red's order to blue even when handed the full state", () => {
      const state = blueToPlot();
      expect(state.orders['R1']).toEqual(RED_ORDER);
      expectNoLeak(buildOrderPanel(state, 'R1', 'blue'));
    });

    it('sanity check: the leak detector spots the values in an edit panel', () => {
      const state = setOrder(newGame(), 'R1', RED_ORDER);
      const json = JSON.stringify(buildOrderPanel(viewFor(state, 'red'), 'R1', 'red'));
      expect(hasNumber(json, RED_NEW_VELOCITY)).toBe(true);
      expect(hasNumber(json, RED_NEW_COURSE)).toBe(true);
    });
  });

  describe('result', () => {
    const viewers: (string | null)[] = ['red', 'blue', null];

    it.each(viewers)("while moving, shows this turn's order and its result, not yet moved (viewer %s)", (viewer) => {
      const state = movingGame();
      const panel = expectKind(buildOrderPanel(viewFor(state, viewer), 'R1', viewer), 'result');
      expect(panel.moved).toBe(false);
      expect(panel.thisTurn).toEqual({ order: RED_ORDER_TEXT, velocity: RED_NEW_VELOCITY, course: RED_NEW_COURSE });
      expect(panel.velocity).toBe(6);
      expect(panel.course).toBe(1);

      const blue = expectKind(buildOrderPanel(viewFor(state, viewer), 'B1', viewer), 'result');
      expect(blue.thisTurn).toEqual({ order: '-1, S1', velocity: 2, course: 10 });
    });

    it.each(viewers)('after movement, shows the logged result without re-applying the order (viewer %s)', (viewer) => {
      const state = movedGame();
      // The order is still in the state, so re-applying it to the moved ship would give V10.
      expect(state.orders['R1']).toEqual(RED_ORDER);
      const panel = expectKind(buildOrderPanel(viewFor(state, viewer), 'R1', viewer), 'result');
      expect(panel.moved).toBe(true);
      expect(panel.thisTurn).toEqual({ order: RED_ORDER_TEXT, velocity: RED_NEW_VELOCITY, course: RED_NEW_COURSE });
      expect(panel.thisTurn.velocity).not.toBe(10);
      expect(panel.velocity).toBe(RED_NEW_VELOCITY);
      expect(panel.course).toBe(RED_NEW_COURSE);
    });

    it('shows "–" for a ship with no order', () => {
      const state = lockInOrders(lockInOrders(newGame(), 'red'), 'blue');
      const panel = expectKind(buildOrderPanel(state, 'R1', null), 'result');
      expect(panel.thisTurn).toEqual({ order: '–', velocity: 6, course: 1 });
    });
  });

  describe('lastTurn', () => {
    it('is null on turn 1 in every phase', () => {
      expect(buildOrderPanel(viewFor(newGame(), 'red'), 'R1', 'red')).toHaveProperty('lastTurn', null);
      expect(buildOrderPanel(viewFor(blueToPlot(), 'blue'), 'R1', 'blue')).toHaveProperty('lastTurn', null);
      expect(buildOrderPanel(movingGame(), 'R1', null)).toHaveProperty('lastTurn', null);
      expect(buildOrderPanel(movedGame(), 'R1', null)).toHaveProperty('lastTurn', null);
    });

    it("on turn 2 holds turn 1's order and result", () => {
      const state = turnTwo();
      expect(state.turn).toBe(2);
      const panel = expectKind(buildOrderPanel(viewFor(state, 'red'), 'R1', 'red'), 'edit');
      expect(panel.lastTurn).toEqual({ order: RED_ORDER_TEXT, velocity: RED_NEW_VELOCITY, course: RED_NEW_COURSE });
      expect(panel.velocity).toBe(RED_NEW_VELOCITY);
      expect(panel.course).toBe(RED_NEW_COURSE);
    });

    it("is public: blue sees red's turn-1 order in a secret panel on turn 2", () => {
      const redPlotting = turnTwo();
      const whileRedPlots = expectKind(buildOrderPanel(viewFor(redPlotting, 'blue'), 'R1', 'blue'), 'secret');
      expect(whileRedPlots.lockedIn).toBe(false);
      expect(whileRedPlots.lastTurn).toEqual({
        order: RED_ORDER_TEXT,
        velocity: RED_NEW_VELOCITY,
        course: RED_NEW_COURSE,
      });

      const bluePlotting = lockInOrders(setOrder(redPlotting, 'R1', order(-3)), 'red');
      const afterRedLocks = expectKind(buildOrderPanel(viewFor(bluePlotting, 'blue'), 'R1', 'blue'), 'secret');
      expect(afterRedLocks.lockedIn).toBe(true);
      expect(afterRedLocks.lastTurn).toEqual({
        order: RED_ORDER_TEXT,
        velocity: RED_NEW_VELOCITY,
        course: RED_NEW_COURSE,
      });
      expect(JSON.stringify(afterRedLocks)).not.toContain('-3');
    });
  });

  describe('no mutation', () => {
    it.each([
      ['red plotting', () => setOrder(newGame(), 'R1', RED_ORDER), 'red'],
      ['blue plotting', blueToPlot, 'blue'],
      ['moving', movingGame, null],
      ['movement complete', movedGame, null],
      ['turn 2', turnTwo, 'red'],
    ] as const)('leaves the state unchanged (%s)', (_label, make, viewer) => {
      const state = make();
      const before = structuredClone(state);
      for (const shipId of ['R1', 'B1', 'NOPE', null]) {
        buildOrderPanel(state, shipId, viewer);
        buildOrderPanel(viewFor(state, viewer), shipId, viewer);
      }
      expect(state).toEqual(before);
    });
  });
});
