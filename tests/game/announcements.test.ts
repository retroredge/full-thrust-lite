import { describe, expect, it } from 'vitest';
import { FIRING_HELP, PLOTTING_HELP, announcementFor, battleAreaReport } from '../../src/game/announcements';
import type { GameState, Phase } from '../../src/game/state';
import type { Order } from '../../src/rules/orders';
import type { Ship } from '../../src/rules/ship';
import { gameState } from '../support/gameState';

const makeState = (turn: number, phase: Phase, orders: Record<string, Order> = {}): GameState =>
  gameState({
    players: [
      { id: 'p1', name: 'Imperial Navy', colour: '#e8322b' },
      { id: 'p2', name: 'Rebel Fleet', colour: '#4cc27a' },
    ],
    turn,
    phase,
    orders,
  });

const plotting = (playerId: string): Phase => ({ kind: 'plotting', playerId });
const MOVING: Phase = { kind: 'moving' };
const MOVED: Phase = { kind: 'movementComplete' };

describe('announcementFor', () => {
  it('announces the first player plotting at the start of the game', () => {
    expect(announcementFor(null, makeState(1, plotting('p1')))).toEqual({
      title: 'Order plotting phase',
      subtitle: 'Imperial Navy',
      turn: 1,
      colour: '#e8322b',
      help: PLOTTING_HELP,
    });
  });

  it('announces the next player when plotting passes to them', () => {
    expect(announcementFor(makeState(1, plotting('p1')), makeState(1, plotting('p2')))).toEqual({
      title: 'Order plotting phase',
      subtitle: 'Rebel Fleet',
      turn: 1,
      colour: '#4cc27a',
      help: PLOTTING_HELP,
    });
  });

  it('announces movement once the last player locks in', () => {
    expect(announcementFor(makeState(3, plotting('p2')), makeState(3, MOVING))).toEqual({
      title: 'Movement phase',
      subtitle: 'All ships move',
      turn: 3,
      colour: null,
    });
  });

  it('announces the first player plotting when a new turn starts after movement', () => {
    expect(announcementFor(makeState(1, MOVING), makeState(2, plotting('p1')))).toEqual({
      title: 'Order plotting phase',
      subtitle: 'Imperial Navy',
      turn: 2,
      colour: '#e8322b',
      help: PLOTTING_HELP,
    });
  });

  it('announces the same player plotting again on a new turn', () => {
    expect(announcementFor(makeState(1, plotting('p1')), makeState(2, plotting('p1')))).toMatchObject({
      title: 'Order plotting phase',
      subtitle: 'Imperial Navy',
      turn: 2,
    });
  });

  it('announces nothing when an order changes within the same sub-phase', () => {
    const before = makeState(2, plotting('p2'));
    const after = makeState(2, plotting('p2'), { B1: { thrustChange: 1, turnDirection: 'P', turnPoints: 0 } });
    expect(announcementFor(before, after)).toBeNull();
    expect(announcementFor(before, before)).toBeNull();
  });

  it('announces nothing while the same turn keeps moving', () => {
    expect(announcementFor(makeState(4, MOVING), makeState(4, MOVING))).toBeNull();
  });

  it('falls back to the player id and no colour for an unknown player', () => {
    expect(announcementFor(null, makeState(1, plotting('ghost')))).toEqual({
      title: 'Order plotting phase',
      subtitle: 'ghost',
      turn: 1,
      colour: null,
      help: PLOTTING_HELP,
    });
  });

  it('stays quiet when the ships finish moving, so the players can replay before ending the turn', () => {
    expect(announcementFor(makeState(3, MOVING), makeState(3, MOVED))).toBeNull();
  });

  it('announces the first player plotting when End turn starts the next turn', () => {
    expect(announcementFor(makeState(3, MOVED), makeState(4, plotting('p1')))).toEqual({
      title: 'Order plotting phase',
      subtitle: 'Imperial Navy',
      turn: 4,
      colour: '#e8322b',
      help: PLOTTING_HELP,
    });
  });

  describe('weapons fire', () => {
    const firing = (playerId: string, activeShipId: string | null = null): Phase => ({
      kind: 'firing',
      playerId,
      activeShipId,
    });
    const withNote = (state: GameState, note: string | null): GameState => ({
      ...state,
      fire: { initiative: null, ships: {}, volleys: [], note, passes: [] },
    });

    it('announces who fires first after an initiative roll', () => {
      const rolled: GameState = {
        ...makeState(2, firing('p2')),
        fire: { initiative: { rounds: [{ p1: 2, p2: 5 }], winnerId: 'p2' }, ships: {}, volleys: [], note: null, passes: [] },
      };
      expect(announcementFor(makeState(2, MOVED), rolled)).toEqual({
        title: 'Weapons fire phase',
        subtitle: 'Rebel Fleet fires first',
        turn: 2,
        colour: '#4cc27a',
        help: FIRING_HELP,
      });
    });

    it('just says who fires when only one side can, with no initiative roll', () => {
      const unrolled = withNote(makeState(2, firing('p2')), 'Imperial Navy has nothing to fire, so no initiative is rolled.');
      expect(announcementFor(makeState(2, MOVED), unrolled)).toEqual({
        title: 'Weapons fire phase',
        subtitle: 'Rebel Fleet fires',
        turn: 2,
        colour: '#4cc27a',
        help: FIRING_HELP,
        detail: 'Imperial Navy has nothing to fire, so no initiative is rolled.',
      });
    });

    it('announces each new go, with the reason play changed hands', () => {
      expect(
        announcementFor(
          makeState(2, firing('p1')),
          withNote(makeState(2, firing('p2')), 'Imperial Navy fires no more this turn.'),
        ),
      ).toEqual({
        title: 'Weapons fire phase',
        subtitle: 'Rebel Fleet to fire',
        turn: 2,
        colour: '#4cc27a',
        help: FIRING_HELP,
        detail: 'Imperial Navy fires no more this turn.',
      });
      // Back to the same player once their ship has finished, because the other side can't fire.
      expect(announcementFor(makeState(2, firing('p1', 'A1')), makeState(2, firing('p1')))?.subtitle).toBe(
        'Imperial Navy to fire',
      );
    });

    it('stays quiet while a ship is firing', () => {
      expect(announcementFor(makeState(2, firing('p1')), makeState(2, firing('p1', 'A1')))).toBeNull();
      expect(announcementFor(makeState(2, firing('p1', 'A1')), makeState(2, firing('p1', 'A1')))).toBeNull();
    });

    it('says so when no ships are in range', () => {
      expect(
        announcementFor(makeState(1, MOVED), withNote(makeState(1, { kind: 'fireComplete' }), 'No ships are in range.')),
      ).toEqual({
        title: 'Weapons fire phase',
        subtitle: 'No ships are in range.',
        turn: 1,
        colour: null,
      });
    });

    it('announces the end of the phase', () => {
      expect(announcementFor(makeState(3, firing('p2')), makeState(3, { kind: 'fireComplete' }))).toEqual({
        title: 'Weapons fire complete',
        subtitle: 'End the turn when ready',
        turn: 3,
        colour: null,
      });
    });

    it('announces the winner', () => {
      expect(announcementFor(makeState(4, firing('p1', 'A1')), makeState(4, { kind: 'gameOver', winnerId: 'p1' }))).toEqual({
        title: 'Victory',
        subtitle: 'Imperial Navy wins',
        turn: 4,
        colour: '#e8322b',
        detail: 'Every enemy ship has been destroyed.',
      });
    });

    it('says when the loser resigned', () => {
      const resigned = makeState(4, { kind: 'gameOver', winnerId: 'p1', resignedId: 'p2' });
      expect(announcementFor(makeState(4, firing('p2')), resigned)?.detail).toBe('Rebel Fleet resigned.');
    });

    it("says when some of the loser's ships left the battle rather than being destroyed", () => {
      const won = { ...makeState(4, { kind: 'gameOver', winnerId: 'p1' }), withdrawn: [{ ship: shipOf('B1', 'p2'), turn: 4 }] };
      expect(announcementFor(makeState(4, MOVING), won)?.detail).toBe(
        'Every enemy ship has been destroyed or has left the battle.',
      );
    });

    it("doesn't count the winner's own ships that left", () => {
      const won = { ...makeState(4, { kind: 'gameOver', winnerId: 'p1' }), withdrawn: [{ ship: shipOf('A1', 'p1'), turn: 2 }] };
      expect(announcementFor(makeState(4, firing('p1')), won)?.detail).toBe('Every enemy ship has been destroyed.');
    });

    it('announces a draw', () => {
      expect(announcementFor(makeState(6, MOVING), makeState(6, { kind: 'gameOver', winnerId: null }))).toEqual({
        title: 'Draw',
        subtitle: 'Neither side wins',
        turn: 6,
        colour: null,
        detail: 'The last ships on both sides have left the battle.',
      });
    });
  });
});

/** A bare ship for the withdrawn list; only its id and owner matter here. */
function shipOf(id: string, playerId: string): Ship {
  return {
    id,
    designId: 'x',
    playerId,
    name: id,
    position: { x: 0, y: 0 },
    course: 12,
    velocity: 0,
    drives: [],
    hullDamage: 0,
    weaponsLost: [],
    fireControlsLost: [],
  };
}

describe('battleAreaReport', () => {
  it('is empty when no ship is leaving or has just left', () => {
    expect(battleAreaReport(makeState(3, MOVED))).toEqual([]);
  });

  it('warns about one ship out of reach', () => {
    expect(battleAreaReport({ ...makeState(3, MOVED), leaving: ['FF1'] })).toEqual([
      'FF1 is out of reach, with no enemy ship within 144 mu. It leaves the battle after the next move unless it ends within 144 mu of one.',
    ]);
  });

  it('warns about several ships at once', () => {
    expect(battleAreaReport({ ...makeState(3, MOVED), leaving: ['FF1', 'DD2', 'CL1'] })).toEqual([
      'FF1, DD2 and CL1 are out of reach, with no enemy ship within 144 mu. They leave the battle after the next move unless they end within 144 mu of one.',
    ]);
  });

  it("names the ships that left the battle in this turn's move, not earlier ones", () => {
    const state = {
      ...makeState(3, MOVED),
      withdrawn: [
        { ship: shipOf('FF2', 'p1'), turn: 2 },
        { ship: shipOf('FF1', 'p1'), turn: 3 },
        { ship: shipOf('CL2', 'p2'), turn: 3 },
      ],
      leaving: ['DD1'],
    };
    expect(battleAreaReport(state)).toEqual([
      'FF1 and CL2 have left the battle.',
      'DD1 is out of reach, with no enemy ship within 144 mu. It leaves the battle after the next move unless it ends within 144 mu of one.',
    ]);
  });
});
