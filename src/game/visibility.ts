import type { Order } from '../rules/orders';
import type { GameState } from './state';

/**
 * What one player is allowed to know about the game.
 *
 * Ship positions, courses, velocities and systems are open book. Orders for
 * the current turn are secret until the ships move: while plotting, a player
 * sees only their own fleet's orders. Once movement begins the orders are
 * being carried out in public, so everyone sees them, and the log of past
 * turns is always public.
 *
 * The screen is drawn from this view, so another side's orders are never in
 * the data the interface works with. A computer player will be given the same
 * view, so it cannot cheat either.
 *
 * @param viewerId the player looking, or null for an onlooker during movement
 */
export function viewFor(state: GameState, viewerId: string | null): GameState {
  if (state.phase.kind !== 'plotting') {
    return state;
  }
  const owners = new Map(state.ships.map((ship) => [ship.id, ship.playerId]));
  const orders: Record<string, Order> = {};
  for (const [shipId, order] of Object.entries(state.orders)) {
    if (viewerId !== null && owners.get(shipId) === viewerId) {
      orders[shipId] = order;
    }
  }
  return { ...state, orders };
}
