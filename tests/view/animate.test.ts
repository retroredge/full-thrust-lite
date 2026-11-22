import { describe, expect, it } from 'vitest';
import { courseToDegrees, type Vec2 } from '../../src/rules/course';
import { resolveMove, type MoveResult } from '../../src/rules/movement';
import { NO_ORDER, type Order, type TurnDirection } from '../../src/rules/orders';
import { easeInOut, pathPoints, pathUpTo, poseAt, type AnimatedPose } from '../../src/view/animate';

const order = (thrustChange: number, turnDirection: TurnDirection = 'P', turnPoints = 0): Order => ({
  thrustChange,
  turnDirection,
  turnPoints,
});

const moveFor = (course: number, velocity: number, plotted: Order, thrust = 6): MoveResult =>
  resolveMove(
    {
      id: 'test',
      position: { x: 10, y: 20 },
      course,
      velocity,
      drives: [{ thrust, functional: true }],
    },
    plotted,
  );

/** Signed difference between two headings, wrapped into -180..180. */
const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function expectPoint(actual: Vec2, expected: Vec2) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

function expectHeading(actual: number, expected: number) {
  expect(Math.abs(angleDiff(actual, expected))).toBeLessThan(1e-6);
}

const SAMPLES = 2000;
const sample = (move: MoveResult): AnimatedPose[] =>
  Array.from({ length: SAMPLES + 1 }, (_, index) => poseAt(move, index / SAMPLES));

/** A variety of moves, including port and starboard turns, odd turns, and stops. */
const MOVES: [string, MoveResult][] = [
  ['coasting at 4', moveFor(12, 4, NO_ORDER)],
  ['accelerating +2', moveFor(3, 4, order(2))],
  ['the rulebook +2, P2 example', moveFor(12, 4, order(2, 'P', 2))],
  ['starboard 3 from course 11', moveFor(11, 5, order(-1, 'S', 3))],
  ['port 1 at velocity 3', moveFor(1, 3, order(0, 'P', 1))],
  ['slowing to a stop while turning', moveFor(6, 2, order(-2, 'S', 2))],
  ['a pure pivot at velocity 0', moveFor(12, 0, order(0, 'P', 3))],
  ['standing still', moveFor(9, 0, NO_ORDER)],
];

describe('poseAt', () => {
  for (const [name, move] of MOVES) {
    describe(name, () => {
      it('starts at the start pose and ends at the end pose', () => {
        const start = poseAt(move, 0);
        expectPoint(start.position, move.start.position);
        expectHeading(start.heading, courseToDegrees(move.start.course));
        const end = poseAt(move, 1);
        expectPoint(end.position, move.end.position);
        expectHeading(end.heading, courseToDegrees(move.end.course));
      });

      it('clamps progress outside 0..1', () => {
        expect(poseAt(move, -0.5)).toEqual(poseAt(move, 0));
        expect(poseAt(move, 1.7)).toEqual(poseAt(move, 1));
      });

      it('moves continuously, without jumps in position or heading', () => {
        const poses = sample(move);
        // A half move takes at least a third of the animation and a pivot is at most 90 degrees,
        // so per sample the ship cannot move more than a few thousandths of its velocity.
        const maxStep = (move.velocity * 4) / SAMPLES + 1e-9;
        for (let index = 1; index < poses.length; index += 1) {
          expect(distance(poses[index]!.position, poses[index - 1]!.position)).toBeLessThanOrEqual(maxStep);
          expect(Math.abs(angleDiff(poses[index]!.heading, poses[index - 1]!.heading))).toBeLessThan(2);
        }
      });

      it('only turns while still and only moves while holding its heading', () => {
        const poses = sample(move);
        let mixed = 0;
        for (let index = 1; index < poses.length; index += 1) {
          const moved = distance(poses[index]!.position, poses[index - 1]!.position) > 1e-9;
          const turned = Math.abs(angleDiff(poses[index]!.heading, poses[index - 1]!.heading)) > 1e-9;
          if (moved && turned) {
            mixed += 1;
          }
        }
        // Only an interval that straddles a step boundary may show both.
        expect(mixed).toBeLessThanOrEqual(3);
      });

      it('is always either pivoting at a pivot point or moving along a move segment', () => {
        for (const pose of sample(move)) {
          const fits = move.steps.some((step) => {
            const fromHeading = courseToDegrees(step.from.course);
            if (step.kind === 'pivot') {
              if (distance(pose.position, step.from.position) > 1e-9) {
                return false;
              }
              const turned = angleDiff(pose.heading, fromHeading);
              const target = step.points * 30;
              return turned >= Math.min(0, target) - 1e-9 && turned <= Math.max(0, target) + 1e-9;
            }
            const onSegment =
              Math.abs(
                distance(step.from.position, pose.position) +
                  distance(pose.position, step.to.position) -
                  distance(step.from.position, step.to.position),
              ) < 1e-9;
            return onSegment && Math.abs(angleDiff(pose.heading, fromHeading)) < 1e-9;
          });
          expect(fits, `pose ${JSON.stringify(pose)}`).toBe(true);
        }
      });
    });
  }

  it('moves a straight, unturned move linearly along its line', () => {
    const move = moveFor(2, 4, order(2));
    const heading = courseToDegrees(2);
    for (let index = 0; index <= 20; index += 1) {
      const t = index / 20;
      const pose = poseAt(move, t);
      expectPoint(pose.position, {
        x: move.start.position.x + (move.end.position.x - move.start.position.x) * t,
        y: move.start.position.y + (move.end.position.y - move.start.position.y) * t,
      });
      expectHeading(pose.heading, heading);
    }
    expect(distance(move.start.position, move.end.position)).toBeCloseTo(6);
  });

  it('turns on the spot for a pivot at velocity 0, in the plotted direction', () => {
    const move = moveFor(12, 0, order(0, 'S', 2));
    let previousTurn = 0;
    for (let index = 0; index <= 50; index += 1) {
      const pose = poseAt(move, index / 50);
      expectPoint(pose.position, { x: 10, y: 20 });
      const turned = angleDiff(pose.heading, 0);
      expect(turned).toBeGreaterThanOrEqual(previousTurn - 1e-9);
      previousTurn = turned;
    }
    expect(previousTurn).toBeCloseTo(60);
    expect(move.end.course).toBe(2);
  });

  it('keeps a ship with no order at velocity 0 where it is', () => {
    const move = moveFor(4, 0, NO_ORDER);
    for (let index = 0; index <= 10; index += 1) {
      const pose = poseAt(move, index / 10);
      expectPoint(pose.position, { x: 10, y: 20 });
      expectHeading(pose.heading, courseToDegrees(4));
    }
  });
});

describe('pathPoints', () => {
  it('gives the start, the mid-point after the first half move, and the end', () => {
    const move = moveFor(12, 4, order(2, 'P', 2));
    const points = pathPoints(move);
    expect(points).toHaveLength(3);
    expectPoint(points[0]!, move.start.position);
    expectPoint(points[1]!, move.steps[1].to.position);
    expectPoint(points[2]!, move.end.position);
    // The mid-point is half the new velocity from the start.
    expect(distance(points[0]!, points[1]!)).toBeCloseTo(3);
    expect(distance(points[1]!, points[2]!)).toBeCloseTo(3);
  });

  it('returns copies', () => {
    const move = moveFor(12, 4, NO_ORDER);
    pathPoints(move)[0]!.x = 999;
    expect(move.start.position.x).toBe(10);
  });
});

describe('pathUpTo', () => {
  for (const [name, move] of MOVES.filter(([, candidate]) => candidate.velocity > 0)) {
    it(`follows the path travelled so far: ${name}`, () => {
      const [start, middle] = pathPoints(move) as [Vec2, Vec2, Vec2];
      let sawMiddle = false;
      for (let index = 0; index <= 200; index += 1) {
        const t = index / 200;
        const path = pathUpTo(move, t);
        const current = poseAt(move, t).position;
        expectPoint(path[0]!, start);
        expectPoint(path[path.length - 1]!, current);

        const onFirstHalf = Math.abs(distance(start, current) + distance(current, middle) - distance(start, middle)) < 1e-9;
        const atMiddle = distance(current, middle) < 1e-9;
        if (path.length === 3) {
          sawMiddle = true;
          expectPoint(path[1]!, middle);
          // The middle is only included once the ship has reached it.
          expect(onFirstHalf && !atMiddle).toBe(false);
        } else {
          expect(path).toHaveLength(2);
          expect(onFirstHalf).toBe(true);
        }
      }
      expect(sawMiddle).toBe(true);
      expect(pathUpTo(move, 0)).toHaveLength(2);
      expect(pathUpTo(move, 1)).toHaveLength(3);
    });
  }
});

describe('easeInOut', () => {
  it('starts at 0, ends at 1 and passes the half-way point at 0.5', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });

  it('never decreases', () => {
    let previous = easeInOut(0);
    for (let index = 1; index <= 1000; index += 1) {
      const value = easeInOut(index / 1000);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('eases: slow at the ends, symmetric about the middle', () => {
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    expect(easeInOut(0.2) + easeInOut(0.8)).toBeCloseTo(1);
  });
});
