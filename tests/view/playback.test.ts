import { describe, expect, it } from 'vitest';
import { createPlayback, isFinished, pause, progress, restart, resume, tick } from '../../src/view/playback';

describe('playback', () => {
  it('starts at zero and does not advance on its first tick', () => {
    const playback = createPlayback(1000);
    expect(progress(playback)).toBe(0);
    expect(tick(playback, 5000)).toBe(0);
  });

  it('advances with the time between ticks', () => {
    const playback = createPlayback(1000);
    tick(playback, 5000);
    expect(tick(playback, 5250)).toBeCloseTo(0.25);
    expect(tick(playback, 5500)).toBeCloseTo(0.5);
    expect(isFinished(playback)).toBe(false);
  });

  it('stops at the end', () => {
    const playback = createPlayback(1000);
    tick(playback, 0);
    expect(tick(playback, 99999)).toBe(1);
    expect(isFinished(playback)).toBe(true);
    expect(playback.elapsed).toBe(1000);
  });

  it('does not advance while paused, however long the pause', () => {
    const playback = createPlayback(1000);
    tick(playback, 0);
    tick(playback, 300);
    pause(playback);
    expect(tick(playback, 60000)).toBeCloseTo(0.3);
    expect(tick(playback, 120000)).toBeCloseTo(0.3);
  });

  it('carries on from where it was when resumed', () => {
    const playback = createPlayback(1000);
    tick(playback, 0);
    tick(playback, 300);
    pause(playback);
    tick(playback, 60000);
    resume(playback);
    // The first tick after resuming only restarts the clock.
    expect(tick(playback, 70000)).toBeCloseTo(0.3);
    expect(tick(playback, 70200)).toBeCloseTo(0.5);
  });

  it('restarts from the beginning, playing, even if it was paused or finished', () => {
    const playback = createPlayback(1000);
    tick(playback, 0);
    tick(playback, 5000);
    pause(playback);
    restart(playback);
    expect(playback.paused).toBe(false);
    expect(tick(playback, 9000)).toBe(0);
    expect(tick(playback, 9100)).toBeCloseTo(0.1);
  });

  it('ignores a clock that runs backwards', () => {
    const playback = createPlayback(1000);
    tick(playback, 500);
    tick(playback, 700);
    expect(tick(playback, 600)).toBeCloseTo(0.2);
  });

  it('treats a zero-length animation as finished', () => {
    expect(isFinished(createPlayback(0))).toBe(true);
  });
});
