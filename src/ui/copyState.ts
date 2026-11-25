import { dumpState, type DumpContext } from '../game/stateDump';
import type { GameState } from '../game/state';
import { announce } from './dialog';

/**
 * Puts the game state on the clipboard as JSON, for a player or tester to
 * paste into a bug report, then says whether it worked. Used by the About and
 * Debug popups.
 */
export async function copyGameState(state: GameState, context: DumpContext, eyebrow: string): Promise<void> {
  const json = dumpState(state, context, new Date());
  try {
    await navigator.clipboard.writeText(json);
    await announce({
      eyebrow,
      title: 'Game state copied',
      subtitle: `${Math.ceil(json.length / 1024)} KB of JSON is on the clipboard.`,
      buttonLabel: 'OK',
    });
  } catch (error) {
    console.error(error);
    await announce({
      eyebrow,
      title: "Couldn't copy",
      subtitle: 'The browser blocked the clipboard.',
      buttonLabel: 'OK',
    });
  }
}
