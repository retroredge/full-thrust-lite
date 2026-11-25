import { version } from '../package.json';

/**
 * The game's version, e.g. "V0.0.2", shown in the About popup and
 * recorded in game state dumps. It is set only
 * in `package.json`: raise it there before publishing a new build, so a
 * tester can tell which build they are playing.
 */
export const VERSION = `V${version}`;
