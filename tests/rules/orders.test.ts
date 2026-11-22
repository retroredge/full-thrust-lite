import { describe, expect, it } from 'vitest';
import {
  NO_ORDER,
  courseAfter,
  formatOrder,
  isNoOrder,
  isValidOrder,
  orderLimits,
  signedTurn,
  thrustUsed,
  validateOrder,
  velocityAfter,
  type Order,
  type TurnDirection,
} from '../../src/rules/orders';
import type { DriveState } from '../../src/rules/ship';

const order = (thrustChange: number, turnDirection: TurnDirection = 'P', turnPoints = 0): Order => ({
  thrustChange,
  turnDirection,
  turnPoints,
});

const shipWith = (thrust: number, velocity: number) => ({
  drives: [{ thrust, functional: true }] as DriveState[],
  velocity,
});

/** Two thrust-3 drives with one knocked out. */
const damagedShip = (velocity: number) => ({
  drives: [
    { thrust: 3, functional: true },
    { thrust: 3, functional: false },
  ],
  velocity,
});

/** Two thrust-3 drives, both knocked out. */
const crippledShip = (velocity: number) => ({
  drives: [
    { thrust: 3, functional: false },
    { thrust: 3, functional: false },
  ],
  velocity,
});

/** Treats -0 and 0 as equal. */
const expectZero = (value: number) => expect(value === 0).toBe(true);

describe('NO_ORDER', () => {
  it('changes nothing and is frozen', () => {
    expect(NO_ORDER.thrustChange).toBe(0);
    expect(NO_ORDER.turnPoints).toBe(0);
    expect(Object.isFrozen(NO_ORDER)).toBe(true);
    expect(isNoOrder(NO_ORDER)).toBe(true);
  });
});

describe('validateOrder', () => {
  const ship = shipWith(6, 6);

  it('accepts the no-change order', () => {
    expect(validateOrder(ship, NO_ORDER)).toEqual([]);
  });

  it('accepts "+4, P2" with thrust 6', () => {
    expect(validateOrder(ship, order(4, 'P', 2))).toEqual([]);
  });

  it('rejects "+2, P4" with thrust 6 (more than half on turning)', () => {
    expect(validateOrder(ship, order(2, 'P', 4))).not.toEqual([]);
    expect(isValidOrder(ship, order(2, 'P', 4))).toBe(false);
  });

  it('accepts exactly half the thrust on turning', () => {
    expect(isValidOrder(ship, order(0, 'S', 3))).toBe(true);
    expect(isValidOrder(ship, order(3, 'S', 3))).toBe(true);
    expect(isValidOrder(ship, order(-3, 'P', 3))).toBe(true);
  });

  it('allows 3 turn points with thrust 5 (rounded up) but not 4', () => {
    const five = shipWith(5, 5);
    expect(isValidOrder(five, order(0, 'S', 3))).toBe(true);
    expect(isValidOrder(five, order(2, 'S', 3))).toBe(true);
    expect(isValidOrder(five, order(0, 'S', 4))).toBe(false);
  });

  it('rejects orders using more than the total thrust', () => {
    expect(isValidOrder(ship, order(7))).toBe(false);
    expect(isValidOrder(ship, order(-7))).toBe(false);
    expect(isValidOrder(ship, order(4, 'S', 3))).toBe(false);
    expect(isValidOrder(ship, order(-4, 'P', 3))).toBe(false);
  });

  it('accepts using all the thrust on velocity', () => {
    expect(isValidOrder(ship, order(6))).toBe(true);
    expect(isValidOrder(ship, order(-6))).toBe(true);
  });

  it('rejects decelerating below velocity 0', () => {
    const slow = shipWith(6, 2);
    expect(isValidOrder(slow, order(-2))).toBe(true);
    expect(isValidOrder(slow, order(-3))).toBe(false);
    expect(validateOrder(slow, order(-3)).join(' ')).toMatch(/below 0/);
  });

  it('rejects non-integer thrust change', () => {
    expect(isValidOrder(ship, order(1.5))).toBe(false);
    expect(isValidOrder(ship, order(NaN))).toBe(false);
  });

  it('rejects non-integer turn points', () => {
    expect(isValidOrder(ship, order(0, 'S', 0.5))).toBe(false);
    expect(isValidOrder(ship, order(0, 'S', 1.5))).toBe(false);
  });

  it('rejects negative turn points', () => {
    expect(isValidOrder(ship, order(0, 'S', -1))).toBe(false);
    expect(isValidOrder(ship, order(2, 'P', -2))).toBe(false);
  });

  it('rejects an unknown turn direction', () => {
    expect(isValidOrder(ship, { thrustChange: 0, turnDirection: 'X' as TurnDirection, turnPoints: 1 })).toBe(false);
  });

  it('reports several reasons at once when appropriate', () => {
    const slow = shipWith(6, 1);
    // P4 is too many turn points, and -3 takes velocity below zero, and 7 > 6.
    expect(validateOrder(slow, order(-3, 'P', 4)).length).toBeGreaterThanOrEqual(2);
  });

  describe('with one of two thrust-3 drives knocked out', () => {
    const damaged = damagedShip(4);

    it('has thrust 3 and a turn limit of 2', () => {
      expect(orderLimits(damaged).thrust).toBe(3);
      expect(orderLimits(damaged).maxTurnPoints).toBe(2);
    });

    it('accepts orders within thrust 3', () => {
      expect(isValidOrder(damaged, order(3))).toBe(true);
      expect(isValidOrder(damaged, order(1, 'S', 2))).toBe(true);
      expect(isValidOrder(damaged, order(-1, 'P', 2))).toBe(true);
    });

    it('rejects orders beyond thrust 3', () => {
      expect(isValidOrder(damaged, order(4))).toBe(false);
      expect(isValidOrder(damaged, order(0, 'S', 3))).toBe(false);
      expect(isValidOrder(damaged, order(2, 'S', 2))).toBe(false);
    });
  });

  describe('with all drives knocked out', () => {
    const crippled = crippledShip(5);

    it('still accepts the no-change order', () => {
      expect(validateOrder(crippled, NO_ORDER)).toEqual([]);
    });

    it('rejects any change of course or velocity', () => {
      expect(isValidOrder(crippled, order(1))).toBe(false);
      expect(isValidOrder(crippled, order(-1))).toBe(false);
      expect(isValidOrder(crippled, order(0, 'S', 1))).toBe(false);
      expect(isValidOrder(crippled, order(0, 'P', 1))).toBe(false);
      expect(validateOrder(crippled, order(1)).join(' ')).toMatch(/no working drives/);
    });
  });
});

describe('orderLimits', () => {
  it('with no order set, gives the full ranges for thrust 6, velocity 6', () => {
    expect(orderLimits(shipWith(6, 6))).toEqual({
      thrust: 6,
      minThrustChange: -6,
      maxThrustChange: 6,
      maxTurnPoints: 3,
    });
  });

  it('defaults to NO_ORDER', () => {
    const ship = shipWith(6, 6);
    expect(orderLimits(ship)).toEqual(orderLimits(ship, NO_ORDER));
  });

  it('narrows the thrust change range as turn points are set', () => {
    const ship = shipWith(6, 10);
    for (let tp = 0; tp <= 3; tp++) {
      const limits = orderLimits(ship, order(0, 'S', tp));
      expect(limits.minThrustChange).toBe(-(6 - tp));
      expect(limits.maxThrustChange).toBe(6 - tp);
    }
  });

  it('narrows the turn points as thrust change is set', () => {
    const ship = shipWith(6, 10);
    const expected: Record<number, number> = { 0: 3, 1: 3, 2: 3, 3: 3, 4: 2, 5: 1, 6: 0 };
    for (const [tc, max] of Object.entries(expected)) {
      expect(orderLimits(ship, order(Number(tc))).maxTurnPoints).toBe(max);
      expect(orderLimits(ship, order(-Number(tc))).maxTurnPoints).toBe(max);
    }
  });

  it('never gives negative max turn points, even for an over-large thrust change', () => {
    expect(orderLimits(shipWith(6, 10), order(9)).maxTurnPoints).toBe(0);
  });

  it('limits deceleration to the current velocity', () => {
    expect(orderLimits(shipWith(6, 2)).minThrustChange).toBe(-2);
    expect(orderLimits(shipWith(6, 4), order(0, 'P', 1)).minThrustChange).toBe(-4);
    expect(orderLimits(shipWith(6, 4), order(0, 'P', 3)).minThrustChange).toBe(-3);
    expectZero(orderLimits(shipWith(6, 0)).minThrustChange);
    expect(orderLimits(shipWith(6, 0)).maxThrustChange).toBe(6);
  });

  it('gives thrust 5 a turn limit of 3', () => {
    expect(orderLimits(shipWith(5, 5)).maxTurnPoints).toBe(3);
    expect(orderLimits(shipWith(5, 5), order(3)).maxTurnPoints).toBe(2);
  });

  it('gives a ship with no working drives no room at all', () => {
    const limits = orderLimits(crippledShip(5));
    expect(limits.thrust).toBe(0);
    expectZero(limits.minThrustChange);
    expectZero(limits.maxThrustChange);
    expectZero(limits.maxTurnPoints);
  });

  it('ignores negative turn points when narrowing thrust change', () => {
    const limits = orderLimits(shipWith(6, 10), order(0, 'S', -2));
    expect(limits.maxThrustChange).toBe(6);
    expect(limits.minThrustChange).toBe(-6);
  });
});

describe('thrustUsed', () => {
  it('adds the size of the velocity change to the turn points', () => {
    expect(thrustUsed(order(4, 'P', 2))).toBe(6);
    expect(thrustUsed(order(-3, 'S', 1))).toBe(4);
    expect(thrustUsed(NO_ORDER)).toBe(0);
  });
});

describe('signedTurn', () => {
  it('is positive for starboard and negative for port', () => {
    expect(signedTurn(order(0, 'S', 3))).toBe(3);
    expect(signedTurn(order(0, 'P', 2))).toBe(-2);
  });

  it('is zero with no turn points whatever the direction', () => {
    expect(signedTurn(order(2, 'S', 0))).toBe(0);
    expect(signedTurn(order(2, 'P', 0))).toBe(0);
  });
});

describe('isNoOrder', () => {
  it('is true only when neither velocity nor course changes', () => {
    expect(isNoOrder(order(0, 'S', 0))).toBe(true);
    expect(isNoOrder(order(1))).toBe(false);
    expect(isNoOrder(order(0, 'P', 1))).toBe(false);
  });
});

describe('courseAfter', () => {
  it('applies the rules examples', () => {
    expect(courseAfter({ course: 3 }, order(0, 'P', 2))).toBe(1);
    expect(courseAfter({ course: 3 }, order(0, 'S', 2))).toBe(5);
    expect(courseAfter({ course: 1 }, order(0, 'P', 2))).toBe(11);
    expect(courseAfter({ course: 11 }, order(0, 'S', 3))).toBe(2);
  });

  it('is unchanged with no turn', () => {
    expect(courseAfter({ course: 12 }, order(4))).toBe(12);
  });
});

describe('velocityAfter', () => {
  it('adds the thrust change to the velocity', () => {
    expect(velocityAfter({ velocity: 6 }, order(2))).toBe(8);
    expect(velocityAfter({ velocity: 10 }, order(-3))).toBe(7);
    expect(velocityAfter({ velocity: 5 }, NO_ORDER)).toBe(5);
    expect(velocityAfter({ velocity: 3 }, order(-3, 'P', 1))).toBe(0);
  });
});

describe('formatOrder', () => {
  it('writes orders in the rules notation', () => {
    expect(formatOrder(order(2, 'P', 2))).toBe('+2, P2');
    expect(formatOrder(order(-3, 'S', 1))).toBe('-3, S1');
    expect(formatOrder(order(0, 'P', 1))).toBe('P1');
    expect(formatOrder(order(0, 'S', 3))).toBe('S3');
    expect(formatOrder(order(6))).toBe('+6');
    expect(formatOrder(order(-3))).toBe('-3');
  });

  it('writes an en dash for no order', () => {
    expect(formatOrder(NO_ORDER)).toBe('–');
    expect(formatOrder(order(0, 'S', 0))).toBe('–');
  });

  it('omits the direction when there are no turn points', () => {
    expect(formatOrder(order(4, 'S', 0))).toBe('+4');
  });
});

/**
 * The rules stated directly, independent of the implementation:
 * - both fields whole numbers, turn points zero or more, direction P or S
 * - turn points at most half the thrust, rounded up
 * - |velocity change| + turn points at most the total thrust
 * - velocity may not drop below 0
 * - no working drives means only the no-change order (implied by the above)
 */
function rulesSayValid(thrust: number, velocity: number, o: Order): boolean {
  if (!Number.isInteger(o.thrustChange) || !Number.isInteger(o.turnPoints) || o.turnPoints < 0) {
    return false;
  }
  if (o.turnDirection !== 'P' && o.turnDirection !== 'S') {
    return false;
  }
  if (o.turnPoints > Math.ceil(thrust / 2)) {
    return false;
  }
  if (Math.abs(o.thrustChange) + o.turnPoints > thrust) {
    return false;
  }
  if (velocity + o.thrustChange < 0) {
    return false;
  }
  if (thrust === 0 && (o.thrustChange !== 0 || o.turnPoints !== 0)) {
    return false;
  }
  return true;
}

describe('property: validateOrder and orderLimits agree with the rules', () => {
  const directions: TurnDirection[] = ['P', 'S'];

  it('validateOrder matches the rules for every small order', () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (let thrust = 0; thrust <= 8; thrust++) {
      for (let velocity = 0; velocity <= 10; velocity++) {
        const ship = shipWith(thrust, velocity);
        for (let tc = -10; tc <= 10; tc++) {
          for (const dir of directions) {
            for (let tp = 0; tp <= 6; tp++) {
              const o = order(tc, dir, tp);
              checked++;
              if (isValidOrder(ship, o) !== rulesSayValid(thrust, velocity, o)) {
                mismatches.push(`T${thrust} V${velocity} ${formatOrder(o)}`);
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(9 * 11 * 21 * 2 * 7);
    expect(mismatches).toEqual([]);
  });

  it('every order built from values inside orderLimits is valid, and every valid order is inside them', () => {
    const problems: string[] = [];
    for (let thrust = 0; thrust <= 8; thrust++) {
      for (let velocity = 0; velocity <= 10; velocity++) {
        const ship = shipWith(thrust, velocity);
        // Build forwards: pick turn points first, then a thrust change in range.
        for (let tp = 0; tp <= orderLimits(ship).maxTurnPoints; tp++) {
          for (const dir of directions) {
            const range = orderLimits(ship, order(0, dir, tp));
            for (let tc = range.minThrustChange; tc <= range.maxThrustChange; tc++) {
              const o = order(tc, dir, tp);
              if (!isValidOrder(ship, o)) {
                problems.push(`built but invalid: T${thrust} V${velocity} ${formatOrder(o)}`);
              }
              if (tp > orderLimits(ship, o).maxTurnPoints) {
                problems.push(`turn points outside own limits: T${thrust} V${velocity} ${formatOrder(o)}`);
              }
            }
          }
        }
        // Build the other way: pick thrust change first, then turn points in range.
        const base = orderLimits(ship);
        for (let tc = base.minThrustChange; tc <= base.maxThrustChange; tc++) {
          const max = orderLimits(ship, order(tc)).maxTurnPoints;
          for (let tp = 0; tp <= max; tp++) {
            const o = order(tc, 'S', tp);
            if (!isValidOrder(ship, o)) {
              problems.push(`built (tc first) but invalid: T${thrust} V${velocity} ${formatOrder(o)}`);
            }
          }
        }
        // Converse: every valid order lies inside its own limits.
        for (let tc = -10; tc <= 10; tc++) {
          for (let tp = 0; tp <= 6; tp++) {
            const o = order(tc, 'P', tp);
            if (!isValidOrder(ship, o)) {
              continue;
            }
            const limits = orderLimits(ship, o);
            const inside = tc >= limits.minThrustChange && tc <= limits.maxThrustChange && tp <= limits.maxTurnPoints;
            if (!inside) {
              problems.push(`valid but outside limits: T${thrust} V${velocity} ${formatOrder(o)}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
