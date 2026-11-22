import type { Ship } from '../rules/ship';

/**
 * The ship to select when stepping forward (1) or back (-1) through a fleet,
 * wrapping at either end. Only `playerId`'s ships are visited, or every ship
 * when it is null. With nothing selected, or a ship from outside the fleet,
 * stepping forward picks the first ship and stepping back the last.
 */
export function cycleShip(ships: readonly Ship[], currentId: string | null, step: 1 | -1, playerId: string | null): Ship | null {
  const fleet = playerId === null ? ships : ships.filter((ship) => ship.playerId === playerId);
  if (fleet.length === 0) {
    return null;
  }
  const index = fleet.findIndex((ship) => ship.id === currentId);
  if (index === -1) {
    return step === 1 ? fleet[0]! : fleet[fleet.length - 1]!;
  }
  return fleet[(index + step + fleet.length) % fleet.length]!;
}
