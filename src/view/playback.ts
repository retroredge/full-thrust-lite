/**
 * A clock for an animation that can be paused, resumed and restarted.
 * Time only advances between ticks while it is running, so a pause of any
 * length leaves the animation exactly where it was.
 */
export interface Playback {
  /** Length of the animation in milliseconds. */
  duration: number;
  /** Milliseconds of the animation played so far. */
  elapsed: number;
  paused: boolean;
  /** Timestamp of the previous tick, or null if the clock has not ticked since it last started or resumed. */
  lastTick: number | null;
}

export function createPlayback(duration: number): Playback {
  return { duration, elapsed: 0, paused: false, lastTick: null };
}

/** Advances the clock to `now` (a timestamp in milliseconds) and returns the progress, 0 to 1. */
export function tick(playback: Playback, now: number): number {
  if (!playback.paused) {
    if (playback.lastTick !== null) {
      playback.elapsed = Math.min(playback.duration, playback.elapsed + Math.max(0, now - playback.lastTick));
    }
    playback.lastTick = now;
  }
  return progress(playback);
}

export function progress(playback: Playback): number {
  return playback.duration <= 0 ? 1 : Math.min(1, playback.elapsed / playback.duration);
}

export function isFinished(playback: Playback): boolean {
  return progress(playback) >= 1;
}

export function pause(playback: Playback): void {
  playback.paused = true;
  playback.lastTick = null;
}

export function resume(playback: Playback): void {
  playback.paused = false;
  playback.lastTick = null;
}

/** Goes back to the start and plays. */
export function restart(playback: Playback): void {
  playback.elapsed = 0;
  playback.paused = false;
  playback.lastTick = null;
}
