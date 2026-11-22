import type { GameState, Player } from '../../src/game/state';
import type { Rng } from '../../src/rules/fire';
import type { Arc, Ship, ShipDesign, WeaponDesign } from '../../src/rules/ship';
import { gameState } from './gameState';

export const beam = (beamClass: number, arcs: Arc[]): WeaponDesign => ({ type: 'beam', class: beamClass, arcs });

export const design = (id: string, weapons: WeaponDesign[], fireControls: number, hullRows: number[] = [2, 2]): ShipDesign => ({
  id,
  fleet: 'red',
  className: id,
  code: 'XX',
  sprite: 'ships/x.png',
  length: 3,
  drives: [{ thrust: 4 }],
  hullRows,
  fireControls,
  weapons,
  ssd: { size: 1, weaponRows: weapons.map(() => 1) },
});

/** Two fire controls; a forward class 3, a starboard class 2, an all-round class 1 and a torpedo. */
export const CRUISER = design(
  'cruiser',
  [
    beam(3, ['FP', 'F', 'FS']),
    beam(2, ['F', 'FS', 'AS']),
    beam(1, ['FP', 'F', 'FS', 'AS', 'AP']),
    { type: 'pulseTorpedo', arcs: ['F'] },
  ],
  2,
);

/** One fire control, one all-round class 1 beam. */
export const ESCORT = design('escort', [beam(1, ['FP', 'F', 'FS', 'AS', 'AP'])], 1);

export const DESIGNS: ReadonlyMap<string, ShipDesign> = new Map([
  ['cruiser', CRUISER],
  ['escort', ESCORT],
]);

export const PLAYERS: Player[] = [
  { id: 'red', name: 'Red', colour: '#f00' },
  { id: 'blue', name: 'Blue', colour: '#00f' },
];

export const ship = (
  id: string,
  playerId: string,
  designId: string,
  x: number,
  y: number,
  course = 12,
  hullDamage = 0,
): Ship => ({
  id,
  designId,
  playerId,
  name: `${id} name`,
  position: { x, y },
  course,
  velocity: 0,
  drives: [{ thrust: 4, functional: true }],
  hullDamage,
  weaponsLost: [],
  fireControlsLost: [],
});

/** A game whose ships have just finished moving, ready for the fire phase. */
export const movedState = (ships: Ship[]): GameState =>
  gameState({ players: PLAYERS, designs: DESIGNS, ships, phase: { kind: 'movementComplete' } });

/** A random source that rolls these die faces in order, then throws if asked for more. */
export function dice(...faces: number[]): Rng {
  let index = 0;
  return () => {
    const face = faces[index];
    index += 1;
    if (face === undefined) {
      throw new Error('The test ran out of scripted dice.');
    }
    return (face - 0.5) / 6;
  };
}
