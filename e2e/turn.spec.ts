import { expect, test } from '@playwright/test';
import { dismissPopup, fireVolley, mainButton, playToFirePhase, seen, startScenario, startTargeting } from './helpers';

test('a whole turn: plot, move, fire everything, end the turn', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  await playToFirePhase(page);

  // Each go: fire a ship if one can, closing the targeting view with the
  // toolbar button; otherwise pass (or finish the ship part-way through).
  let volleys = 0;
  for (let go = 0; go < 30 && (await seen(page)).phase.kind === 'firing'; go++) {
    if (await dismissPopup(page)) {
      await page.waitForTimeout(400);
      continue;
    }
    if (await startTargeting(page)) {
      await fireVolley(page);
      volleys++;
      await expect(mainButton(page)).toHaveText('Continue');
      await mainButton(page).click();
    } else {
      await mainButton(page).click();
      // Pass and Finish ask first; the confirm button is the primary one.
      await page.waitForTimeout(300);
      await dismissPopup(page);
    }
    await page.waitForTimeout(500);
  }

  expect(volleys).toBeGreaterThan(0);
  expect((await seen(page)).phase.kind).toBe('fireComplete');
  await expect(page.locator('dialog[open] .dialog-title')).toHaveText('Weapons fire complete');
  await dismissPopup(page);

  await expect(mainButton(page)).toHaveText('End turn');
  await expect(mainButton(page)).toBeEnabled();
  await mainButton(page).click();
  await dismissPopup(page);

  await expect(page.locator('#turn-status')).toHaveText('Turn 2 · Order plotting · Player One');
});
