import { assertNever, findPlayer, playerName, type GameState } from '../game/state';

/** What the interface is doing besides the game itself, which the toolbar also reflects. */
export interface ToolbarContext {
  /** Ships are moving on screen, for real or in a replay. */
  animating: boolean;
  /** The turn whose movement is being replayed, or null if no replay is playing. */
  replayTurn: number | null;
  /** The targeting view, if it is open: whose ship is firing, whether it has fired yet, and whether the dice are rolling. */
  targeting: TargetingStatus | null;
}

/** What the toolbar needs to know about an open targeting view. */
export interface TargetingStatus {
  shooterId: string;
  /** At least one volley has been fired since the view opened. */
  fired: boolean;
  /** The dice and damage are playing out. */
  busy: boolean;
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
 * ship, or ends the turn, depending on the phase. While the targeting view is
 * open the main button closes it, so it is never greyed out with nothing to
 * say why: Cancel targeting before a volley, Continue after one.
 */
export function buildToolbar(state: GameState, context: ToolbarContext): Toolbar {
  const phase = state.phase;
  const busy = context.animating || context.targeting !== null;
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

  const targeting = context.targeting;
  if (targeting !== null && phase.kind === 'firing') {
    main = targeting.fired
      ? {
          label: 'Continue',
          title: `Close the targeting view, keeping what ${targeting.shooterId} has fired`,
          colour: main.colour,
        }
      : {
          label: 'Cancel targeting',
          title: `Close the targeting view; ${targeting.shooterId} has not fired`,
          colour: main.colour,
        };
    return {
      turn: `Turn ${state.turn}`,
      activity,
      main: { ...main, disabled: targeting.busy },
      resignDisabled: true,
    };
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
