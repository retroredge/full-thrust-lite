import { courseVector, turnCourse, type Vec2 } from './course';
import { signedTurn, validateOrder, velocityAfter, type Order } from './orders';
import type { Ship } from './ship';

export interface Pose {
  position: Vec2;
  course: number;
}

export interface PivotStep {
  kind: 'pivot';
  from: Pose;
  to: Pose;
  /** Course points turned in this step: starboard positive, port negative. */
  points: number;
}

export interface MoveStep {
  kind: 'move';
  from: Pose;
  to: Pose;
  /** Distance travelled in this step, in mu. */
  distance: number;
}

export interface MoveResult {
  /** Always four steps: pivot, move, pivot, move. */
  steps: [PivotStep, MoveStep, PivotStep, MoveStep];
  start: Pose;
  end: Pose;
  /** Velocity after the order's thrust has been applied; also the distance moved. */
  velocity: number;
}

export class IllegalOrderError extends Error {
  constructor(
    readonly shipId: string,
    readonly reasons: string[],
  ) {
    super(`Illegal order for ${shipId}: ${reasons.join(' ')}`);
    this.name = 'IllegalOrderError';
  }
}

type MovingShip = Pick<Ship, 'id' | 'position' | 'course' | 'velocity' | 'drives'>;

/**
 * Works out a ship's movement for one turn.
 *
 * The velocity change applies immediately. Half the course change, rounded
 * down, is made at the start; the ship then moves half its velocity, makes the
 * rest of the course change, and moves the other half.
 */
export function resolveMove(ship: MovingShip, order: Order): MoveResult {
  const errors = validateOrder(ship, order);
  if (errors.length > 0) {
    throw new IllegalOrderError(ship.id, errors);
  }

  const velocity = velocityAfter(ship, order);
  const half = velocity / 2;
  const turn = signedTurn(order);
  const direction = Math.sign(turn);
  // Adding 0 turns a negative zero into plain zero.
  const firstPivot = direction * Math.floor(Math.abs(turn) / 2) + 0;
  const secondPivot = turn - firstPivot;

  const start: Pose = { position: { ...ship.position }, course: ship.course };
  const afterFirstPivot = pivot(start, firstPivot);
  const afterFirstMove = advance(afterFirstPivot, half);
  const afterSecondPivot = pivot(afterFirstMove, secondPivot);
  const end = advance(afterSecondPivot, half);

  return {
    steps: [
      { kind: 'pivot', from: start, to: afterFirstPivot, points: firstPivot },
      { kind: 'move', from: afterFirstPivot, to: afterFirstMove, distance: half },
      { kind: 'pivot', from: afterFirstMove, to: afterSecondPivot, points: secondPivot },
      { kind: 'move', from: afterSecondPivot, to: end, distance: half },
    ],
    start,
    end,
    velocity,
  };
}

function pivot(pose: Pose, points: number): Pose {
  return { position: { ...pose.position }, course: turnCourse(pose.course, points) };
}

function advance(pose: Pose, distance: number): Pose {
  const direction = courseVector(pose.course);
  return {
    position: {
      x: pose.position.x + direction.x * distance,
      y: pose.position.y + direction.y * distance,
    },
    course: pose.course,
  };
}
