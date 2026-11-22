import type { GameState } from '../game/state';
import { dumpFileName, dumpState, type DumpContext } from '../game/stateDump';
import { announce, choose } from './dialog';
import { showSoundBoard } from './soundBoard';

/**
 * The Debug popup, for development only: shown from the toolbar's Debug
 * button on this machine, never on a deployed copy. It opens the sound board,
 * and copies or saves the game state as JSON to pass on after a playtest.
 */

/** The running game, as the Debug popup sees it. Null on the scenario list. */
export interface DebugSource {
  state: GameState;
  context: DumpContext;
}

export async function showDebugMenu(source: DebugSource | null): Promise<void> {
  const choice = await choose({
    eyebrow: 'Development only',
    title: 'Debug',
    message:
      source === null
        ? 'No game is running, so there is no game state to copy.'
        : `${source.state.scenarioName}, turn ${source.state.turn}, ${source.state.phase.kind}. Copy or save the game state as JSON to pass on.`,
    choices: [
      { value: 'sfx', label: 'Sound effects' },
      ...(source === null
        ? []
        : [
            { value: 'save', label: 'Save state' },
            { value: 'copy', label: 'Copy state', primary: true },
          ]),
      { value: '', label: 'Close', focus: source === null },
    ],
  });
  if (choice === 'sfx') {
    showSoundBoard();
  } else if (source !== null && (choice === 'copy' || choice === 'save')) {
    const savedAt = new Date();
    const json = dumpState(source.state, source.context, savedAt);
    if (choice === 'copy') {
      await copy(json);
    } else {
      save(json, dumpFileName(source.state, savedAt));
    }
  }
}

async function copy(json: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(json);
    await announce({
      eyebrow: 'Debug',
      title: 'Game state copied',
      subtitle: `${Math.ceil(json.length / 1024)} KB of JSON is on the clipboard.`,
      buttonLabel: 'OK',
    });
  } catch (error) {
    console.error(error);
    await announce({
      eyebrow: 'Debug',
      title: "Couldn't copy",
      subtitle: 'The browser blocked the clipboard. Use Save state instead.',
      buttonLabel: 'OK',
    });
  }
}

/** Hands the browser a file to save, to the usual downloads folder. */
function save(json: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
