import type { GameState } from '../../src/game/state';

/**
 * A game state for tests: two players, no ships or designs, turn 1, Player
 * One plotting, nothing else happened yet. Pass only the fields a test cares
 * about, so adding a field to GameState means changing just this file.
 */
export function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    scenarioName: 'Test',
    players: [
      { id: 'p1', name: 'Player One', colour: '#4cc27a' },
      { id: 'p2', name: 'Player Two', colour: '#e8322b' },
    ],
    designs: new Map(),
    ships: [],
    turn: 1,
    phase: { kind: 'plotting', playerId: 'p1' },
    orders: {},
    log: [],
    fire: null,
    leaving: [],
    withdrawn: [],
    ...overrides,
  };
}
