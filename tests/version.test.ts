import { describe, expect, it } from 'vitest';
import { version } from '../package.json';
import { VERSION } from '../src/version';

describe('VERSION', () => {
  it('is the version from package.json, as V and three numbers', () => {
    expect(VERSION).toBe(`V${version}`);
    expect(VERSION).toMatch(/^V\d+\.\d+\.\d+$/);
  });
});
