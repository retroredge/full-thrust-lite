import { BATTLE_AREA_RANGE } from '../rules/battleArea';
import { findPlayer, type GameState } from './state';
import { listOf, plural } from '../text';

/** A pause between phases, telling the players what comes next. */
export interface Announcement {
  title: string;
  /** Who it is for, or what happens next. */
  subtitle: string;
  turn: number;
  /** The colour of the player concerned, if there is one. */
  colour: string | null;
  /** A further line, e.g. why play has passed to this player. */
  detail?: string;
  /** Standing instructions for the phase, e.g. how to plot orders. */
  help?: string;
}

/** What a player does in their order plotting phase, shown under its announcement. */
export const PLOTTING_HELP =
  "Set each ship's thrust and course change in the MOVEMENT ORDERS panel, then press the 'Lock in orders' button.";

/** How firing works, shown each time a player's go in the fire phase starts. */
export const FIRING_HELP =
  "Select one of your ships and click an enemy it can reach to target it, then press the 'Fire!' button. " +
  'Each fire control can engage one target. When that ship has finished firing, play passes to the other player.';

function withDetail(announcement: Announcement, detail: string | null | undefined): Announcement {
  return detail ? { ...announcement, detail } : announcement;
}

/**
 * The announcement due when the game moves from `previous` to `next`, or null
 * if nothing new has started. Pass null as `previous` at the start of a game.
 */
export function announcementFor(previous: GameState | null, next: GameState): Announcement | null {
  const phase = next.phase;
  const before = previous?.phase;
  const sameTurn = previous !== null && previous.turn === next.turn;

  if (phase.kind === 'plotting') {
    if (sameTurn && before?.kind === 'plotting' && before.playerId === phase.playerId) {
      return null;
    }
    const player = findPlayer(next, phase.playerId);
    return {
      title: 'Order plotting phase',
      subtitle: player?.name ?? phase.playerId,
      turn: next.turn,
      colour: player?.colour ?? null,
      help: PLOTTING_HELP,
    };
  }

  if (phase.kind === 'moving' && !(sameTurn && before?.kind === 'moving')) {
    return { title: 'Movement phase', subtitle: 'All ships move', turn: next.turn, colour: null };
  }

  const note = next.fire?.note;
  if (phase.kind === 'firing') {
    // A new go starts when play changes hands, or comes back to the same
    // player once their last ship has finished.
    const newGo =
      before?.kind !== 'firing' ||
      before.playerId !== phase.playerId ||
      (before.activeShipId !== null && phase.activeShipId === null);
    if (!newGo) {
      return null;
    }
    const player = findPlayer(next, phase.playerId);
    const name = player?.name ?? phase.playerId;
    return withDetail(
      {
        title: 'Weapons fire phase',
        subtitle: before?.kind === 'firing' ? `${name} to fire` : next.fire?.initiative ? `${name} fires first` : `${name} fires`,
        turn: next.turn,
        colour: player?.colour ?? null,
        help: FIRING_HELP,
      },
      note,
    );
  }

  if (phase.kind === 'fireComplete' && before?.kind !== 'fireComplete') {
    if (before?.kind === 'firing') {
      return withDetail(
        { title: 'Weapons fire complete', subtitle: 'End the turn when ready', turn: next.turn, colour: null },
        note,
      );
    }
    return { title: 'Weapons fire phase', subtitle: note ?? 'No ships can fire', turn: next.turn, colour: null };
  }

  if (phase.kind === 'gameOver' && before?.kind !== 'gameOver') {
    if (phase.winnerId === null) {
      return {
        title: 'Draw',
        subtitle: 'Neither side wins',
        turn: next.turn,
        colour: null,
        detail: 'The last ships on both sides have left the battle.',
      };
    }
    const winnerId = phase.winnerId;
    const player = findPlayer(next, winnerId);
    const resigned = phase.resignedId === undefined ? undefined : findPlayer(next, phase.resignedId);
    const enemiesLeft = next.withdrawn.some((gone) => gone.ship.playerId !== winnerId);
    return {
      title: 'Victory',
      subtitle: `${player?.name ?? winnerId} wins`,
      turn: next.turn,
      colour: player?.colour ?? null,
      detail:
        resigned !== undefined
          ? `${resigned.name} resigned.`
          : enemiesLeft
            ? 'Every enemy ship has been destroyed or has left the battle.'
            : 'Every enemy ship has been destroyed.',
    };
  }
  // Movement finishing isn't a new phase: the players carry on to the fire phase.
  return null;
}

/**
 * What the last move did to the battle area, for the players once the ships
 * have moved: which ships have just left the battle, and which are out of
 * reach and will leave after the next move unless they close in. Empty if
 * neither.
 */
export function battleAreaReport(state: GameState): string[] {
  const lines: string[] = [];
  const gone = state.withdrawn.filter((entry) => entry.turn === state.turn).map((entry) => entry.ship.id);
  if (gone.length > 0) {
    lines.push(`${listOf(gone)} ${plural(gone.length, 'has', 'have')} left the battle.`);
  }
  const leaving = state.leaving;
  if (leaving.length > 0) {
    const one = leaving.length === 1;
    lines.push(
      `${listOf(leaving)} ${one ? 'is' : 'are'} out of reach, with no enemy ship within ${BATTLE_AREA_RANGE} mu. ` +
        `${one ? 'It leaves' : 'They leave'} the battle after the next move unless ${one ? 'it ends' : 'they end'} within ${BATTLE_AREA_RANGE} mu of one.`,
    );
  }
  return lines;
}
