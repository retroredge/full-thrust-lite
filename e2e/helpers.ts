import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers for driving the game like a player: pressing buttons, and clicking
 * or tapping ships on the map. They read the game through the development-only
 * `window.game` hook, and the dice repeat for a given `?seed=`.
 */

/** The game state as the tests read it, a small part of `GameState`. */
interface Seen {
  turn: number;
  phase: { kind: string; playerId?: string; activeShipId?: string | null };
  ships: { id: string; playerId: string }[];
}

/** The toolbar's main button: Lock in orders, Fire phase, Pass, Continue, End turn… */
export const mainButton = (page: Page): Locator => page.locator('#execute');

/** Whether this test is running on a touch screen (the iPad project). */
const isTouch = async (page: Page): Promise<boolean> => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

export async function seen(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const game = (window as unknown as { game: { state: Seen } }).game;
    const state = game.state;
    return {
      turn: state.turn,
      phase: { ...state.phase },
      ships: state.ships.map((ship) => ({ id: ship.id, playerId: ship.playerId })),
    };
  });
}

/** Opens the game with repeatable dice, picks a scenario by title and presses Play. */
export async function startScenario(page: Page, title: string, seed = 1): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.locator('.intro-option', { hasText: title }).click();
  await page.locator('.intro-play').click();
  await page.waitForFunction(() => 'game' in window);
}

/** The open popup, if any. */
const openDialog = (page: Page): Locator => page.locator('dialog[open]');

/** Presses the primary button of the open popup (Begin, Lock in, Pass…), if one is open. Returns whether it did. */
export async function dismissPopup(page: Page): Promise<boolean> {
  const dialog = openDialog(page);
  if ((await dialog.count()) === 0) {
    return false;
  }
  await dialog.locator('button.primary').first().click();
  return true;
}

/**
 * Plays on, pressing popups' primary buttons and the main button whenever it
 * is enabled, until `done` is true. Throws if that takes too long.
 */
export async function playUntil(page: Page, done: (state: Seen) => boolean, limit = 60): Promise<void> {
  for (let step = 0; step < limit; step++) {
    if (done(await seen(page))) {
      return;
    }
    if (!(await dismissPopup(page)) && (await mainButton(page).isEnabled())) {
      await mainButton(page).click();
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`Gave up waiting; the game is at ${JSON.stringify((await seen(page)).phase)}`);
}

/** Locks in both players' orders unchanged, lets the ships move, and starts the fire phase. */
export async function playToFirePhase(page: Page): Promise<void> {
  await playUntil(page, (state) => state.phase.kind === 'firing');
  // The fire phase opens with its own popups (initiative, who fires first).
  await page.waitForTimeout(500);
  while (await dismissPopup(page)) {
    await page.waitForTimeout(400);
  }
}

/** Clicks a ship on the map, or taps it on a touch screen, where the game draws it. */
export async function pressShip(page: Page, shipId: string): Promise<void> {
  const point = await page.evaluate(
    (id) =>
      (window as unknown as { game: { shipScreenPoint(id: string): { x: number; y: number } | null } }).game.shipScreenPoint(id),
    shipId,
  );
  if (point === null) {
    throw new Error(`${shipId} is not on the map`);
  }
  if (await isTouch(page)) {
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await page.mouse.click(point.x, point.y);
  }
}

/**
 * Opens the targeting view for one of the firing player's ships, by pressing
 * it and then an enemy it can fire at, as a player would. Returns false if no
 * ship of theirs can fire at anything.
 */
export async function startTargeting(page: Page): Promise<boolean> {
  const state = await seen(page);
  const playerId = state.phase.playerId;
  const own = state.phase.activeShipId
    ? [state.phase.activeShipId]
    : state.ships.filter((s) => s.playerId === playerId).map((s) => s.id);
  const enemies = state.ships.filter((ship) => ship.playerId !== playerId).map((ship) => ship.id);
  for (const shooter of own) {
    for (const target of enemies) {
      await pressShip(page, shooter);
      await pressShip(page, target);
      if (await page.locator('#orders .targeting').isVisible()) {
        return true;
      }
    }
  }
  return false;
}

/** Presses Fire! and waits for the dice and damage to finish, when the main button is usable again. */
export async function fireVolley(page: Page): Promise<void> {
  await page.locator('.fire-button').click();
  await expect(mainButton(page)).toBeEnabled({ timeout: 30_000 });
}
