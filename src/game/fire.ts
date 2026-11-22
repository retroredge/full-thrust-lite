import {
  applyHullDamage,
  fireRange,
  rollBeamVolley,
  rollDie,
  rollTorpedoes,
  wastedTorpedoes,
  weaponBearing,
  type Rng,
  type TorpedoRoll,
  type WeaponBearing,
  type WeaponRoll,
} from '../rules/fire';
import type { Ship } from '../rules/ship';
import {
  activeSystems,
  applyLosses,
  rollThreshold,
  systemLabel,
  thresholdFor,
  type ShipSystem,
  type Threshold,
} from '../rules/threshold';
import { designOf, findPlayer, findShip, playerName, type GameState, type Phase, type Player } from './state';
import { listOf, plural } from '../text';

/**
 * The weapons fire phase.
 *
 * Initiative is rolled first; the winner fires one ship, doing all of that
 * ship's firing (one target per fire control system, each weapon once), then
 * the other player fires one ship, and so on, "until all desired firing is
 * completed", as the rules lay out. A ship finishes once it has nothing left
 * it can fire at, or when its player says it has finished. Firing is
 * optional: on their go a player may pass instead of firing a ship. Passing
 * locks no ship out: if the other side then fires, it's the passing player's
 * go again. Firing ends when every side with a ship able to fire has passed
 * since a ship last fired (both players pass in a row), or when no ship can
 * fire. A side with nothing left to fire is skipped, so the other side fires
 * its remaining ships in a row. Damage applies at once, so a ship can be
 * destroyed before it fires.
 */

/** What one ship has done in this fire phase. */
export interface ShipFireRecord {
  weaponsFired: number[];
  /** Ships engaged, one per fire control used. */
  targets: string[];
  /** The ship has finished firing for this turn. */
  done: boolean;
}

/** One ship firing at one target. */
export interface Volley {
  turn: number;
  shooterId: string;
  targetId: string;
  targetName: string;
  /** Range in mu, as shown to the players. */
  range: number;
  /** The beams' dice, rolled together and applied first. */
  weapons: WeaponRoll[];
  /** The pulse torpedoes, rolled after the beams' damage is applied. */
  torpedoes: TorpedoRoll[];
  beamDamage: number;
  torpedoDamage: number;
  /** All the damage: beams and torpedoes. */
  damage: number;
  /** Target's hull damage before the volley, after the beams, and after the torpedoes too. */
  hullBefore: number;
  hullAfterBeams: number;
  hullAfter: number;
  destroyed: boolean;
  /** The threshold check the volley caused, or null if it completed no row of hull boxes (or destroyed the target). */
  threshold: ThresholdCheck | null;
}

/** A threshold check on the target after a volley: the threshold reached and the die rolled for each working system. */
export interface ThresholdCheck extends Threshold {
  rolls: { system: ShipSystem; label: string; roll: number; lost: boolean }[];
}

/** One round of initiative dice, by player id. Ties lead to another round. */
export type InitiativeRound = Record<string, number>;

export interface FireState {
  /** Initiative rolls, or null when nobody could fire and none were rolled. */
  initiative: { rounds: InitiativeRound[]; winnerId: string } | null;
  ships: Record<string, ShipFireRecord>;
  volleys: Volley[];
  /** Why play last changed hands, e.g. "Player One passes.", or null. */
  note: string | null;
  /** Players who have passed since a ship last fired. Once every side able to fire has passed, firing is over. */
  passes: string[];
}

/** A fire phase with nothing rolled, fired or passed yet. */
export function emptyFireState(): FireState {
  return { initiative: null, ships: {}, volleys: [], note: null, passes: [] };
}

const EMPTY_RECORD: ShipFireRecord = { weaponsFired: [], targets: [], done: false };

export function fireRecord(state: GameState, shipId: string): ShipFireRecord {
  return state.fire?.ships[shipId] ?? EMPTY_RECORD;
}

/** Working fire controls a ship has not yet used this turn. */
export function fireControlsLeft(state: GameState, ship: Ship): number {
  const working = designOf(state, ship).fireControls - ship.fireControlsLost.length;
  return Math.max(0, working - fireRecord(state, ship.id).targets.length);
}

/** Whether each of a ship's weapons can fire at a target, in weapon order. */
export function weaponBearings(state: GameState, ship: Ship, target: Ship): WeaponBearing[] {
  const fired = fireRecord(state, ship.id).weaponsFired;
  return designOf(state, ship).weapons.map((weapon, index) =>
    ship.weaponsLost.includes(index)
      ? { kind: 'knockedOut' as const }
      : weaponBearing(weapon, index, ship, target.position, fired),
  );
}

/** Why a ship can't fire at a target, or null if it can. */
export function targetProblem(state: GameState, ship: Ship, target: Ship): string | null {
  if (target.playerId === ship.playerId) {
    return `${target.id} is on your side.`;
  }
  const record = fireRecord(state, ship.id);
  if (record.targets.includes(target.id)) {
    return `${ship.id} has already fired at ${target.id} this turn.`;
  }
  if (ship.fireControlsLost.length >= designOf(state, ship).fireControls) {
    return `${ship.id} has no working fire control.`;
  }
  if (fireControlsLeft(state, ship) === 0) {
    return `${ship.id} has no fire control left to engage another target.`;
  }
  if (!weaponBearings(state, ship, target).some((bearing) => bearing.kind === 'ok')) {
    return `None of ${ship.id}'s weapons can reach ${target.id}.`;
  }
  return null;
}

/** Enemy ships this ship could fire at now. */
export function validTargets(state: GameState, ship: Ship): Ship[] {
  return state.ships.filter((target) => target.playerId !== ship.playerId && targetProblem(state, ship, target) === null);
}

/** True if the ship has not finished firing and still has something it can hit. */
export function canFire(state: GameState, shipId: string): boolean {
  const ship = findShip(state, shipId);
  if (ship === undefined || fireRecord(state, shipId).done) {
    return false;
  }
  return validTargets(state, ship).length > 0;
}

/** The player's ships that could fire now. */
export function shipsAbleToFire(state: GameState, playerId: string): Ship[] {
  return state.ships.filter((ship) => ship.playerId === playerId && canFire(state, ship.id));
}

/** The only player with ships left, or null while more than one side survives. */
export function winner(state: GameState): Player | null {
  const alive = state.players.filter((player) => state.ships.some((ship) => ship.playerId === player.id));
  return alive.length === 1 ? alive[0]! : null;
}

function rollInitiative(players: readonly Player[], rng: Rng): { rounds: InitiativeRound[]; winnerId: string } {
  const rounds: InitiativeRound[] = [];
  let contenders = players.map((player) => player.id);
  for (;;) {
    const round: InitiativeRound = {};
    for (const id of contenders) {
      round[id] = rollDie(rng);
    }
    rounds.push(round);
    const best = Math.max(...contenders.map((id) => round[id]!));
    contenders = contenders.filter((id) => round[id] === best);
    if (contenders.length === 1) {
      return { rounds, winnerId: contenders[0]! };
    }
  }
}

/** Players in firing order, starting after `playerId`. */
function playersAfter(state: GameState, playerId: string): Player[] {
  const index = state.players.findIndex((player) => player.id === playerId);
  return [...state.players.slice(index + 1), ...state.players.slice(0, index + 1)];
}

/**
 * Gives the next go to the first player after `fromId` who has a ship able to
 * fire and hasn't passed since a ship last fired, coming back round to
 * `fromId` last. Firing is over once there is no such player: every side has
 * either passed or has nothing left to fire.
 */
function handOver(state: GameState, fromId: string, notes: string[]): GameState {
  const passes = state.fire?.passes ?? [];
  const outOfShips: string[] = [];
  for (const player of playersAfter(state, fromId)) {
    const able = shipsAbleToFire(state, player.id).length > 0;
    if (able && !passes.includes(player.id)) {
      const ranOut = outOfShips.map((name) => `${name} has nothing left to fire.`);
      // Say so as soon as the player who just fired runs out, not only once they are skipped.
      const from = findPlayer(state, fromId);
      if (
        from !== undefined &&
        from.id !== player.id &&
        !passes.includes(from.id) &&
        shipsAbleToFire(state, from.id).length === 0
      ) {
        ranOut.push(`${from.name} has nothing left to fire.`);
      }
      return withPhase(state, { kind: 'firing', playerId: player.id, activeShipId: null }, [...notes, ...ranOut]);
    }
    if (!able) {
      outOfShips.push(player.name);
    }
  }
  let ending: string;
  if (outOfShips.length === state.players.length) {
    ending = 'Neither side has anything left to fire.';
  } else if (outOfShips.length === 0) {
    ending = 'Both sides have passed, so weapons fire is over.';
  } else {
    ending = `${listOf(outOfShips)} ${plural(outOfShips.length, 'has', 'have')} nothing left to fire, so weapons fire is over.`;
  }
  return withPhase(state, { kind: 'fireComplete' }, [...notes, ending]);
}

function withPhase(state: GameState, phase: Phase, notes: string[]): GameState {
  const fire = state.fire ?? emptyFireState();
  return { ...state, phase, fire: { ...fire, note: notes.length > 0 ? notes.join(' ') : null } };
}

/**
 * Starts the fire phase once the ships have moved. If no ship can hit
 * anything, the phase is complete at once. If only one side can, it fires
 * with no initiative roll. Otherwise initiative is rolled and the winner
 * fires first.
 */
export function startFirePhase(state: GameState, rng: Rng): GameState {
  if (state.phase.kind !== 'movementComplete') {
    throw new Error('The fire phase starts once the ships have finished moving.');
  }
  const fresh: GameState = { ...state, fire: emptyFireState() };
  const able = state.players.filter((player) => shipsAbleToFire(fresh, player.id).length > 0);
  if (able.length === 0) {
    return withPhase(fresh, { kind: 'fireComplete' }, ['No ships are in range.']);
  }
  if (able.length === 1) {
    // Only one side can fire, so there's nothing to roll for: it fires.
    const idle = state.players.filter((player) => player.id !== able[0]!.id).map((player) => player.name);
    const note = `${listOf(idle)} ${plural(idle.length, 'has', 'have')} nothing to fire, so no initiative is rolled.`;
    return withPhase(fresh, { kind: 'firing', playerId: able[0]!.id, activeShipId: null }, [note]);
  }
  const initiative = rollInitiative(state.players, rng);
  const rolled: GameState = { ...fresh, fire: { ...fresh.fire!, initiative } };
  // The winner fires first: hand over from the player before them.
  const index = state.players.findIndex((player) => player.id === initiative.winnerId);
  const previous = state.players[(index - 1 + state.players.length) % state.players.length]!;
  return handOver(rolled, previous.id, []);
}

function requireFiring(state: GameState, playerId: string): Extract<Phase, { kind: 'firing' }> {
  const phase = state.phase;
  if (phase.kind !== 'firing' || phase.playerId !== playerId) {
    throw new Error(`It is not ${playerName(state, playerId)}'s turn to fire.`);
  }
  return phase;
}

export interface VolleyResult {
  volley: Volley;
  next: GameState;
}

/**
 * Fires some of a ship's weapons at one target and applies the damage at
 * once. A destroyed target is removed from play. The ship becomes the active
 * ship, which must finish before play passes on; once it has nothing left it
 * could fire at, it finishes by itself. If the volley leaves only one side
 * with ships, the game is over.
 */
export function fireVolley(
  state: GameState,
  shooterId: string,
  targetId: string,
  weaponIndexes: readonly number[],
  rng: Rng,
): VolleyResult {
  const shooter = findShip(state, shooterId);
  if (shooter === undefined) {
    throw new Error(`There is no ship with id "${shooterId}".`);
  }
  const phase = requireFiring(state, shooter.playerId);
  if (phase.activeShipId !== null && phase.activeShipId !== shooterId) {
    throw new Error(`${phase.activeShipId} must finish firing first.`);
  }
  const record = fireRecord(state, shooterId);
  if (record.done) {
    throw new Error(`${shooterId} has already finished firing this turn.`);
  }
  const target = findShip(state, targetId);
  if (target === undefined) {
    throw new Error(`There is no ship with id "${targetId}".`);
  }
  const problem = targetProblem(state, shooter, target);
  if (problem !== null) {
    throw new Error(problem);
  }
  if (weaponIndexes.length === 0) {
    throw new Error('Choose at least one weapon to fire.');
  }
  if (new Set(weaponIndexes).size !== weaponIndexes.length) {
    throw new Error('Each weapon can only fire once.');
  }
  const bearings = weaponBearings(state, shooter, target);
  const beams: { weaponIndex: number; dice: number }[] = [];
  const torpedoes: { weaponIndex: number; toHit: number }[] = [];
  for (const weaponIndex of weaponIndexes) {
    const bearing = bearings[weaponIndex];
    if (bearing?.kind !== 'ok') {
      throw new Error(`Weapon ${weaponIndex + 1} on ${shooterId} cannot fire at ${targetId}.`);
    }
    if (bearing.toHit === undefined) {
      beams.push({ weaponIndex, dice: bearing.dice });
    } else {
      torpedoes.push({ weaponIndex, toHit: bearing.toHit });
    }
  }

  // The beams are rolled and their damage applied first, then the torpedoes.
  const targetDesign = designOf(state, target);
  const weapons = rollBeamVolley(beams, rng);
  const beamDamage = weapons.reduce((total, weapon) => total + weapon.damage, 0);
  const afterBeams = applyHullDamage(target, beamDamage, targetDesign);
  // Torpedoes launched at a ship the beams have already destroyed are wasted.
  const torpedoRolls = afterBeams.destroyed ? wastedTorpedoes(torpedoes) : rollTorpedoes(torpedoes, rng);
  const torpedoDamage = torpedoRolls.reduce((total, torpedo) => total + torpedo.damage, 0);
  const hit = applyHullDamage({ hullDamage: afterBeams.hullDamage }, torpedoDamage, targetDesign);
  const damage = beamDamage + torpedoDamage;
  let damaged: Ship = { ...target, hullDamage: hit.hullDamage };

  // Completing a row of hull boxes calls for a threshold check once the volley is over.
  const reached = hit.destroyed ? null : thresholdFor(targetDesign.hullRows, target.hullDamage, hit.hullDamage);
  let threshold: ThresholdCheck | null = null;
  if (reached !== null) {
    const rolls = rollThreshold(activeSystems(damaged, targetDesign), reached.failOn, rng);
    damaged = applyLosses(damaged, rolls);
    threshold = {
      ...reached,
      rolls: rolls.map((roll) => ({ ...roll, label: systemLabel(targetDesign, roll.system) })),
    };
  }

  const volley: Volley = {
    turn: state.turn,
    shooterId,
    targetId,
    targetName: target.name,
    range: fireRange(shooter.position, target.position),
    weapons,
    torpedoes: torpedoRolls,
    beamDamage,
    torpedoDamage,
    damage,
    hullBefore: target.hullDamage,
    hullAfterBeams: afterBeams.hullDamage,
    hullAfter: hit.hullDamage,
    destroyed: hit.destroyed,
    threshold,
  };

  const ships = hit.destroyed
    ? state.ships.filter((ship) => ship.id !== targetId)
    : state.ships.map((ship) => (ship.id === targetId ? damaged : ship));
  const fire = state.fire ?? emptyFireState();
  let next: GameState = {
    ...state,
    ships,
    phase: { ...phase, activeShipId: shooterId },
    fire: {
      ...fire,
      note: null,
      // A ship has fired, so any earlier pass no longer ends the phase.
      passes: [],
      volleys: [...fire.volleys, volley],
      ships: {
        ...fire.ships,
        [shooterId]: {
          weaponsFired: [...record.weaponsFired, ...weaponIndexes],
          targets: [...record.targets, targetId],
          done: false,
        },
      },
    },
  };

  const victor = winner(next);
  if (victor !== null) {
    next = { ...next, phase: { kind: 'gameOver', winnerId: victor.id } };
  } else if (!canFire(next, shooterId)) {
    next = markDone(next, [shooterId], shooter.playerId, []);
  }
  return { volley, next };
}

/** Marks ships done for this fire phase and passes play on from `playerId`. */
function markDone(state: GameState, shipIds: readonly string[], playerId: string, notes: string[]): GameState {
  const fire = state.fire ?? emptyFireState();
  const ships = { ...fire.ships };
  for (const shipId of shipIds) {
    ships[shipId] = { ...fireRecord(state, shipId), done: true };
  }
  return handOver({ ...state, fire: { ...fire, ships } }, playerId, notes);
}

/**
 * The firing player passes their go without firing a ship. No ship is locked
 * out: if the other side then fires, it's this player's go again. If the
 * other side has passed too, or has nothing left to fire, firing is over.
 */
export function pass(state: GameState, playerId: string): GameState {
  const phase = requireFiring(state, playerId);
  if (phase.activeShipId !== null) {
    throw new Error(`${phase.activeShipId} is part-way through firing: finish it instead of passing.`);
  }
  const fire = state.fire ?? emptyFireState();
  const passed: GameState = { ...state, fire: { ...fire, passes: [...fire.passes, playerId] } };
  return handOver(passed, playerId, [`${playerName(state, playerId)} passes.`]);
}

/**
 * The firing player's ship that is part-way through firing finishes, though it
 * could still fire at something: it fires no more this turn, and play passes on.
 */
export function finishShip(state: GameState, playerId: string): GameState {
  const phase = requireFiring(state, playerId);
  if (phase.activeShipId === null) {
    throw new Error('No ship is part-way through firing.');
  }
  return markDone(state, [phase.activeShipId], playerId, [`${phase.activeShipId} has finished firing.`]);
}
