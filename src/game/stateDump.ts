import type { GameState } from './state';

/** Identifies a game state dump, so a file can be recognised later. */
export const DUMP_FORMAT = 'full-thrust-light/game-state';
export const DUMP_VERSION = 1;

/** What the interface was doing when the state was dumped, beyond the game state itself. */
export interface DumpContext {
  selectedShipId: string | null;
  /** The ship being targeted from, if targeting was open. */
  targetingShipId: string | null;
  /** True while ships were moving or dice were rolling. */
  animating: boolean;
  /** Where the map was looking: its centre in mu and zoom in px per mu, and the map's size in px. */
  camera: { centre: { x: number; y: number }; zoom: number };
  viewport: { width: number; height: number };
}

/**
 * The whole game state as readable JSON, for passing on when something looks
 * wrong in a playtest. The designs map becomes a plain object keyed as before
 * (`red/frigate`), so nothing is lost.
 */
export function dumpState(state: GameState, context: DumpContext, savedAt: Date): string {
  return JSON.stringify(
    {
      format: DUMP_FORMAT,
      version: DUMP_VERSION,
      savedAt: savedAt.toISOString(),
      context,
      state: { ...state, designs: Object.fromEntries(state.designs) },
    },
    null,
    2,
  );
}

/** A file name for a dump, e.g. `ft-state-introductory-t3-firing-2026-11-17-1405.json`. */
export function dumpFileName(state: GameState, savedAt: Date): string {
  const slug = state.scenarioName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${savedAt.getFullYear()}-${pad(savedAt.getMonth() + 1)}-${pad(savedAt.getDate())}-${pad(savedAt.getHours())}${pad(savedAt.getMinutes())}`;
  return `ft-state-${slug || 'game'}-t${state.turn}-${state.phase.kind}-${stamp}.json`;
}
