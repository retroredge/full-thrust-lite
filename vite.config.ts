import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the built site works wherever it is served from:
  // the root of a domain, a GitHub Pages project folder (user.github.io/repo/),
  // or a local static server.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
