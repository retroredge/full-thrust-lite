import { describe, expect, it } from 'vitest';
import { seededRandom, seedFromSearch } from '../../src/game/random';

describe('seededRandom', () => {
  it('stays in [0, 1)', () => {
    for (const seed of [0, 1, 42, 0xffffffff, -7]) {
      const random = seededRandom(seed);
      for (let index = 0; index < 2000; index += 1) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('repeats the same sequence for the same seed and differs for another seed', () => {
    const sample = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from({ length: 20 }, () => random());
    };
    expect(sample(99)).toEqual(sample(99));
    expect(sample(99)).not.toEqual(sample(100));
  });

  it('rolls every die face', () => {
    const random = seededRandom(7);
    const faces = new Set(Array.from({ length: 600 }, () => Math.floor(random() * 6) + 1));
    expect([...faces].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('seedFromSearch', () => {
  it('reads a whole-number seed', () => {
    expect(seedFromSearch('?seed=123')).toBe(123);
    expect(seedFromSearch('?x=1&seed=0')).toBe(0);
  });

  it('ignores a missing or malformed seed', () => {
    expect(seedFromSearch('')).toBeNull();
    expect(seedFromSearch('?seed=')).toBeNull();
    expect(seedFromSearch('?seed=abc')).toBeNull();
    expect(seedFromSearch('?seed=-3')).toBeNull();
  });
});
