import { createShips, type Scenario, type ScenarioPlayer } from '../data/loader';
import { outOfReach } from '../rules/battleArea';
import { IllegalOrderError, resolveMove, type MoveResult } from '../rules/movement';
import { NO_ORDER, formatOrder, validateOrder, type Order } from '../rules/orders';
import type { Ship, ShipDesign } from '../rules/ship';
import type { FireState } from './fire';
import { appendToLog, type LogEntry } from './log';

/**
 * Where the turn has got to:
 * - `plotting`: one player at a time, in the order the players are listed,
 *   so each side's orders can stay secret.
 * - `moving`: everyone has locked in and all ships move at once.
 * - `movementComplete`: the ships have finished moving; the fire phase is next.
 * - `firing`: players take turns to fire one ship at a time (see fire.ts).
 *   `activeShipId` is the ship that has started firing and must finish before
 *   play passes on.
 * - `fireComplete`: all firing is done and the turn is ready to end.
 * - `gameOver`: one side has no ships left in the battle, destroyed or gone,
 *   or has resigned (`resignedId`). `winnerId` is null for a draw: the last
 *   ships on both sides left the battle in the same move.
 */
export type Phase =
  | { kind: 'plotting'; playerId: string }
  | { kind: 'moving' }
  | { kind: 'movementComplete' }
  | { kind: 'firing'; playerId: string; activeShipId: string | null }
  | { kind: 'fireComplete' }
  | { kind: 'gameOver'; winnerId: string | null; resignedId?: string };

/**
 * For the default branch of a switch that should cover every case, e.g. every
 * phase kind: if a new case is added, the switch no longer compiles.
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

export interface Player {
  id: string;
  name: string;
  colour: string;
}

/** A ship that has left the battle, as it was when it left, and the turn it went. */
export interface WithdrawnShip {
  ship: Ship;
  turn: number;
}

export interface GameState {
  scenarioName: string;
  players: Player[];
  designs: ReadonlyMap<string, ShipDesign>;
  ships: Ship[];
  /** The turn being plotted or moved, starting at 1. */
  turn: number;
  phase: Phase;
  /**
   * Orders plotted so far this turn, by ship id. Ships without an entry hold
   * course and velocity. This holds every side's orders: show players only
   * what `viewFor` (visibility.ts) lets them see.
   */
  orders: Record<string, Order>;
  /** What every ship did on every turn played so far. */
  log: LogEntry[];
  /** This turn's weapons fire, from the start of the fire phase until the turn ends. */
  fire: FireState | null;
  /**
   * Ships that ended the last move out of reach: more than
   * `BATTLE_AREA_RANGE` from every enemy ship. Each leaves the battle if it
   * is still out of reach after the next move.
   */
  leaving: string[];
  /** Ships that have left the battle, in the order they went. They take no further part. */
  withdrawn: WithdrawnShip[];
}

export function createGame(scenario: Scenario, designs: ReadonlyMap<string, ShipDesign>): GameState {
  const ships = createShips(scenario, designs);
  return {
    scenarioName: scenario.name,
    players: scenario.players.map(({ id, name, colour }: ScenarioPlayer) => ({ id, name, colour })),
    designs,
    ships,
    turn: 1,
    phase: firstPlottingPhase(scenario.players),
    orders: {},
    log: [],
    fire: null,
    leaving: [],
    withdrawn: [],
  };
}

function firstPlottingPhase(players: readonly { id: string }[]): Phase {
  const first = players[0];
  if (first === undefined) {
    throw new Error('A game needs at least one player.');
  }
  return { kind: 'plotting', playerId: first.id };
}

/** The player whose orders are being plotted, or null outside the plotting phase. */
export function plottingPlayer(state: GameState): Player | null {
  const phase = state.phase;
  if (phase.kind !== 'plotting') {
    return null;
  }
  return findPlayer(state, phase.playerId) ?? null;
}

export function findShip(state: GameState, shipId: string): Ship | undefined {
  return state.ships.find((ship) => ship.id === shipId);
}

/** A ship's design. Throws if the game has no such design, which means the data is broken. */
export function designOf(state: Pick<GameState, 'designs'>, ship: Pick<Ship, 'id' | 'designId'>): ShipDesign {
  const design = state.designs.get(ship.designId);
  if (design === undefined) {
    throw new Error(`Ship ${ship.id} uses an unknown design "${ship.designId}".`);
  }
  return design;
}

export function findPlayer(state: { readonly players: readonly Player[] }, playerId: string): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

/** A player's name, or their id if there is no such player. */
export function playerName(state: { readonly players: readonly Player[] }, playerId: string): string {
  return findPlayer(state, playerId)?.name ?? playerId;
}

export function orderFor(state: GameState, shipId: string): Order {
  return state.orders[shipId] ?? NO_ORDER;
}

/**
 * Records an order for one of the plotting player's ships. Throws if it isn't
 * the plotting phase, if the ship belongs to another player, or
 * (IllegalOrderError) if the order breaks the rules.
 */
export function setOrder(state: GameState, shipId: string, order: Order): GameState {
  const phase = state.phase;
  if (phase.kind !== 'plotting') {
    throw new Error('Orders can only be changed during the order plotting phase.');
  }
  const ship = findShip(state, shipId);
  if (ship === undefined) {
    throw new Error(`There is no ship with id "${shipId}".`);
  }
  if (ship.playerId !== phase.playerId) {
    throw new Error(`${shipId} belongs to another player, who is not plotting orders now.`);
  }
  const errors = validateOrder(ship, order);
  if (errors.length > 0) {
    throw new IllegalOrderError(shipId, errors);
  }
  return { ...state, orders: { ...state.orders, [shipId]: { ...order } } };
}

export interface MovementResolution {
  /** The movement of every ship this turn, by ship id, including any that then leave the battle. */
  moves: Record<string, MoveResult>;
  /**
   * The state once every ship has moved: same turn, `movementComplete` phase,
   * or `gameOver` if ships leaving the battle have left a side with none.
   */
  next: GameState;
}

/**
 * Ends a player's plotting sub-phase. Their orders can no longer change.
 * Plotting passes to the next player in order, or, once everyone has locked
 * in, the movement phase begins.
 */
export function lockInOrders(state: GameState, playerId: string): GameState {
  const phase = state.phase;
  if (phase.kind !== 'plotting' || phase.playerId !== playerId) {
    throw new Error(`It is not ${playerId}'s turn to plot orders.`);
  }
  const index = state.players.findIndex((player) => player.id === playerId);
  const next = state.players[index + 1];
  return {
    ...state,
    phase: next === undefined ? { kind: 'moving' } : { kind: 'plotting', playerId: next.id },
  };
}

/**
 * Moves every ship according to its order and records the turn in the log.
 * All ships move simultaneously, so the result does not depend on ship order.
 * Then the battle area is checked (see `checkBattleArea`). The turn stays the
 * same; call `endTurn` to start the next one.
 */
export function resolveMovement(state: GameState): MovementResolution {
  if (state.phase.kind !== 'moving') {
    throw new Error('Ships move only once every player has locked in their orders.');
  }
  const moves: Record<string, MoveResult> = {};
  const entries: LogEntry[] = [];

  const ships = state.ships.map((ship): Ship => {
    const order = orderFor(state, ship.id);
    const move = resolveMove(ship, order);
    moves[ship.id] = move;
    entries.push({
      turn: state.turn,
      shipId: ship.id,
      shipName: ship.name,
      playerId: ship.playerId,
      order: formatOrder(order),
      velocity: move.velocity,
      course: move.end.course,
    });
    return {
      ...ship,
      position: { ...move.end.position },
      course: move.end.course,
      velocity: move.velocity,
    };
  });

  return {
    moves,
    next: checkBattleArea({
      ...state,
      ships,
      phase: { kind: 'movementComplete' },
      log: appendToLog(state.log, entries, Infinity),
    }),
  };
}

/**
 * Checks the battle area once the ships have moved. A ship out of reach of
 * every enemy (`outOfReach`) that was already out of reach after the last
 * move leaves the battle and may not return, as the rules have it for a ship
 * that leaves the table. One out of reach for the first time is warned
 * (`leaving`) and has the next move to close in. Every ship is judged from
 * where all the ships ended, before any leaves, so both sides can lose ships
 * in the same move. A side left with no ships is defeated; if neither side
 * has any, the game is a draw.
 */
function checkBattleArea(state: GameState): GameState {
  const far = new Set(state.ships.filter((ship) => outOfReach(ship, state.ships)).map((ship) => ship.id));
  const going = state.ships.filter((ship) => far.has(ship.id) && state.leaving.includes(ship.id));
  const goingIds = new Set(going.map((ship) => ship.id));
  const ships = state.ships.filter((ship) => !goingIds.has(ship.id));
  const next: GameState = {
    ...state,
    ships,
    leaving: ships.filter((ship) => far.has(ship.id)).map((ship) => ship.id),
    withdrawn: [...state.withdrawn, ...going.map((ship) => ({ ship, turn: state.turn }))],
  };
  if (going.length === 0) {
    return next;
  }
  const remaining = state.players.filter((player) => ships.some((ship) => ship.playerId === player.id));
  if (remaining.length === 0) {
    return { ...next, phase: { kind: 'gameOver', winnerId: null } };
  }
  if (remaining.length === 1) {
    return { ...next, phase: { kind: 'gameOver', winnerId: remaining[0]!.id } };
  }
  return next;
}

/** True if the ship ended the last move out of reach of every enemy ship, and leaves the battle unless it closes in. */
export function isLeaving(state: GameState, shipId: string): boolean {
  return state.leaving.includes(shipId);
}

/**
 * A player resigns, conceding the game: the other player wins at once. It can
 * happen at any point in a turn, but not once the game is over. The game is
 * for two players, so there is always exactly one other player to win.
 */
export function resign(state: GameState, playerId: string): GameState {
  if (state.phase.kind === 'gameOver') {
    throw new Error('The game is already over.');
  }
  if (!state.players.some((player) => player.id === playerId)) {
    throw new Error(`There is no player with id "${playerId}".`);
  }
  const others = state.players.filter((player) => player.id !== playerId);
  if (others.length !== 1) {
    throw new Error('Resigning needs exactly two players.');
  }
  return { ...state, phase: { kind: 'gameOver', winnerId: others[0]!.id, resignedId: playerId } };
}

/** Ends the turn once the fire phase is complete, and starts the next turn with the first player plotting. */
export function endTurn(state: GameState): GameState {
  if (state.phase.kind !== 'fireComplete') {
    throw new Error('The turn can only end once the weapons fire phase is complete.');
  }
  return {
    ...state,
    turn: state.turn + 1,
    phase: firstPlottingPhase(state.players),
    orders: {},
    fire: null,
  };
}
