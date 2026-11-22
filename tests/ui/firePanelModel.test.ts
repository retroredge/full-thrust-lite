import { describe, expect, it } from 'vitest';
import { fireVolley, pass, startFirePhase } from '../../src/game/fire';
import type { GameState } from '../../src/game/state';
import { buildFirePanel, finishShipWarning, passWarning, type FirePanel } from '../../src/ui/firePanelModel';
import { dice, movedState, ship } from '../support/fireFixtures';

/** Red's cruiser R1 faces north with blue's escort B1 10 mu ahead; blue's B2 is far away. */
const redToFire = (): GameState =>
  startFirePhase(
    movedState([
      ship('R1', 'red', 'cruiser', 0, 0, 12),
      ship('B1', 'blue', 'escort', 0, -10, 6),
      ship('B2', 'blue', 'escort', 200, 0, 6),
    ]),
    dice(6, 1),
  );

function shipPanel(panel: FirePanel): Extract<FirePanel, { kind: 'ship' }> {
  if (panel.kind !== 'ship') {
    throw new Error(`Expected a ship panel, got ${panel.kind}`);
  }
  return panel;
}

describe('buildFirePanel', () => {
  it('prompts the firing player to choose a ship when none is selected', () => {
    expect(buildFirePanel(redToFire(), null)).toEqual({
      kind: 'none',
      prompt: 'Red: select one of your ships to fire with it.',
    });
  });

  it('lists the weapons and fire controls of a ship that can fire', () => {
    const panel = shipPanel(buildFirePanel(redToFire(), 'R1'));
    expect(panel).toMatchObject({ shipId: 'R1', firing: true, fireControlsLeft: 2, fireControls: 2 });
    expect(panel.weapons).toEqual([
      { index: 0, label: 'Class 3 beam', arcs: 'FP F FS', status: 'ready' },
      { index: 1, label: 'Class 2 beam', arcs: 'F FS AS', status: 'ready' },
      { index: 2, label: 'Class 1 beam', arcs: 'FP F FS AS AP', status: 'ready' },
      { index: 3, label: 'Pulse torpedo launcher', arcs: 'F', status: 'ready' },
    ]);
    expect(panel.prompt).toBe('Click a ringed enemy ship on the map to fire at it.');
  });

  it('shows fired weapons', () => {
    // 3 damage completes B1's first hull row; its threshold rolls are all 6s.
    const { next } = fireVolley(redToFire(), 'R1', 'B1', [0], dice(6, 4, 1, 6, 6, 6, 6, 6, 6));
    const panel = shipPanel(buildFirePanel(next, 'R1'));
    // R1 has finished (its only target is used up), so the beams that could reach B1 are simply not fired.
    expect(panel.weapons.map((weapon) => weapon.status)).toEqual(['fired', 'unused', 'unused', 'unused']);
    expect(panel.fireControlsLeft).toBe(1);
  });

  it('says a beam can only reach a ship already fired at, or that the fire controls are used up', () => {
    // B3 is 10 mu off R1's aft starboard quarter, where the class 3 beam can't reach.
    const start = startFirePhase(
      movedState([
        ship('R1', 'red', 'cruiser', 0, 0, 12),
        ship('B1', 'blue', 'escort', 0, -10, 6),
        ship('B3', 'blue', 'escort', 8, 6, 6),
      ]),
      dice(6, 1),
    );
    const first = fireVolley(start, 'R1', 'B1', [1], dice(1, 1)).next;
    expect(shipPanel(buildFirePanel(first, 'R1')).weapons.map((weapon) => weapon.status)).toEqual([
      'engaged',
      'fired',
      'ready',
      'engaged',
    ]);
    const second = fireVolley(first, 'R1', 'B3', [2], dice(1)).next;
    expect(shipPanel(buildFirePanel(second, 'R1')).weapons.map((weapon) => weapon.status)).toEqual([
      'noFireControl',
      'fired',
      'fired',
      'noFireControl',
    ]);
  });

  it("explains when it is the other player's go", () => {
    const panel = shipPanel(buildFirePanel(redToFire(), 'B1'));
    expect(panel.firing).toBe(false);
    expect(panel.prompt).toBe('Red is firing.');
  });

  it('explains when a ship has nothing in reach', () => {
    expect(shipPanel(buildFirePanel(redToFire(), 'R1')).prompt).not.toMatch(/No enemy/);
    const state = startFirePhase(
      movedState([
        ship('R1', 'red', 'cruiser', 0, 0, 12),
        ship('R2', 'red', 'escort', 100, 100, 12),
        ship('B1', 'blue', 'escort', 0, -10, 6),
      ]),
      dice(6, 1),
    );
    expect(shipPanel(buildFirePanel(state, 'R2')).prompt).toBe('No enemy ship is in range and arc of R2.');
  });

  it('says when a ship has finished, and when weapons fire is over', () => {
    // R1 has nothing else in reach, so it finishes by itself and blue fires.
    let state = fireVolley(redToFire(), 'R1', 'B1', [2], dice(1)).next;
    expect(shipPanel(buildFirePanel(state, 'R1')).prompt).toBe('Blue is firing.');
    state = fireVolley(state, 'B1', 'R1', [0], dice(1)).next;
    expect(state.phase.kind).toBe('fireComplete');
    expect(shipPanel(buildFirePanel(state, 'R1')).prompt).toBe('Weapons fire is over for this turn.');
  });
});

describe('knocked-out weapons', () => {
  it('shows a weapon lost to a threshold check as knocked out', () => {
    const state = startFirePhase(
      movedState([{ ...ship('R1', 'red', 'cruiser', 0, 0, 12), weaponsLost: [0] }, ship('B1', 'blue', 'escort', 0, -10, 6)]),
      dice(6, 1),
    );
    const panel = shipPanel(buildFirePanel(state, 'R1'));
    expect(panel.weapons.map((weapon) => weapon.status)).toEqual(['knockedOut', 'ready', 'ready', 'ready']);
  });
});

describe('pass and finish warnings', () => {
  /**
   * Red's cruiser R1 has blue's B1 dead ahead and B2 off its starboard bow,
   * and red's escort R2 beside it can reach B2. B1 and B2 face red.
   */
  const engaged = (): GameState =>
    startFirePhase(
      movedState([
        ship('R1', 'red', 'cruiser', 0, 0, 12),
        ship('R2', 'red', 'escort', 4, 2, 12),
        ship('B1', 'blue', 'escort', 0, -10, 6),
        ship('B2', 'blue', 'escort', 10, -6, 6),
      ]),
      dice(6, 1),
    );

  it('lists the ships that could still fire and explains that the other side passing too ends firing', () => {
    expect(passWarning(engaged(), 'red')).toEqual({
      title: 'Pass, Red?',
      message:
        "R1 and R2 could still fire. Blue fires next. If Blue passes too, weapons fire ends and your ships won't fire this turn. If Blue fires, it's your go again.",
    });
  });

  it('says firing ends at once when the other side has already passed', () => {
    const redPassed = pass(engaged(), 'red');
    expect(passWarning(redPassed, 'blue').message).toBe(
      "B1 and B2 could still fire. Red has already passed, so weapons fire ends now and they won't fire this turn.",
    );
  });

  it('says firing ends at once when the other side has nothing left to fire', () => {
    // Blue's escort faces away from red, so only red can fire.
    const onlyRed = startFirePhase(
      movedState([ship('R1', 'red', 'cruiser', 0, 0, 12), ship('B1', 'blue', 'escort', 0, -10, 12)]),
      dice(6, 1),
    );
    expect(passWarning(onlyRed, 'red').message).toBe(
      "R1 can still fire. Blue has nothing left to fire, so weapons fire ends now and it won't fire this turn.",
    );
  });

  it('says what a ship part-way through firing could still hit before it finishes', () => {
    const fired = fireVolley(engaged(), 'R1', 'B1', [2], dice(1)).next;
    expect(finishShipWarning(fired, 'red')).toEqual({
      title: 'Finish firing R1?',
      message: "R1 has 1 fire control left and could still fire at B2. It won't fire again this turn. Blue fires next.",
    });
  });
});
