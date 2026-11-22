import { describe, expect, it } from 'vitest';
import { isLocalHost } from '../../src/ui/localHost';

describe('isLocalHost', () => {
  it('accepts localhost and loopback addresses', () => {
    for (const host of ['localhost', 'LOCALHOST', 'game.localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) {
      expect(isLocalHost(host)).toBe(true);
    }
  });

  it('rejects any other host', () => {
    for (const host of [
      '',
      'example.com',
      'localhost.example.com',
      'mylocalhost',
      '192.168.1.10',
      '10.0.0.1',
      '127.0.0.1.example.com',
    ]) {
      expect(isLocalHost(host)).toBe(false);
    }
  });
});
