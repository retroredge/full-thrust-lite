import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/game/state';
import type { Ship, ShipDesign } from '../../src/rules/ship';
import { OverheadProjection, type Camera, type Viewport } from '../../src/view/projection';
import {
  MIN_SHIP_RADIUS_PX,
  buildScene,
  pickShip,
  sizeClassOf,
  shipRadiusPx,
  TOUCH_PICK_MARGIN_PX,
  type Scene,
  type SceneShip,
} from '../../src/view/scene';
import { gameState } from '../support/gameState';

const design = (id: string, length: number, sprite: string): ShipDesign => ({
  id,
  fleet: 'red',
  className: id,
  code: id.slice(0, 2).toUpperCase(),
  sprite,
  length,
  drives: [{ thrust: 6 }],
  hullRows: [2],
  fireControls: 0,
  weapons: [],
  ssd: { size: 1, weaponRows: [] },
});

const makeShip = (id: string, playerId: string, overrides: Partial<Ship> = {}): Ship => ({
  id,
  designId: 'destroyer',
  playerId,
  name: `${id} name`,
  position: { x: 10, y: 10 },
  course: 12,
  velocity: 4,
  drives: [{ thrust: 6, functional: true }],
  hullDamage: 0,
  weaponsLost: [],
  fireControlsLost: [],
  ...overrides,
});

const makeState = (ships: Ship[]): GameState =>
  gameState({
    players: [
      { id: 'p1', name: 'One', colour: '#e8322b' },
      { id: 'p2', name: 'Two', colour: '#4cc27a' },
    ],
    designs: new Map([
      ['destroyer', design('destroyer', 3, 'ships/DD-green.png')],
      ['cruiser', design('cruiser', 4.5, 'ships/cruiser.png')],
    ]),
    ships,
  });

const standardState = () =>
  makeState([
    makeShip('DD1', 'p1', { position: { x: 6, y: 14 }, course: 3 }),
    makeShip('CH1', 'p2', { designId: 'cruiser', position: { x: 66, y: 24 }, course: 9 }),
    makeShip('DD2', 'p1', { position: { x: -2, y: 30 } }),
  ]);

describe('buildScene', () => {
  it('includes every ship, with heading from course and design details', () => {
    const scene = buildScene(standardState());
    expect(scene.ships.map((ship) => ship.id)).toEqual(['DD1', 'CH1', 'DD2']);
    expect(scene.ships[0]).toEqual({
      id: 'DD1',
      label: 'DD1',
      position: { x: 6, y: 14 },
      heading: 90,
      sprite: 'ships/DD-green.png',
      length: 3,
      colour: '#e8322b',
      selected: false,
      strength: 1,
      sizeClass: 'small',
      emphasis: 'normal',
      leaving: false,
    });
    expect(scene.ships[1]).toMatchObject({ heading: 270, sprite: 'ships/cruiser.png', length: 4.5, colour: '#4cc27a' });
  });

  it('gives each ship the share of its hull boxes left as its strength', () => {
    const scene = buildScene(
      makeState([makeShip('A', 'p1'), makeShip('B', 'p1', { hullDamage: 1 }), makeShip('C', 'p1', { hullDamage: 5 })]),
    );
    expect(scene.ships.map((ship) => ship.strength)).toEqual([1, 0.5, 0]);
  });

  it('sorts SSD sizes into small, medium and large ships', () => {
    expect([1, 2, 3, 4, 5].map(sizeClassOf)).toEqual(['small', 'small', 'medium', 'medium', 'large']);
  });

  it('refuses a ship of unknown design, as the data is broken', () => {
    expect(() => buildScene(makeState([makeShip('X', 'p1', { designId: 'mystery' })]))).toThrow('unknown design "mystery"');
  });

  it('maps course 12 to heading 0', () => {
    const scene = buildScene(makeState([makeShip('A', 'p1', { course: 12 })]));
    expect(scene.ships[0]!.heading).toBe(0);
  });

  it('draws a ship of an unknown player in white', () => {
    const scene = buildScene(makeState([makeShip('X', 'nobody')]));
    expect(scene.ships[0]).toMatchObject({ colour: '#ffffff' });
  });

  it('uses animated poses in place of stored positions', () => {
    const scene = buildScene(standardState(), {
      poses: { DD1: { position: { x: 8.5, y: 13 }, heading: -15 } },
    });
    expect(scene.ships[0]).toMatchObject({ position: { x: 8.5, y: 13 }, heading: -15 });
    expect(scene.ships[1]).toMatchObject({ position: { x: 66, y: 24 }, heading: 270 });
  });

  it('flags only the selected ship', () => {
    const scene = buildScene(standardState(), { selectedShipId: 'CH1' });
    expect(scene.ships.map((ship) => ship.selected)).toEqual([false, true, false]);
    expect(buildScene(standardState(), { selectedShipId: null }).ships.every((ship) => !ship.selected)).toBe(true);
  });

  it('draws trails in player colours for ships that have one', () => {
    const scene = buildScene(standardState(), {
      trails: {
        DD1: [
          { x: 0, y: 14 },
          { x: 6, y: 14 },
        ],
        DD2: [
          { x: 1, y: 30 },
          { x: -2, y: 30 },
        ],
        CH1: [{ x: 66, y: 24 }],
      },
    });
    expect(scene.trails).toEqual([
      {
        shipId: 'DD1',
        colour: '#e8322b',
        points: [
          { x: 0, y: 14 },
          { x: 6, y: 14 },
        ],
      },
      {
        shipId: 'DD2',
        colour: '#e8322b',
        points: [
          { x: 1, y: 30 },
          { x: -2, y: 30 },
        ],
      },
    ]);
  });

  it('has no trails by default', () => {
    expect(buildScene(standardState()).trails).toEqual([]);
  });

  it('marks ships that are leaving the battle', () => {
    const scene = buildScene({ ...standardState(), leaving: ['CH1'] });
    expect(scene.ships.map((ship) => [ship.id, ship.leaving])).toEqual([
      ['DD1', false],
      ['CH1', true],
      ['DD2', false],
    ]);
  });
});

describe('shipRadiusPx', () => {
  const sceneShip = (length: number): SceneShip => ({
    id: 'S',
    label: 'S',
    position: { x: 0, y: 0 },
    heading: 0,
    sprite: '',
    length,
    colour: '#fff',
    selected: false,
    strength: 1,
    sizeClass: 'small',
    emphasis: 'normal',
    leaving: false,
  });

  it('never goes below the minimum size when zoomed out', () => {
    expect(shipRadiusPx(sceneShip(3), { centre: { x: 0, y: 0 }, zoom: 2 })).toBe(MIN_SHIP_RADIUS_PX);
    expect(shipRadiusPx(sceneShip(0.1), { centre: { x: 0, y: 0 }, zoom: 1 })).toBe(MIN_SHIP_RADIUS_PX);
  });

  it('grows with zoom and ship length when zoomed in', () => {
    const camera: Camera = { centre: { x: 0, y: 0 }, zoom: 40 };
    const small = shipRadiusPx(sceneShip(3), camera);
    const large = shipRadiusPx(sceneShip(4.5), camera);
    expect(small).toBeGreaterThan(MIN_SHIP_RADIUS_PX);
    expect(large).toBeGreaterThan(small);
    expect(shipRadiusPx(sceneShip(3), { centre: { x: 0, y: 0 }, zoom: 80 })).toBeGreaterThan(small);
  });
});

describe('pickShip', () => {
  const projection = new OverheadProjection();
  const viewport: Viewport = { width: 800, height: 600 };
  const camera: Camera = { centre: { x: 36, y: 24 }, zoom: 10 };
  const screenOf = (scene: Scene, id: string) =>
    projection.worldToScreen(scene.ships.find((ship) => ship.id === id)!.position, camera, viewport);

  it('picks the ship under the point', () => {
    const scene = buildScene(standardState());
    const point = screenOf(scene, 'CH1');
    expect(pickShip(scene, point, camera, viewport, projection)?.id).toBe('CH1');
    expect(pickShip(scene, { x: point.x + 5, y: point.y - 5 }, camera, viewport, projection)?.id).toBe('CH1');
  });

  it('reaches further for a tap than for a click', () => {
    const scene = buildScene(standardState());
    const ship = scene.ships.find((candidate) => candidate.id === 'CH1')!;
    const centre = screenOf(scene, 'CH1');
    // 10 px outside the base ring, straight up: beyond a click's margin, within a tap's.
    const point = { x: centre.x, y: centre.y - shipRadiusPx(ship, camera) - 10 };
    expect(pickShip(scene, point, camera, viewport, projection)).toBeNull();
    expect(pickShip(scene, point, camera, viewport, projection, TOUCH_PICK_MARGIN_PX)?.id).toBe('CH1');
  });

  it('returns null on empty space', () => {
    const scene = buildScene(standardState());
    expect(pickShip(scene, { x: 400, y: 300 }, camera, viewport, projection)).toBeNull();
  });

  it('picks a ship at a negative position', () => {
    const scene = buildScene(standardState());
    const where = projection.worldToScreen({ x: -2, y: 30 }, camera, viewport);
    expect(pickShip(scene, where, camera, viewport, projection)?.id).toBe('DD2');
  });

  it('picks the nearest of two overlapping ships', () => {
    const scene = buildScene(
      makeState([makeShip('A', 'p1', { position: { x: 36, y: 24 } }), makeShip('B', 'p2', { position: { x: 37, y: 24 } })]),
    );
    // A is at screen x 400 and B at 410; both radii cover the gap.
    expect(pickShip(scene, { x: 403, y: 300 }, camera, viewport, projection)?.id).toBe('A');
    expect(pickShip(scene, { x: 407, y: 300 }, camera, viewport, projection)?.id).toBe('B');
    expect(pickShip(scene, { x: 412, y: 300 }, camera, viewport, projection)?.id).toBe('B');
    expect(pickShip(scene, { x: 397, y: 300 }, camera, viewport, projection)?.id).toBe('A');
  });
});

describe('buildScene while choosing a target', () => {
  it('marks the ships that can be fired at and dims the rest, but never the firing ship', () => {
    const scene = buildScene(standardState(), { selectedShipId: 'DD1', targetIds: new Set(['CH1']) });
    expect(scene.ships.map((ship) => [ship.id, ship.emphasis])).toEqual([
      ['DD1', 'normal'],
      ['CH1', 'target'],
      ['DD2', 'dimmed'],
    ]);
  });

  it('carries the fire envelope, explosions and time through', () => {
    const fireEnvelope = { centre: { x: 0, y: 0 }, heading: 0, colour: '#fff', bands: [], torpedo: null };
    const explosions = [{ position: { x: 1, y: 2 }, length: 3, progress: 0.5 }];
    const scene = buildScene(standardState(), { fireEnvelope, explosions, time: 42 });
    expect(scene.fireEnvelope).toBe(fireEnvelope);
    expect(scene.explosions).toBe(explosions);
    expect(scene.time).toBe(42);
    expect(buildScene(standardState()).fireEnvelope).toBeNull();
  });

  it('carries the line to the target through, and has none by default', () => {
    const targetLine = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, fromLength: 3, toLength: 2, label: '10.0 mu' };
    expect(buildScene(standardState(), { targetLine }).targetLine).toBe(targetLine);
    expect(buildScene(standardState()).targetLine).toBeNull();
  });
});
