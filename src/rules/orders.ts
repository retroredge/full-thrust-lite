import { turnCourse } from './course';
import { availableThrust, maxTurnPoints, type Ship } from './ship';

export type TurnDirection = 'P' | 'S';

export interface Order {
  /** Thrust points spent on velocity: positive accelerates, negative decelerates. */
  thrustChange: number;
  /** Port is anticlockwise, starboard is clockwise. Ignored when `turnPoints` is 0. */
  turnDirection: TurnDirection;
  /** Thrust points spent on changing course. */
  turnPoints: number;
}

export const NO_ORDER: Readonly<Order> = Object.freeze({
  thrustChange: 0,
  turnDirection: 'P',
  turnPoints: 0,
});

type OrderShip = Pick<Ship, 'drives' | 'velocity'>;

export interface OrderLimits {
  /** Thrust available from working drives. */
  thrust: number;
  /** Lowest legal thrust change given the order's current turn points. */
  minThrustChange: number;
  /** Highest legal thrust change given the order's current turn points. */
  maxThrustChange: number;
  /** Most turn points allowed given the order's current thrust change. */
  maxTurnPoints: number;
}

/**
 * The legal range for each field of an order, given the value currently in
 * the other field. An order with all values inside these ranges is valid.
 */
export function orderLimits(ship: OrderShip, order: Order = NO_ORDER): OrderLimits {
  const thrust = availableThrust(ship);
  const turnPoints = Math.max(0, order.turnPoints);
  const forVelocity = Math.max(0, thrust - turnPoints);
  return {
    thrust,
    // Adding 0 turns a negative zero into plain zero.
    minThrustChange: -Math.min(ship.velocity, forVelocity) + 0,
    maxThrustChange: forVelocity,
    maxTurnPoints: Math.max(0, Math.min(maxTurnPoints(thrust), thrust - Math.abs(order.thrustChange))),
  };
}

/** Returns the reasons an order is illegal for a ship. An empty list means it is legal. */
export function validateOrder(ship: OrderShip, order: Order): string[] {
  const errors: string[] = [];
  const thrust = availableThrust(ship);

  if (!Number.isInteger(order.thrustChange)) {
    errors.push('Thrust change must be a whole number.');
  }
  if (!Number.isInteger(order.turnPoints) || order.turnPoints < 0) {
    errors.push('Turn points must be a whole number, zero or more.');
  }
  if (order.turnDirection !== 'P' && order.turnDirection !== 'S') {
    errors.push('Turn direction must be P or S.');
  }
  if (errors.length > 0) {
    return errors;
  }

  const used = thrustUsed(order);
  if (thrust === 0 && used > 0) {
    errors.push('The ship has no working drives and cannot change course or velocity.');
    return errors;
  }
  if (order.turnPoints > maxTurnPoints(thrust)) {
    errors.push(`At most ${maxTurnPoints(thrust)} of ${thrust} thrust points may be used to change course.`);
  }
  if (used > thrust) {
    errors.push(`The order uses ${used} thrust points but only ${thrust} are available.`);
  }
  if (ship.velocity + order.thrustChange < 0) {
    errors.push('Ships may not move backwards: velocity cannot drop below 0.');
  }
  return errors;
}

export function isValidOrder(ship: OrderShip, order: Order): boolean {
  return validateOrder(ship, order).length === 0;
}

/** Total thrust points an order spends. */
export function thrustUsed(order: Order): number {
  return Math.abs(order.thrustChange) + order.turnPoints;
}

/** Course points turned, signed: starboard is positive, port is negative. */
export function signedTurn(order: Order): number {
  if (order.turnPoints === 0) {
    return 0;
  }
  return order.turnDirection === 'S' ? order.turnPoints : -order.turnPoints;
}

export function isNoOrder(order: Order): boolean {
  return order.thrustChange === 0 && order.turnPoints === 0;
}

export function velocityAfter(ship: Pick<Ship, 'velocity'>, order: Order): number {
  return ship.velocity + order.thrustChange;
}

export function courseAfter(ship: Pick<Ship, 'course'>, order: Order): number {
  return turnCourse(ship.course, signedTurn(order));
}

/** Writes an order in the rules' notation, for example "+2, P2", "-3, S1" or "–" for no change. */
export function formatOrder(order: Order): string {
  const parts: string[] = [];
  if (order.thrustChange > 0) {
    parts.push(`+${order.thrustChange}`);
  } else if (order.thrustChange < 0) {
    parts.push(`${order.thrustChange}`);
  }
  if (order.turnPoints > 0) {
    parts.push(`${order.turnDirection}${order.turnPoints}`);
  }
  return parts.length > 0 ? parts.join(', ') : '–';
}
