import { describe, expect, it } from 'vitest';
import { IllegalOrderError, resolveMove, type Pose } from '../../src/rules/movement';
import { NO_ORDER, formatOrder, isValidOrder, type Order, type TurnDirection } from '../../src/rules/orders';
import type { DriveState } from '../../src/rules/ship';

const order = (thrustChange: number, turnDirection: TurnDirection = 'P', turnPoints = 0): Order => ({
  thrustChange,
  turnDirection,
  turnPoints,
});

interface TestShip {
  id: string;
  position: { x: number; y: number };
  course: number;
  velocity: number;
  drives: DriveState[];
}

const makeShip = (overrides: Partial<TestShip> = {}): TestShip => ({
  id: 'test-ship',
  position: { x: 100, y: 50 },
  course: 12,
  velocity: 4,
  drives: [{ thrust: 6, functional: true }],
  ...overrides,
});

const SQRT3 = Math.sqrt(3);

function expectPose(pose: Pose, x: number, y: number, course: number) {
  expect(pose.position.x).toBeCloseTo(x);
  expect(pose.position.y).toBeCloseTo(y);
  expect(pose.course).toBe(course);
}

/** Treats -0 and 0 as equal. */
const expectZero = (value: number) => expect(value === 0).toBe(true);

describe('resolveMove: the rulebook worked example', () => {
  // Thrust-6 ship starting at velocity 6 on course 12.
  const turns: { order: Order; velocity: number; course: number; text: string }[] = [
    { order: order(2), velocity: 8, course: 12, text: '+2' },
    { order: order(2, 'P', 2), velocity: 10, course: 10, text: '+2, P2' },
    { order: order(0, 'P', 1), velocity: 10, course: 9, text: 'P1' },
    { order: order(-3, 'S', 1), velocity: 7, course: 10, text: '-3, S1' },
    { order: NO_ORDER, velocity: 7, course: 10, text: '–' },
    { order: order(0, 'S', 3), velocity: 7, course: 1, text: 'S3' },
    { order: order(5, 'S', 1), velocity: 12, course: 2, text: '+5, S1' },
    { order: order(6), velocity: 18, course: 2, text: '+6' },
    { order: order(-3, 'P', 3), velocity: 15, course: 11, text: '-3, P3' },
  ];

  it('produces the published velocity and course after every turn', () => {
    let ship = makeShip({ position: { x: 0, y: 0 }, course: 12, velocity: 6 });
    for (const turn of turns) {
      expect(formatOrder(turn.order)).toBe(turn.text);
      expect(isValidOrder(ship, turn.order), `order ${turn.text} should be valid`).toBe(true);
      const result = resolveMove(ship, turn.order);
      expect(result.velocity, `velocity after ${turn.text}`).toBe(turn.velocity);
      expect(result.end.course, `course after ${turn.text}`).toBe(turn.course);
      ship = { ...ship, position: result.end.position, course: result.end.course, velocity: result.velocity };
    }
  });

  it('moves the full new velocity each turn (distance travelled sums to the velocity)', () => {
    let ship = makeShip({ position: { x: 0, y: 0 }, course: 12, velocity: 6 });
    for (const turn of turns) {
      const result = resolveMove(ship, turn.order);
      const [, firstMove, , secondMove] = result.steps;
      expect(firstMove.distance + secondMove.distance).toBeCloseTo(turn.velocity);
      ship = { ...ship, position: result.end.position, course: result.end.course, velocity: result.velocity };
    }
  });
});

describe('resolveMove: step structure', () => {
  it('always gives four steps: pivot, move, pivot, move', () => {
    const result = resolveMove(makeShip(), order(2, 'S', 2));
    expect(result.steps.map((s) => s.kind)).toEqual(['pivot', 'move', 'pivot', 'move']);
  });

  it('chains the steps: each step starts where the previous one ended', () => {
    const result = resolveMove(makeShip(), order(1, 'P', 3));
    expect(result.steps[0].from).toEqual(result.start);
    for (let i = 1; i < 4; i++) {
      expect(result.steps[i].from).toEqual(result.steps[i - 1].to);
    }
    expect(result.steps[3].to).toEqual(result.end);
  });

  it('pivots do not change position and moves do not change course', () => {
    const result = resolveMove(makeShip(), order(-1, 'S', 3));
    for (const step of result.steps) {
      if (step.kind === 'pivot') {
        expect(step.to.position).toEqual(step.from.position);
      } else {
        expect(step.to.course).toBe(step.from.course);
      }
    }
  });

  it('each move step covers half the new velocity, including odd velocities', () => {
    const ship = makeShip({ velocity: 5, course: 4 });
    const result = resolveMove(ship, order(2, 'S', 1)); // velocity 7
    expect(result.velocity).toBe(7);
    const moves = [result.steps[1], result.steps[3]];
    for (const step of moves) {
      expect(step.distance).toBeCloseTo(3.5);
      const travelled = Math.hypot(step.to.position.x - step.from.position.x, step.to.position.y - step.from.position.y);
      expect(travelled).toBeCloseTo(3.5);
    }
  });

  it('splits the turn: floor(turn / 2) first, the rest at the mid-point', () => {
    const cases: [TurnDirection, number, number, number][] = [
      ['S', 1, 0, 1],
      ['S', 2, 1, 1],
      ['S', 3, 1, 2],
      ['P', 1, 0, -1],
      ['P', 2, -1, -1],
      ['P', 3, -1, -2],
    ];
    for (const [dir, points, first, second] of cases) {
      const result = resolveMove(makeShip(), order(0, dir, points));
      const [p1, , p2] = result.steps;
      expect(p1.points === first, `${dir}${points} first pivot`).toBe(true);
      expect(p2.points, `${dir}${points} second pivot`).toBe(second);
    }
  });

  it('records the starting pose and the velocity', () => {
    const result = resolveMove(makeShip(), order(2));
    expectPose(result.start, 100, 50, 12);
    expect(result.velocity).toBe(6);
  });
});

describe('resolveMove: geometry', () => {
  it('S3 from (100, 50), course 12, velocity 4: pivot 1, move 2, pivot 2, move 2', () => {
    const result = resolveMove(makeShip(), order(0, 'S', 3));
    const [p1, m1, p2, m2] = result.steps;

    expect(p1.points).toBe(1);
    expectPose(p1.to, 100, 50, 1);

    expect(m1.distance).toBeCloseTo(2);
    expectPose(m1.to, 101, 50 - SQRT3, 1);

    expect(p2.points).toBe(2);
    expectPose(p2.to, 101, 50 - SQRT3, 3);

    expect(m2.distance).toBeCloseTo(2);
    expectPose(m2.to, 103, 50 - SQRT3, 3);

    expectPose(result.end, 103, 50 - SQRT3, 3);
    expect(result.velocity).toBe(4);
  });

  it('P1 from (100, 50), course 12, velocity 4: straight first half, turn at the mid-point', () => {
    const result = resolveMove(makeShip(), order(0, 'P', 1));
    const [p1, m1, p2, m2] = result.steps;

    expectZero(p1.points);
    expectPose(p1.to, 100, 50, 12);

    expectPose(m1.to, 100, 48, 12);

    expect(p2.points).toBe(-1);
    expectPose(p2.to, 100, 48, 11);

    expect(m2.distance).toBeCloseTo(2);
    expectPose(m2.to, 99, 48 - SQRT3, 11);

    expectPose(result.end, 99, 48 - SQRT3, 11);
  });

  it('moves straight ahead with no turn', () => {
    const east = resolveMove(makeShip({ course: 3, velocity: 6 }), NO_ORDER);
    expectPose(east.end, 106, 50, 3);
    const south = resolveMove(makeShip({ course: 6, velocity: 6 }), order(-2));
    expectPose(south.end, 100, 54, 6);
    const west = resolveMove(makeShip({ course: 9, velocity: 1 }), order(2));
    expectPose(west.end, 97, 50, 9);
  });

  it('applies the velocity change in the same turn', () => {
    const result = resolveMove(makeShip({ course: 12, velocity: 4 }), order(6));
    expect(result.velocity).toBe(10);
    expectPose(result.end, 100, 40, 12);
  });

  it('a ship at velocity 0 may still pivot in place', () => {
    const result = resolveMove(makeShip({ velocity: 0 }), order(0, 'S', 2));
    expectPose(result.end, 100, 50, 2);
    expect(result.velocity).toBe(0);
  });

  it('a ship with no working drives coasts on its course and velocity', () => {
    const ship = makeShip({
      course: 3,
      velocity: 5,
      drives: [
        { thrust: 3, functional: false },
        { thrust: 3, functional: false },
      ],
    });
    const result = resolveMove(ship, NO_ORDER);
    expect(result.velocity).toBe(5);
    expectPose(result.end, 105, 50, 3);
  });
});

describe('resolveMove: illegal orders', () => {
  it('throws IllegalOrderError for an order using too much thrust on turning', () => {
    const ship = makeShip({ velocity: 6 });
    expect(() => resolveMove(ship, order(2, 'P', 4))).toThrow(IllegalOrderError);
  });

  it('carries the ship id and the reasons', () => {
    const ship = makeShip({ id: 'alpha', velocity: 1 });
    try {
      resolveMove(ship, order(-2));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalOrderError);
      const illegal = error as IllegalOrderError;
      expect(illegal.name).toBe('IllegalOrderError');
      expect(illegal.shipId).toBe('alpha');
      expect(illegal.reasons.length).toBeGreaterThan(0);
      expect(illegal.message).toContain('alpha');
    }
  });

  it('throws when a ship with no working drives tries to manoeuvre', () => {
    const ship = makeShip({ drives: [{ thrust: 6, functional: false }] });
    expect(() => resolveMove(ship, order(0, 'S', 1))).toThrow(IllegalOrderError);
    expect(() => resolveMove(ship, order(1))).toThrow(IllegalOrderError);
  });

  it('throws on a fractional thrust change', () => {
    expect(() => resolveMove(makeShip(), order(0.5))).toThrow(IllegalOrderError);
  });
});

describe('resolveMove: purity', () => {
  it('does not mutate the ship or the order', () => {
    const ship = makeShip();
    const o = order(1, 'S', 3);
    const shipBefore = structuredClone(ship);
    const orderBefore = structuredClone(o);
    const result = resolveMove(ship, o);
    expect(ship).toEqual(shipBefore);
    expect(o).toEqual(orderBefore);
    expect(result.start.position).not.toBe(ship.position);
    expect(result.end.position).not.toBe(ship.position);
  });

  it('mutating the result does not affect the ship', () => {
    const ship = makeShip();
    const result = resolveMove(ship, order(0, 'S', 2));
    result.start.position.x = -999;
    result.end.position.y = -999;
    result.steps[0].to.position.x = -999;
    expect(ship.position).toEqual({ x: 100, y: 50 });
  });
});
