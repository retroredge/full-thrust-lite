import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dismissPopup, mainButton, playToFirePhase, startScenario, startTargeting } from './helpers';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Checks for a landscape iPad: touch-sized controls, and nothing scrolling the
 * toolbar off the screen (as happened on iPad Safari in November 2026).
 */

test.beforeEach(({ browserName }) => {
  // Run by the ipad project only (see playwright.config.ts): Safari's engine.
  expect(browserName).toBe('webkit');
});

/** The visible buttons, dropdowns and turn buttons smaller than 44×44 px, by label and size. */
async function smallControls(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, .segmented span')]
      .filter((element) => element.offsetParent !== null && !element.closest('dialog'))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(
        ({ element, box }) => `${element.textContent?.trim() || element.id} ${Math.round(box.width)}×${Math.round(box.height)}`,
      ),
  );
}

/** Where the toolbar's top edge is, and how far the page has scrolled. */
async function toolbarAndScroll(page: Page): Promise<{ toolbarTop: number; scrollY: number }> {
  return page.evaluate(() => ({
    toolbarTop: Math.round(document.querySelector('.toolbar')!.getBoundingClientRect().top),
    scrollY: Math.round(document.scrollingElement!.scrollTop),
  }));
}

/** True if the element is wholly inside the window. */
async function inView(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth;
  });
}

test('the browser is set up as a touch screen', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
});

test('every control is big enough for a finger, and the Turn row fits on one line', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  await dismissPopup(page);
  expect(await smallControls(page)).toEqual([]);
  const onOneLine = await page.evaluate(() => {
    const turn = document.querySelector('.segmented')!.getBoundingClientRect();
    return [...document.querySelectorAll('.order-value select')].some(
      (select) => Math.abs(select.getBoundingClientRect().top - turn.top) < 4,
    );
  });
  expect(onOneLine).toBe(true);
  expect(await inView(page, '#next-ship')).toBe(true);
});

test('targeting keeps the toolbar, Fire! and Cancel on screen', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  await playToFirePhase(page);
  expect(await startTargeting(page)).toBe(true);
  expect(await toolbarAndScroll(page)).toEqual({ toolbarTop: 0, scrollY: 0 });
  expect(await inView(page, '.fire-button')).toBe(true);
  expect(await inView(page, '.targeting-actions button:not([hidden]):not(.fire-button)')).toBe(true);
  expect(await smallControls(page)).toEqual([]);
});

test('the page never scrolls, even when it is taller than the window', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  // As iPad Safari's 100vh once did: make the page taller than what's visible,
  // so focusing a button near the bottom could scroll the toolbar away.
  await page.addStyleTag({ content: '#app { height: calc(100dvh + 80px) !important; }' });
  await playToFirePhase(page);
  expect(await startTargeting(page)).toBe(true);
  expect(await toolbarAndScroll(page)).toEqual({ toolbarTop: 0, scrollY: 0 });
  // Fire! is below the visible area here, as it was on Safari; press it in
  // place, since Playwright would try to scroll to it first.
  await page.locator('.fire-button').dispatchEvent('click');
  await expect(mainButton(page)).toBeEnabled({ timeout: 30_000 });
  expect(await toolbarAndScroll(page)).toEqual({ toolbarTop: 0, scrollY: 0 });
});

test('About shows the version', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  await dismissPopup(page);
  await page.locator('#about').tap();
  await expect(page.locator('dialog[open] .dialog-message')).toHaveText(`V${version}`);
});
