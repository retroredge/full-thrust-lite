import { describe, expect, it } from 'vitest';
import { listOf, plural } from '../src/text';

describe('listOf', () => {
  it('joins items the English way', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['A'])).toBe('A');
    expect(listOf(['A', 'B'])).toBe('A and B');
    expect(listOf(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'fire control')).toBe('fire control');
    expect(plural(0, 'fire control')).toBe('fire controls');
    expect(plural(2, 'fire control')).toBe('fire controls');
  });

  it('takes an irregular plural', () => {
    expect(plural(1, 'die', 'dice')).toBe('die');
    expect(plural(3, 'die', 'dice')).toBe('dice');
    expect(plural(2, 'has', 'have')).toBe('have');
  });
});
