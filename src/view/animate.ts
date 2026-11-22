import { courseToDegrees, DEGREES_PER_POINT, type Vec2 } from '../rules/course';
import type { MoveResult } from '../rules/movement';

/** A ship's position and facing part-way through a move. Heading is degrees clockwise from north. */
export interface AnimatedPose {
  position: Vec2;
  heading: number;
}

/** Share of the animation given to a pivot, relative to 1 for each half move. */
const PIVOT_WEIGHT = 0.45;

function stepWeights(move: MoveResult): number[] {
  const weights = move.steps.map((step) => {
    if (step.kind === 'pivot') {
      return step.points === 0 ? 0 : PIVOT_WEIGHT;
    }
    return step.distance === 0 ? 0 : 1;
  });
  return weights.some((weight) => weight > 0) ? weights : [0, 1, 0, 1];
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * The ship's pose at `progress` through its move, from 0 (start) to 1 (end).
 * Pivots and straight moves play one after another, as in the rules.
 */
export function poseAt(move: MoveResult, progress: number): AnimatedPose {
  const t = Math.min(1, Math.max(0, progress));
  const weights = stepWeights(move);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;

  for (let index = 0; index < move.steps.length; index += 1) {
    const step = move.steps[index]!;
    const share = weights[index]! / total;
    if (share === 0) {
      continue;
    }
    if (t <= elapsed + share || index === move.steps.length - 1) {
      const local = Math.min(1, Math.max(0, (t - elapsed) / share));
      const startHeading = courseToDegrees(step.from.course);
      if (step.kind === 'pivot') {
        return {
          position: { ...step.from.position },
          heading: startHeading + step.points * DEGREES_PER_POINT * local,
        };
      }
      return {
        position: {
          x: lerp(step.from.position.x, step.to.position.x, local),
          y: lerp(step.from.position.y, step.to.position.y, local),
        },
        heading: startHeading,
      };
    }
    elapsed += share;
  }

  return { position: { ...move.end.position }, heading: courseToDegrees(move.end.course) };
}

/** The corner points of a move's path: start, mid-point and end. */
export function pathPoints(move: MoveResult): Vec2[] {
  return [move.start.position, move.steps[1].to.position, move.end.position].map((point) => ({ ...point }));
}

/** The path travelled so far at `progress`, ending at the ship's current position. */
export function pathUpTo(move: MoveResult, progress: number): Vec2[] {
  const current = poseAt(move, progress).position;
  const [start, middle] = pathPoints(move) as [Vec2, Vec2, Vec2];
  const weights = stepWeights(move);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const reachedMiddle = progress >= (weights[0]! + weights[1]!) / total;
  return reachedMiddle ? [start, middle, current] : [start, current];
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
