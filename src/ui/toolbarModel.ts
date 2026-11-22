import { assertNever, findPlayer, playerName, type GameState } from '../game/state';

/** What the interface is doing besides the game itself, which the toolbar also reflects. */
export interface ToolbarContext {
  /** Ships are moving on screen, for real or in a replay. */
  animating: boolean;
  /** The turn whose movement is being replayed, or null if no replay is playing. */
  replayTurn: number | null;
  /** A firing ship has a target on show. */
  targeting: boolean;
}

/** The main action button: what it says, its tooltip, whether it can be pressed, and the player colour it takes. */
export interface MainButton {
  label: string;
  title: string;
  disabled: boolean;
  /** The colour of the player it acts for, or null for no player. */
  colour: string | null;
}

export interface Toolbar {
  /** The turn number, shown in bold, and what is happening, e.g. "Weapons fire · Player One". */
  turn: string;
  activity: string;
  main: MainButton;
  resignDisabled: boolean;
}

/**
 * The toolbar for a moment in the game: the turn status and the main action
 * button, which locks in orders, starts the fire phase, passes or finishes a
 * ship, or ends the turn, depending on the phase.
 */
export function buildToolbar(state: GameState, context: ToolbarContext): Toolbar {
  const phase = state.phase;
  const busy = context.animating || context.targeting;
  const over = phase.kind === 'gameOver';
  let activity: string;
  let main: Omit<MainButton, 'disabled'>;

  switch (phase.kind) {
    case 'plotting': {
      const name = playerName(state, phase.playerId);
      activity = `Order plotting · ${name}`;
      main = {
        label: 'Lock in orders',
        title: `Lock in ${name}'s orders for this turn`,
        colour: findPlayer(state, phase.playerId)?.colour ?? null,
      };
      break;
    }
    case 'moving':
      activity = 'Ship movement';
      main = { label: 'Moving…', title: '', colour: null };
      break;
    case 'movementComplete':
      activity = 'Movement complete';
      main = { label: 'Fire phase', title: 'Start the weapons fire phase', colour: null };
      break;
    case 'firing': {
      const name = playerName(state, phase.playerId);
      const colour = findPlayer(state, phase.playerId)?.colour ?? null;
      activity = `Weapons fire · ${name}`;
      main =
        phase.activeShipId !== null
          ? {
              label: `Finish ${phase.activeShipId}`,
              title: `${phase.activeShipId} fires no more this turn, and play passes on`,
              colour,
            }
          : {
              label: 'Pass',
              title: `${name} fires no ship this go. If the other side passes too, weapons fire is over`,
              colour,
            };
      break;
    }
    case 'fireComplete':
      activity = 'Weapons fire complete';
      main = {
        label: 'End turn',
        title: `End turn ${state.turn} and start plotting turn ${state.turn + 1}`,
        colour: null,
      };
      break;
    case 'gameOver':
      activity = 'Game over';
      main = { label: 'Game over', title: '', colour: null };
      break;
    default:
      return assertNever(phase);
  }

  if (context.replayTurn !== null) {
    activity = `Replaying turn ${context.replayTurn} movement`;
  }

  return {
    turn: `Turn ${state.turn}`,
    activity,
    main: { ...main, disabled: phase.kind === 'moving' || busy || over },
    resignDisabled: busy || over,
  };
}
