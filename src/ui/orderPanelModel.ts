import { formatOrder } from '../rules/orders';
import { findShip, isLeaving, orderFor, type GameState } from '../game/state';
import { buildPlotRow, type PlotRow } from './plotModel';

/** A ship's orders for one turn and where they left it. */
export interface TurnResult {
  order: string;
  velocity: number;
  course: number;
}

interface ShipSummary {
  shipId: string;
  shipName: string;
  playerId: string;
  /** Where the ship is now. Open book: anyone can see it on the table. */
  velocity: number;
  course: number;
  /** What the ship did on the previous turn, from the public log, or null on turn 1. */
  lastTurn: TurnResult | null;
  /** The ship ended the last move out of reach of every enemy, and leaves the battle unless it closes in. */
  leaving: boolean;
}

/**
 * What the movement orders panel shows for the selected ship:
 * - `none`: no ship selected.
 * - `edit`: one of the plotting player's own ships, with order inputs.
 * - `secret`: another player's ship while orders are being plotted. Only
 *   whether they have locked in is shown, never the orders.
 * - `result`: everyone has locked in, so this turn's order and its result
 *   are shown, read only.
 */
export type OrderPanel =
  | { kind: 'none' }
  | (ShipSummary & { kind: 'edit'; plot: PlotRow })
  | (ShipSummary & { kind: 'secret'; lockedIn: boolean })
  | (ShipSummary & { kind: 'result'; thisTurn: TurnResult; moved: boolean });

function logResult(view: GameState, shipId: string, turn: number): TurnResult | null {
  const entry = view.log.find((item) => item.turn === turn && item.shipId === shipId);
  return entry === undefined ? null : { order: entry.order, velocity: entry.velocity, course: entry.course };
}

/**
 * Builds the movement orders panel for one ship, as `viewerId` may see it.
 *
 * @param view the game as the viewer sees it (see `viewFor`)
 * @param shipId the selected ship, or null
 * @param viewerId the player looking: the plotting player, or null during movement
 */
export function buildOrderPanel(view: GameState, shipId: string | null, viewerId: string | null): OrderPanel {
  const ship = shipId === null ? undefined : findShip(view, shipId);
  if (ship === undefined) {
    return { kind: 'none' };
  }
  const summary: ShipSummary = {
    shipId: ship.id,
    shipName: ship.name,
    playerId: ship.playerId,
    velocity: ship.velocity,
    course: ship.course,
    lastTurn: logResult(view, ship.id, view.turn - 1),
    leaving: isLeaving(view, ship.id),
  };
  const phase = view.phase;

  if (phase.kind === 'plotting') {
    if (ship.playerId === phase.playerId && ship.playerId === viewerId) {
      return { ...summary, kind: 'edit', plot: buildPlotRow(ship, orderFor(view, ship.id)) };
    }
    const order = view.players.map((player) => player.id);
    return { ...summary, kind: 'secret', lockedIn: order.indexOf(ship.playerId) < order.indexOf(phase.playerId) };
  }

  // Everyone has locked in, so this turn's orders are public.
  const logged = logResult(view, ship.id, view.turn);
  if (phase.kind === 'movementComplete' && logged !== null) {
    return { ...summary, kind: 'result', thisTurn: logged, moved: true };
  }
  const preview = buildPlotRow(ship, orderFor(view, ship.id));
  return {
    ...summary,
    kind: 'result',
    thisTurn: { order: formatOrder(preview.order), velocity: preview.newVelocity, course: preview.newCourse },
    moved: false,
  };
}
