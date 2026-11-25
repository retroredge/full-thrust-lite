import { copyGameState } from './copyState';
import type { DebugSource } from './debugMenu';
import { choose } from './dialog';
import { VERSION } from '../version';

/**
 * The About popup, from the toolbar's About button: the game's version and,
 * during a game, a button that copies the game state to the clipboard for a
 * bug report.
 */
export async function showAbout(source: DebugSource | null): Promise<void> {
  const choice = await choose({
    eyebrow: 'About',
    title: 'Full Thrust Light',
    message: VERSION,
    choices: [
      ...(source === null ? [] : [{ value: 'copy', label: 'Copy game state' }]),
      { value: '', label: 'Close', primary: true },
    ],
  });
  if (choice === 'copy' && source !== null) {
    await copyGameState(source.state, source.context, 'About');
  }
}
