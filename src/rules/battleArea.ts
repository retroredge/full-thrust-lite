import type { Ship } from './ship';

/**
 * How far a ship may be from every enemy ship and still be in the battle, in
 * mu.
 *
 * The rules take a ship that leaves the table out of the game for good. The
 * map here has no edges, so the battle area moves with the fight instead: a
 * ship more than this far from every enemy ship is outside it. 144 mu is four
 * times the reach of the longest beam (a class 3, at 36 mu), and well clear of
 * how far apart the fleets start, so no ship leaves by accident in the
 * opening turns.
 */
export const BATTLE_AREA_RANGE = 144;

/**
 * True if `ship` is more than `BATTLE_AREA_RANGE` from every enemy ship in
 * `ships`, measured centre to centre. A ship with no enemies left is not out
 * of reach: the game is over by then.
 */
export function outOfReach(
  ship: Pick<Ship, 'playerId' | 'position'>,
  ships: readonly Pick<Ship, 'playerId' | 'position'>[],
): boolean {
  const enemies = ships.filter((other) => other.playerId !== ship.playerId);
  return (
    enemies.length > 0 &&
    enemies.every(
      (enemy) => Math.hypot(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y) > BATTLE_AREA_RANGE,
    )
  );
}
