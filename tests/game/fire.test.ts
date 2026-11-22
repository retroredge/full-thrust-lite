import { describe, expect, it } from 'vitest';
import {
  canFire,
  fireControlsLeft,
  fireRecord,
  fireVolley,
  shipsAbleToFire,
  finishShip,
  pass,
  startFirePhase,
  targetProblem,
  validTargets,
  weaponBearings,
  winner,
} from '../../src/game/fire';
import { endTurn, findShip, type GameState } from '../../src/game/state';
import { availableThrust } from '../../src/rules/ship';
import { dice, movedState, ship } from '../support/fireFixtures';

/**
 * Red: cruiser R1 at the origin facing north, escort R2 beside it to starboard.
 * Blue: escort B1 10 mu dead ahead of R1 facing south, escort B2 off R1's
 * starboard bow (FS arc, 11.7 mu) also facing south. R2 and B2 are 10 mu
 * apart and in each other's arcs; R2 and B1 are 12.6 mu apart, out of range.
 */
const engaged = (): GameState =>
  movedState([
    ship('R1', 'red', 'cruiser', 0, 0, 12),
    ship('R2', 'red', 'escort', 4, 2, 12),
    ship('B1', 'blue', 'escort', 0, -10, 6),
    ship('B2', 'blue', 'escort', 10, -6, 6),
  ]);

/** Red wins initiative (4 against 2) and is about to fire. */
const redToFire = (): GameState => startFirePhase(engaged(), dice(4, 2));

const get = (state: GameState, id: string) => {
  const found = findShip(state, id);
  if (found === undefined) {
    throw new Error(`${id} is not in play`);
  }
  return found;
};

describe('startFirePhase', () => {
  it('skips initiative and ends the phase when no ship can reach an enemy', () => {
    const apart = movedState([ship('R1', 'red', 'cruiser', 0, 0), ship('B1', 'blue', 'escort', 100, 0)]);
    const next = startFirePhase(apart, dice());
    expect(next.phase).toEqual({ kind: 'fireComplete' });
    expect(next.fire).toEqual({ initiative: null, ships: {}, volleys: [], note: 'No ships are in range.', passes: [] });
  });

  it('rolls initiative and gives the first go to the highest roller', () => {
    const next = redToFire();
    expect(next.fire?.initiative).toEqual({ rounds: [{ red: 4, blue: 2 }], winnerId: 'red' });
    expect(next.phase).toEqual({ kind: 'firing', playerId: 'red', activeShipId: null });
  });

  it('rolls again after a tie', () => {
    const next = startFirePhase(engaged(), dice(3, 3, 1, 5));
    expect(next.fire?.initiative).toEqual({
      rounds: [
        { red: 3, blue: 3 },
        { red: 1, blue: 5 },
      ],
      winnerId: 'blue',
    });
    expect(next.phase).toMatchObject({ kind: 'firing', playerId: 'blue' });
  });

  it('rolls no initiative when only one side can fire: that side fires', () => {
    // Blue's escorts face away from red, so their class 1s can't bear (aft arc).
    const state = movedState([ship('R1', 'red', 'cruiser', 0, 0, 12), ship('B1', 'blue', 'escort', 0, -10, 12)]);
    const next = startFirePhase(state, dice());
    expect(next.phase).toEqual({ kind: 'firing', playerId: 'red', activeShipId: null });
    expect(next.fire?.initiative).toBeNull();
    expect(next.fire?.note).toBe('Blue has nothing to fire, so no initiative is rolled.');
  });

  it('can only start once the ships have moved', () => {
    expect(() => startFirePhase(redToFire(), dice(1, 2))).toThrow(/finished moving/);
  });
});

describe('targets and weapons', () => {
  it('works out which weapons bear on a target and how many dice they roll', () => {
    const state = redToFire();
    expect(weaponBearings(state, get(state, 'R1'), get(state, 'B1'))).toEqual([
      { kind: 'ok', dice: 3 },
      { kind: 'ok', dice: 2 },
      { kind: 'ok', dice: 1 },
      // The pulse torpedo, 10 mu dead ahead: 3+ to hit.
      { kind: 'ok', dice: 1, toHit: 3 },
    ]);
    // B1 is 12.6 mu from R2, beyond its class 1's reach.
    expect(weaponBearings(state, get(state, 'R2'), get(state, 'B1'))).toEqual([{ kind: 'outOfRange' }]);
  });

  it('lists the enemy ships each ship can fire at', () => {
    const state = redToFire();
    expect(validTargets(state, get(state, 'R1')).map((target) => target.id)).toEqual(['B1', 'B2']);
    expect(validTargets(state, get(state, 'R2')).map((target) => target.id)).toEqual(['B2']);
    expect(shipsAbleToFire(state, 'red').map((item) => item.id)).toEqual(['R1', 'R2']);
    expect(shipsAbleToFire(state, 'blue').map((item) => item.id)).toEqual(['B1', 'B2']);
  });
});

describe('fireVolley', () => {
  it('rolls the dice, damages the target and makes the shooter the active ship', () => {
    const { volley, next } = fireVolley(redToFire(), 'R1', 'B1', [2], dice(5));
    expect(volley).toEqual({
      turn: 1,
      shooterId: 'R1',
      targetId: 'B1',
      targetName: 'B1 name',
      range: 10,
      weapons: [{ weaponIndex: 2, rolls: [5], damage: 1 }],
      torpedoes: [],
      beamDamage: 1,
      torpedoDamage: 0,
      damage: 1,
      hullBefore: 0,
      hullAfterBeams: 1,
      hullAfter: 1,
      destroyed: false,
      threshold: null,
    });
    expect(get(next, 'B1').hullDamage).toBe(1);
    expect(next.phase).toEqual({ kind: 'firing', playerId: 'red', activeShipId: 'R1' });
    expect(fireRecord(next, 'R1')).toEqual({ weaponsFired: [2], targets: ['B1'], done: false });
    expect(fireControlsLeft(next, get(next, 'R1'))).toBe(1);
    expect(next.fire?.volleys).toEqual([volley]);
  });

  it('enforces whose go it is, the active ship, fire control and weapon rules', () => {
    const state = redToFire();
    expect(() => fireVolley(state, 'B1', 'R1', [0], dice(6))).toThrow(/not Blue's turn/);
    expect(() => fireVolley(state, 'R1', 'R2', [0], dice(6))).toThrow(/your side/);
    expect(() => fireVolley(state, 'R1', 'B1', [], dice())).toThrow(/at least one/);
    expect(() => fireVolley(state, 'R1', 'B1', [2, 2], dice(6, 6))).toThrow(/once/);
    // The torpedo only fires forward; B2 is off the starboard bow.
    expect(() => fireVolley(state, 'R1', 'B2', [3], dice(6))).toThrow(/cannot fire/);
    expect(() => fireVolley(state, 'R2', 'B1', [0], dice(6))).toThrow(/can reach/);

    const { next } = fireVolley(state, 'R1', 'B1', [2], dice(1));
    expect(() => fireVolley(next, 'R2', 'B2', [0], dice(6))).toThrow(/R1 must finish/);
    expect(() => fireVolley(next, 'R1', 'B1', [0], dice(6, 6, 6))).toThrow(/already fired at B1/);
    expect(() => fireVolley(next, 'R1', 'B2', [2], dice(6))).toThrow(/cannot fire/);
  });

  it('finishes the ship by itself once its fire controls are used up, and hands over', () => {
    let state = fireVolley(redToFire(), 'R1', 'B1', [2], dice(1)).next;
    state = fireVolley(state, 'R1', 'B2', [0], dice(1, 1, 1)).next;
    expect(fireRecord(state, 'R1')).toEqual({ weaponsFired: [2, 0], targets: ['B1', 'B2'], done: true });
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'blue', activeShipId: null });
    expect(canFire(state, 'R1')).toBe(false);
  });

  it('removes a destroyed ship from play at once', () => {
    const state = redToFire();
    const { volley, next } = fireVolley(state, 'R1', 'B1', [0, 1], dice(6, 6, 1, 1, 1));
    expect(volley).toMatchObject({ damage: 4, hullBefore: 0, hullAfter: 4, destroyed: true });
    expect(findShip(next, 'B1')).toBeUndefined();
    expect(next.ships.map((item) => item.id)).toEqual(['R1', 'R2', 'B2']);
  });

  it('ends the game when the last enemy ship is destroyed', () => {
    const state = startFirePhase(
      movedState([ship('R1', 'red', 'cruiser', 0, 0), ship('B1', 'blue', 'escort', 0, -10, 6, 3)]),
      dice(6, 1),
    );
    const { next } = fireVolley(state, 'R1', 'B1', [2], dice(4));
    expect(next.phase).toEqual({ kind: 'gameOver', winnerId: 'red' });
    expect(winner(next)?.id).toBe('red');
    expect(winner(state)).toBeNull();
  });

  it('does not change the state it fires from', () => {
    const state = redToFire();
    const snapshot = JSON.stringify({ ...state, designs: undefined });
    fireVolley(state, 'R1', 'B1', [0, 1, 2], dice(6, 6, 6, 6, 6, 6));
    expect(JSON.stringify({ ...state, designs: undefined })).toBe(snapshot);
  });
});

describe('taking turns', () => {
  it('alternates ship by ship', () => {
    let state = fireVolley(redToFire(), 'R1', 'B1', [2], dice(1)).next;
    // R1's second fire control is used on B2, so it finishes and blue fires.
    state = fireVolley(state, 'R1', 'B2', [0], dice(1, 1, 1)).next;
    expect(fireRecord(state, 'R1').done).toBe(true);
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'blue', activeShipId: null });
    state = fireVolley(state, 'B2', 'R1', [0], dice(1)).next;
    // B2's only fire control is used, so it finishes and red fires again.
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'red', activeShipId: null });
    expect(shipsAbleToFire(state, 'red').map((item) => item.id)).toEqual(['R2']);
  });

  it('lets a player pass their go without locking out any of their ships', () => {
    const state = pass(redToFire(), 'red');
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'blue', activeShipId: null });
    expect(state.fire?.note).toBe('Red passes.');
    expect(state.fire?.passes).toEqual(['red']);
    expect(shipsAbleToFire(state, 'red').map((item) => item.id)).toEqual(['R1', 'R2']);
  });

  it('gives the go back to a player who passed once the other side fires', () => {
    let state = pass(redToFire(), 'red');
    // B1's only fire control is used, so it finishes and play passes back to red.
    state = fireVolley(state, 'B1', 'R1', [0], dice(1)).next;
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'red', activeShipId: null });
    expect(state.fire?.passes).toEqual([]);
  });

  it('ends the phase when both sides pass one after the other', () => {
    const state = pass(pass(redToFire(), 'red'), 'blue');
    expect(state.phase).toEqual({ kind: 'fireComplete' });
    expect(state.fire?.note).toBe('Blue passes. Both sides have passed, so weapons fire is over.');
    expect(endTurn(state).phase).toEqual({ kind: 'plotting', playerId: 'red' });
  });

  it('ends the phase at once when a player passes and the other side has nothing left to fire', () => {
    // Blue's escort faces away from red, so only red can fire.
    const onlyRed = startFirePhase(
      movedState([ship('R1', 'red', 'cruiser', 0, 0, 12), ship('B1', 'blue', 'escort', 0, -10, 12)]),
      dice(6, 1),
    );
    const state = pass(onlyRed, 'red');
    expect(state.phase).toEqual({ kind: 'fireComplete' });
    expect(state.fire?.note).toBe('Red passes. Blue has nothing left to fire, so weapons fire is over.');
  });

  it('only lets the firing player pass, on their go', () => {
    expect(() => pass(redToFire(), 'blue')).toThrow(/not Blue's turn/);
  });

  it('finishes a ship part-way through firing instead of passing, and play passes on', () => {
    const fired = fireVolley(redToFire(), 'R1', 'B1', [2], dice(1)).next;
    expect(() => pass(fired, 'red')).toThrow(/part-way through firing/);
    const state = finishShip(fired, 'red');
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'blue', activeShipId: null });
    expect(state.fire?.note).toBe('R1 has finished firing.');
    expect(fireRecord(state, 'R1')).toEqual({ weaponsFired: [2], targets: ['B1'], done: true });
    expect(shipsAbleToFire(state, 'red').map((item) => item.id)).toEqual(['R2']);
    expect(() => finishShip(redToFire(), 'red')).toThrow(/No ship is part-way/);
  });

  it('passes automatically for a side with nothing left to fire, and ends when neither has', () => {
    let state = fireVolley(redToFire(), 'R1', 'B1', [2], dice(1)).next;
    // R1's second fire control is used on B2, so it finishes and blue fires.
    state = fireVolley(state, 'R1', 'B2', [0], dice(1, 1, 1)).next;
    state = fireVolley(state, 'B1', 'R1', [0], dice(1)).next;
    state = fireVolley(state, 'R2', 'B2', [0], dice(1)).next;
    // R2 is done, so red has nothing left and is told so at once; blue's B2 can still fire.
    expect(state.phase).toEqual({ kind: 'firing', playerId: 'blue', activeShipId: null });
    expect(state.fire?.note).toBe('Red has nothing left to fire.');
    state = fireVolley(state, 'B2', 'R1', [0], dice(1)).next;
    // Then blue has nothing left either: the phase ends by itself.
    expect(state.phase).toEqual({ kind: 'fireComplete' });
    expect(state.fire?.note).toBe('Neither side has anything left to fire.');
  });
});

describe('threshold checks', () => {
  it("checks the target's systems after a volley that completes a row of hull boxes", () => {
    // A 6 does 2 damage, completing B1's first row (2 boxes). Then one die per system: beam, fire control, drive.
    const { volley, next } = fireVolley(redToFire(), 'R1', 'B1', [2], dice(6, 1, 4, 1));
    expect(volley.threshold).toEqual({
      row: 1,
      rows: 1,
      failOn: 1,
      rolls: [
        { system: { kind: 'weapon', index: 0 }, label: 'Class 1 beam', roll: 1, lost: true },
        { system: { kind: 'fireControl', index: 0 }, label: 'Fire control', roll: 4, lost: false },
        { system: { kind: 'drive', index: 0 }, label: 'Drive (thrust 4)', roll: 1, lost: true },
      ],
    });
    const b1 = get(next, 'B1');
    expect(b1.hullDamage).toBe(2);
    expect(b1.weaponsLost).toEqual([0]);
    expect(b1.fireControlsLost).toEqual([]);
    expect(availableThrust(b1)).toBe(0);
  });

  it('does not check a ship that the volley destroys', () => {
    // No dice are scripted for a threshold check, so one would throw.
    const { volley } = fireVolley(redToFire(), 'R1', 'B1', [0, 1], dice(6, 6, 1, 1, 1));
    expect(volley.destroyed).toBe(true);
    expect(volley.threshold).toBeNull();
  });

  it('never fires a knocked-out weapon again', () => {
    const state = startFirePhase(
      movedState([{ ...ship('R1', 'red', 'cruiser', 0, 0, 12), weaponsLost: [2] }, ship('B1', 'blue', 'escort', 0, -10, 6)]),
      dice(6, 1),
    );
    expect(weaponBearings(state, get(state, 'R1'), get(state, 'B1'))[2]).toEqual({ kind: 'knockedOut' });
    expect(() => fireVolley(state, 'R1', 'B1', [2], dice(6))).toThrow(/cannot fire/);
  });

  it('engages fewer targets with fire controls lost, and none with all of them gone', () => {
    const oneLost = movedState([
      { ...ship('R1', 'red', 'cruiser', 0, 0, 12), fireControlsLost: [0] },
      ship('B1', 'blue', 'escort', 0, -10, 6),
    ]);
    expect(fireControlsLeft(oneLost, get(oneLost, 'R1'))).toBe(1);
    expect(canFire(oneLost, 'R1')).toBe(true);

    const allLost = movedState([
      { ...ship('R1', 'red', 'cruiser', 0, 0, 12), fireControlsLost: [0, 1] },
      ship('B1', 'blue', 'escort', 0, -10, 6),
    ]);
    expect(fireControlsLeft(allLost, get(allLost, 'R1'))).toBe(0);
    expect(canFire(allLost, 'R1')).toBe(false);
    expect(targetProblem(allLost, get(allLost, 'R1'), get(allLost, 'B1'))).toBe('R1 has no working fire control.');
  });
});

describe('pulse torpedoes', () => {
  // R1's torpedo (weapon 3) fires forward; B1 is 10 mu dead ahead, so it needs 3+ to hit.

  it('rolls the beams first, then the torpedoes, sharing one fire control', () => {
    // Beam: 1 (miss). Torpedo: 4 to hit (a hit), then 1 damage.
    const { volley, next } = fireVolley(redToFire(), 'R1', 'B1', [2, 3], dice(1, 4, 1));
    expect(volley).toMatchObject({
      weapons: [{ weaponIndex: 2, rolls: [1], damage: 0 }],
      torpedoes: [{ weaponIndex: 3, toHit: 3, hitRoll: 4, hit: true, damageRoll: 1, damage: 1 }],
      beamDamage: 0,
      torpedoDamage: 1,
      damage: 1,
      hullBefore: 0,
      hullAfterBeams: 0,
      hullAfter: 1,
      threshold: null,
    });
    expect(fireRecord(next, 'R1')).toEqual({ weaponsFired: [2, 3], targets: ['B1'], done: false });
    expect(fireControlsLeft(next, get(next, 'R1'))).toBe(1);
    expect(get(next, 'B1').hullDamage).toBe(1);
  });

  it('rolls no damage die for a torpedo that misses', () => {
    // Only one die is scripted: a 2, short of the 3+ needed.
    const { volley } = fireVolley(redToFire(), 'R1', 'B1', [3], dice(2));
    expect(volley.torpedoes).toEqual([{ weaponIndex: 3, toHit: 3, hitRoll: 2, hit: false, damageRoll: null, damage: 0 }]);
    expect(volley.damage).toBe(0);
  });

  it('wastes torpedoes launched at a ship the beams destroy', () => {
    // The beams' two 6s do 4 damage, destroying B1; no dice are left for the torpedo.
    const { volley, next } = fireVolley(redToFire(), 'R1', 'B1', [0, 1, 3], dice(6, 6, 1, 1, 1));
    expect(volley.destroyed).toBe(true);
    expect(volley.torpedoes).toEqual([{ weaponIndex: 3, toHit: 3, hitRoll: null, hit: false, damageRoll: null, damage: 0 }]);
    expect(fireRecord(next, 'R1').weaponsFired).toEqual([0, 1, 3]);
  });

  it('makes one threshold check on the beam and torpedo damage together, after the torpedo dice', () => {
    // Beam: 5 (1 damage). Torpedo: 4 to hit, 1 damage. Two boxes complete B1's first row; then beam, fire control and drive roll 6, 6, 1.
    const { volley, next } = fireVolley(redToFire(), 'R1', 'B1', [2, 3], dice(5, 4, 1, 6, 6, 1));
    expect(volley.hullAfterBeams).toBe(1);
    expect(volley.hullAfter).toBe(2);
    expect(volley.threshold?.rolls.map((roll) => [roll.label, roll.roll, roll.lost])).toEqual([
      ['Class 1 beam', 6, false],
      ['Fire control', 6, false],
      ['Drive (thrust 4)', 1, true],
    ]);
    expect(get(next, 'B1').drives[0]!.functional).toBe(false);
  });
});
