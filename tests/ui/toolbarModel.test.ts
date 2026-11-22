import { describe, expect, it } from 'vitest';
import type { Phase } from '../../src/game/state';
import { buildToolbar, type ToolbarContext } from '../../src/ui/toolbarModel';
import { gameState } from '../support/gameState';

const IDLE: ToolbarContext = { animating: false, replayTurn: null, targeting: false };
const at = (phase: Phase, turn = 3) => gameState({ phase, turn });

describe('buildToolbar', () => {
  it('locks in the plotting player’s orders, in their colour', () => {
    const toolbar = buildToolbar(at({ kind: 'plotting', playerId: 'p2' }), IDLE);
    expect(toolbar).toEqual({
      turn: 'Turn 3',
      activity: 'Order plotting · Player Two',
      main: { label: 'Lock in orders', title: "Lock in Player Two's orders for this turn", disabled: false, colour: '#e8322b' },
      resignDisabled: false,
    });
  });

  it('disables the main button while the ships move', () => {
    const toolbar = buildToolbar(at({ kind: 'moving' }), { ...IDLE, animating: true });
    expect(toolbar.activity).toBe('Ship movement');
    expect(toolbar.main).toEqual({ label: 'Moving…', title: '', disabled: true, colour: null });
    expect(toolbar.resignDisabled).toBe(true);
  });

  it('starts the fire phase once the ships have moved', () => {
    const toolbar = buildToolbar(at({ kind: 'movementComplete' }), IDLE);
    expect(toolbar.activity).toBe('Movement complete');
    expect(toolbar.main).toMatchObject({ label: 'Fire phase', title: 'Start the weapons fire phase', disabled: false });
  });

  it('says a replay is playing, and disables the buttons meanwhile', () => {
    const toolbar = buildToolbar(at({ kind: 'movementComplete' }), { ...IDLE, animating: true, replayTurn: 3 });
    expect(toolbar.activity).toBe('Replaying turn 3 movement');
    expect(toolbar.main.disabled).toBe(true);
    expect(toolbar.resignDisabled).toBe(true);
  });

  it('passes the firing player’s go when no ship is part-way through firing', () => {
    const toolbar = buildToolbar(at({ kind: 'firing', playerId: 'p1', activeShipId: null }), IDLE);
    expect(toolbar.activity).toBe('Weapons fire · Player One');
    expect(toolbar.main).toEqual({
      label: 'Pass',
      title: 'Player One fires no ship this go. If the other side passes too, weapons fire is over',
      disabled: false,
      colour: '#4cc27a',
    });
  });

  it('finishes the ship part-way through firing', () => {
    const toolbar = buildToolbar(at({ kind: 'firing', playerId: 'p1', activeShipId: 'FF1' }), IDLE);
    expect(toolbar.main).toMatchObject({ label: 'Finish FF1', title: 'FF1 fires no more this turn, and play passes on' });
  });

  it('disables the buttons while targeting', () => {
    const toolbar = buildToolbar(at({ kind: 'firing', playerId: 'p1', activeShipId: null }), { ...IDLE, targeting: true });
    expect(toolbar.main.disabled).toBe(true);
    expect(toolbar.resignDisabled).toBe(true);
  });

  it('ends the turn once firing is over', () => {
    const toolbar = buildToolbar(at({ kind: 'fireComplete' }), IDLE);
    expect(toolbar.activity).toBe('Weapons fire complete');
    expect(toolbar.main).toEqual({
      label: 'End turn',
      title: 'End turn 3 and start plotting turn 4',
      disabled: false,
      colour: null,
    });
  });

  it('disables everything once the game is over', () => {
    const toolbar = buildToolbar(at({ kind: 'gameOver', winnerId: 'p1' }), IDLE);
    expect(toolbar.activity).toBe('Game over');
    expect(toolbar.main).toMatchObject({ label: 'Game over', disabled: true });
    expect(toolbar.resignDisabled).toBe(true);
  });

  it('falls back to the player id for an unknown player', () => {
    const toolbar = buildToolbar(at({ kind: 'plotting', playerId: 'ghost' }), IDLE);
    expect(toolbar.activity).toBe('Order plotting · ghost');
    expect(toolbar.main.colour).toBeNull();
  });
});
