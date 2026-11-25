import { describe, expect, it } from 'vitest';
import { parseDesign, parseScenario } from '../../src/data/loader';
import { createGame, type GameState } from '../../src/game/state';
import { DUMP_FORMAT, DUMP_VERSION, dumpFileName, dumpState } from '../../src/game/stateDump';
import { VERSION } from '../../src/version';

const design = parseDesign(
  {
    id: 'frigate',
    fleet: 'red',
    className: 'Frigate',
    code: 'FF',
    sprite: 'ships/ship.png',
    length: 3,
    drives: [{ thrust: 4 }],
    hullRows: [2, 2],
    fireControls: 1,
    weapons: [],
    ssd: { size: 1, weaponRows: [] },
  },
  'red/frigate',
);

const designs = new Map([['red/frigate', design]]);

const ship = (id: string, x: number, course: number) => ({
  id,
  name: `${id} name`,
  design: 'frigate',
  x,
  y: 0,
  course,
  velocity: 4,
});

const scenario = parseScenario(
  {
    id: 'introductory',
    number: 1,
    name: 'Introductory Scenario',
    description: 'A test.',
    players: [
      { id: 'p1', name: 'Player One', colour: '#4cc27a', fleet: 'red', ships: [ship('FF1', 0, 12)] },
      { id: 'p2', name: 'Player Two', colour: '#e8322b', fleet: 'red', ships: [ship('FF2', 10, 6)] },
    ],
  },
  designs,
);

const game = (): GameState => createGame(scenario, designs);
const savedAt = new Date(2026, 10, 17, 14, 5);
const context = {
  selectedShipId: 'FF1',
  targetingShipId: null,
  animating: false,
  camera: { centre: { x: 1, y: 2 }, zoom: 20 },
  viewport: { width: 800, height: 600 },
};

describe('dumpState', () => {
  it('writes the whole state as JSON, with the designs as a plain object', () => {
    const state = game();
    const dump = JSON.parse(dumpState(state, context, savedAt));
    expect(dump.format).toBe(DUMP_FORMAT);
    expect(dump.version).toBe(DUMP_VERSION);
    expect(dump.gameVersion).toBe(VERSION);
    expect(dump.savedAt).toBe(savedAt.toISOString());
    expect(dump.context).toEqual(context);
    expect(dump.state.designs).toEqual({ 'red/frigate': JSON.parse(JSON.stringify(design)) });
    expect(dump.state.ships).toEqual(JSON.parse(JSON.stringify(state.ships)));
    expect(dump.state.phase).toEqual(state.phase);
    expect(Object.keys(dump.state).sort()).toEqual(Object.keys(state).sort());
  });

  it('leaves the state itself alone', () => {
    const state = game();
    dumpState(state, context, savedAt);
    expect(state.designs).toBeInstanceOf(Map);
  });
});

describe('dumpFileName', () => {
  it('names the scenario, turn, phase and time', () => {
    expect(dumpFileName(game(), savedAt)).toBe('ft-state-introductory-scenario-t1-plotting-2026-11-17-1405.json');
  });
});
