import { NO_ORDER, courseAfter, orderLimits, thrustUsed, velocityAfter, type Order, type TurnDirection } from '../rules/orders';
import { maxTurnPoints, type Ship } from '../rules/ship';

export type DirectionChoice = 'none' | TurnDirection;

/** Everything one row of the movement plot shows, and the values its inputs may offer. */
export interface PlotRow {
  shipId: string;
  canPlot: boolean;
  /** Why the row is locked, when it is. */
  lockedReason: string | null;
  order: Order;
  /** Legal thrust changes, lowest first, given the current turn. */
  thrustChoices: number[];
  /** Legal turn directions given the current thrust change. */
  directionChoices: DirectionChoice[];
  direction: DirectionChoice;
  /** Legal turn point values given the current thrust change. Empty when no turn is selected. */
  pointChoices: number[];
  newVelocity: number;
  newCourse: number;
  thrustUsed: number;
  thrustAvailable: number;
  maxTurn: number;
}

export function buildPlotRow(ship: Ship, order: Order = NO_ORDER): PlotRow {
  const limits = orderLimits(ship, order);
  const canPlot = limits.thrust > 0;
  const direction: DirectionChoice = order.turnPoints > 0 ? order.turnDirection : 'none';

  const thrustChoices: number[] = [];
  for (let value = limits.minThrustChange; value <= limits.maxThrustChange; value += 1) {
    thrustChoices.push(value);
  }
  const pointChoices: number[] = [];
  if (direction !== 'none') {
    for (let value = 1; value <= limits.maxTurnPoints; value += 1) {
      pointChoices.push(value);
    }
  }

  const lockedReason = limits.thrust === 0 ? 'No working drives' : null;

  return {
    shipId: ship.id,
    canPlot,
    lockedReason,
    order,
    thrustChoices: canPlot ? thrustChoices : [0],
    directionChoices: canPlot && limits.maxTurnPoints > 0 ? ['none', 'P', 'S'] : ['none'],
    direction,
    pointChoices,
    newVelocity: velocityAfter(ship, order),
    newCourse: courseAfter(ship, order),
    thrustUsed: thrustUsed(order),
    thrustAvailable: limits.thrust,
    maxTurn: maxTurnPoints(limits.thrust),
  };
}

/** The order after the thrust change input is set. */
export function withThrustChange(order: Order, thrustChange: number): Order {
  return { ...order, thrustChange };
}

/** The order after the turn direction input is set. Choosing a direction starts the turn at 1 point. */
export function withDirection(order: Order, direction: DirectionChoice): Order {
  if (direction === 'none') {
    return { ...order, turnPoints: 0 };
  }
  return { ...order, turnDirection: direction, turnPoints: Math.max(1, order.turnPoints) };
}

/** The order after the turn points input is set. */
export function withTurnPoints(order: Order, turnPoints: number): Order {
  return { ...order, turnPoints };
}

export function formatThrustChange(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return value === 0 ? '0' : `${value}`;
}
