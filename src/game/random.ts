import type { Rng } from '../rules/fire';

/**
 * A small, fast, repeatable random source (mulberry32): the same seed always
 * gives the same numbers, in [0, 1) like Math.random. The starfield uses it so
 * the sky is the same every time; development builds use it for the dice when
 * the page is opened with `?seed=N`, so end-to-end tests roll the same every run.
 */
export function seededRandom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed from a page address's `?seed=N`, or null if it has none or it isn't a whole number. */
export function seedFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get('seed');
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  return Number(value);
}
