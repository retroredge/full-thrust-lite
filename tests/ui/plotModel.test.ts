import { describe, expect, it } from 'vitest';
import { NO_ORDER, validateOrder, type Order, type TurnDirection } from '../../src/rules/orders';
import type { DriveState, Ship } from '../../src/rules/ship';
import {
  buildPlotRow,
  formatThrustChange,
  withDirection,
  withThrustChange,
  withTurnPoints,
  type DirectionChoice,
} from '../../src/ui/plotModel';

const order = (thrustChange: number, turnDirection: TurnDirection = 'P', turnPoints = 0): Order => ({
  thrustChange,
  turnDirection,
  turnPoints,
});

const makeShip = (drives: DriveState[], velocity: number, overrides: Partial<Ship> = {}): Ship => ({
  id: 'DD1',
  designId: 'destroyer',
  playerId: 'p1',
  name: 'Arrow',
  position: { x: 0, y: 0 },
  course: 12,
  velocity,
  drives,
  hullDamage: 0,
  weaponsLost: [],
  fireControlsLost: [],
  ...overrides,
});

/** A ship with the given working thrust; thrust 0 means a drive that has been knocked out. */
const shipWithThrust = (thrust: number, velocity: number): Ship =>
  makeShip(thrust > 0 ? [{ thrust, functional: true }] : [{ thrust: 3, functional: false }], velocity);

/** Two thrust-3 drives, as on the shipped designs. */
const twinDrives = (first = true, second = true): DriveState[] => [
  { thrust: 3, functional: first },
  { thrust: 3, functional: second },
];

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('buildPlotRow', () => {
  it('offers the full range for a thrust-6 ship at velocity 6 with no order', () => {
    const row = buildPlotRow(makeShip(twinDrives(), 6));
    expect(row.canPlot).toBe(true);
    expect(row.lockedReason).toBeNull();
    expect(row.order).toEqual(NO_ORDER);
    expect(row.thrustChoices).toEqual(range(-6, 6));
    expect(row.directionChoices).toEqual(['none', 'P', 'S']);
    expect(row.direction).toBe('none');
    expect(row.pointChoices).toEqual([]);
    expect(row.thrustAvailable).toBe(6);
    expect(row.maxTurn).toBe(3);
    expect(row.thrustUsed).toBe(0);
    expect(row.newVelocity).toBe(6);
    expect(row.newCourse).toBe(12);
  });

  it('offers 1 to 2 turn points once a direction is chosen after +4', () => {
    const ship = makeShip(twinDrives(), 6);
    const accelerated = order(4);
    const row = buildPlotRow(ship, accelerated);
    expect(row.direction).toBe('none');
    expect(row.pointChoices).toEqual([]);
    expect(row.directionChoices).toEqual(['none', 'P', 'S']);

    for (const direction of ['P', 'S'] as const) {
      const turning = buildPlotRow(ship, withDirection(accelerated, direction));
      expect(turning.direction).toBe(direction);
      expect(turning.pointChoices).toEqual([1, 2]);
    }
  });

  it('offers no turn after +6 uses all the thrust', () => {
    const row = buildPlotRow(makeShip(twinDrives(), 6), order(6));
    expect(row.directionChoices).toEqual(['none']);
  });

  it('limits thrust changes to -3..+3 when P3 is set', () => {
    const row = buildPlotRow(makeShip(twinDrives(), 6), order(0, 'P', 3));
    expect(row.direction).toBe('P');
    expect(row.thrustChoices).toEqual(range(-3, 3));
    expect(row.pointChoices).toEqual([1, 2, 3]);
  });

  it('stops deceleration at the current velocity', () => {
    expect(buildPlotRow(makeShip(twinDrives(), 2)).thrustChoices).toEqual(range(-2, 6));
    expect(buildPlotRow(makeShip(twinDrives(), 0)).thrustChoices).toEqual(range(0, 6));
  });

  it('gives a max turn of 2 when one of two thrust-3 drives is out', () => {
    const row = buildPlotRow(makeShip(twinDrives(true, false), 4));
    expect(row.canPlot).toBe(true);
    expect(row.thrustAvailable).toBe(3);
    expect(row.maxTurn).toBe(2);
    expect(row.thrustChoices).toEqual(range(-3, 3));
    expect(buildPlotRow(makeShip(twinDrives(true, false), 4), order(0, 'S', 1)).pointChoices).toEqual([1, 2]);
  });

  it('locks the row when every drive is out', () => {
    const row = buildPlotRow(makeShip(twinDrives(false, false), 5));
    expect(row.canPlot).toBe(false);
    expect(row.lockedReason).toBe('No working drives');
    expect(row.thrustChoices).toEqual([0]);
    expect(row.directionChoices).toEqual(['none']);
    expect(row.pointChoices).toEqual([]);
    expect(row.thrustAvailable).toBe(0);
    expect(row.maxTurn).toBe(0);
    expect(row.newVelocity).toBe(5);
  });

  it('works out the new velocity, new course and thrust used', () => {
    const ship = makeShip(twinDrives(), 4);
    const rulebook = buildPlotRow(ship, order(2, 'P', 2));
    expect(rulebook.newVelocity).toBe(6);
    expect(rulebook.newCourse).toBe(10);
    expect(rulebook.thrustUsed).toBe(4);

    const slowing = buildPlotRow(makeShip(twinDrives(), 4, { course: 11 }), order(-3, 'S', 3));
    expect(slowing.newVelocity).toBe(1);
    expect(slowing.newCourse).toBe(2);
    expect(slowing.thrustUsed).toBe(6);
  });

  it('ignores the stored direction when there are no turn points', () => {
    const row = buildPlotRow(makeShip(twinDrives(), 4), order(1, 'S', 0));
    expect(row.direction).toBe('none');
    expect(row.newCourse).toBe(12);
    expect(row.pointChoices).toEqual([]);
  });
});

describe('buildPlotRow offers exactly the legal values', () => {
  const key = (value: Order) => `${value.thrustChange}|${value.turnDirection}|${value.turnPoints}`;
  const isLegal = (ship: Ship, candidate: Order) => validateOrder(ship, candidate).length === 0;
  const SPAN = range(-12, 12);

  for (const thrust of range(0, 8)) {
    for (const velocity of range(0, 8)) {
      it(`thrust ${thrust}, velocity ${velocity}`, () => {
        const ship = shipWithThrust(thrust, velocity);
        const seen = new Map<string, Order>();
        const queue: Order[] = [{ ...NO_ORDER }];

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (seen.has(key(current))) {
            continue;
          }
          seen.set(key(current), current);
          expect(validateOrder(ship, current), `reached ${key(current)}`).toEqual([]);

          const row = buildPlotRow(ship, current);
          const context = `order ${key(current)}`;
          expect(row.canPlot, context).toBe(thrust > 0);

          if (!row.canPlot) {
            expect(row.thrustChoices, context).toEqual([0]);
            expect(row.directionChoices, context).toEqual(['none']);
            expect(row.pointChoices, context).toEqual([]);
            continue;
          }

          // Thrust changes: exactly the legal ones, with the current turn kept.
          const legalThrust = SPAN.filter((value) => isLegal(ship, withThrustChange(current, value)));
          expect(row.thrustChoices, context).toEqual(legalThrust);

          // Directions: a turn is offered exactly when some turn is legal with this thrust change.
          const canTurn = range(1, 12).some((points) => isLegal(ship, { ...current, turnPoints: points }));
          const expectedDirections: DirectionChoice[] = canTurn ? ['none', 'P', 'S'] : ['none'];
          expect(row.directionChoices, context).toEqual(expectedDirections);

          // Turn points: exactly the legal ones for each direction, with the current thrust change kept.
          if (row.direction === 'none') {
            expect(row.pointChoices, context).toEqual([]);
          }
          for (const direction of row.directionChoices) {
            if (direction === 'none') {
              continue;
            }
            const turning = withDirection(current, direction);
            const turningRow = buildPlotRow(ship, turning);
            const legalPoints = range(1, 12).filter((points) => isLegal(ship, withTurnPoints(turning, points)));
            expect(turningRow.pointChoices, `${context} turning ${direction}`).toEqual(legalPoints);
          }

          // Every choice offered leads to another order; each of those is checked when it is visited.
          for (const value of row.thrustChoices) {
            queue.push(withThrustChange(current, value));
          }
          for (const direction of row.directionChoices) {
            queue.push(withDirection(current, direction));
          }
          for (const points of row.pointChoices) {
            queue.push(withTurnPoints(current, points));
          }
        }

        // Every legal order can be reached through the inputs.
        for (const thrustChange of SPAN) {
          for (const turnDirection of ['P', 'S'] as const) {
            for (const turnPoints of range(0, 12)) {
              const candidate = order(thrustChange, turnDirection, turnPoints);
              if (!isLegal(ship, candidate)) {
                continue;
              }
              const reachable = [...seen.values()].some(
                (reached) =>
                  reached.thrustChange === thrustChange &&
                  reached.turnPoints === turnPoints &&
                  (turnPoints === 0 || reached.turnDirection === turnDirection),
              );
              expect(reachable, `legal order ${key(candidate)} is unreachable`).toBe(true);
            }
          }
        }
      });
    }
  }
});

describe('withThrustChange', () => {
  it('sets the thrust change and keeps the turn', () => {
    const before = order(1, 'S', 2);
    expect(withThrustChange(before, -3)).toEqual(order(-3, 'S', 2));
    expect(before).toEqual(order(1, 'S', 2));
  });
});

describe('withDirection', () => {
  it('starts a new turn at 1 point', () => {
    expect(withDirection(order(2), 'P')).toEqual(order(2, 'P', 1));
    expect(withDirection(order(2, 'P', 0), 'S')).toEqual(order(2, 'S', 1));
  });

  it('keeps the points when switching between port and starboard', () => {
    expect(withDirection(order(0, 'P', 3), 'S')).toEqual(order(0, 'S', 3));
  });

  it('zeroes the points when no turn is chosen', () => {
    const cleared = withDirection(order(1, 'S', 2), 'none');
    expect(cleared.turnPoints).toBe(0);
    expect(cleared.thrustChange).toBe(1);
  });

  it('does not change the order it was given', () => {
    const before = order(1);
    withDirection(before, 'S');
    expect(before).toEqual(order(1));
  });
});

describe('withTurnPoints', () => {
  it('sets the points and keeps the rest', () => {
    const before = order(-1, 'S', 1);
    expect(withTurnPoints(before, 3)).toEqual(order(-1, 'S', 3));
    expect(before).toEqual(order(-1, 'S', 1));
  });
});

describe('formatThrustChange', () => {
  it('signs positive values and leaves zero bare', () => {
    expect(formatThrustChange(3)).toBe('+3');
    expect(formatThrustChange(0)).toBe('0');
    expect(formatThrustChange(-0)).toBe('0');
    expect(formatThrustChange(-2)).toBe('-2');
  });
});
