import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the real game in real browsers, separate from the Vitest
 * unit tests (`npm test`). Run with `npm run test:e2e`, and always before a
 * push or a publish to GitHub Pages.
 *
 * The game runs on Vite's dev server, on its own port so it never clashes
 * with one already running, because the tests use its development-only
 * hooks: `window.game` and `?seed=N` for repeatable dice.
 */
export default defineConfig({
  testDir: 'e2e',
  // Dice roll and ships move on screen, so a turn takes a while.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // No retries: a flaky test should show up as one.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'desktop',
      // The tablet checks are for the iPad only.
      testIgnore: /tablet\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // A landscape iPad in WebKit, Safari's engine, with touch. The height
      // allows for Safari's own bars, which take about 70 px of the screen.
      name: 'ipad',
      use: { ...devices['iPad (gen 7) landscape'], viewport: { width: 1080, height: 740 } },
    },
  ],
});
