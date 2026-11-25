import { expect, test } from '@playwright/test';
import { mainButton, playToFirePhase, startScenario, startTargeting } from './helpers';

test('the toolbar button closes the targeting view, and is greyed out only while the dice roll', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  await playToFirePhase(page);
  expect(await startTargeting(page)).toBe(true);

  // Before a volley: it cancels targeting.
  await expect(mainButton(page)).toHaveText('Cancel targeting');
  await expect(mainButton(page)).toBeEnabled();

  // While the dice roll: greyed out.
  await page.locator('.fire-button').click();
  await expect(mainButton(page)).toBeDisabled();
  await expect(mainButton(page)).toHaveText('Continue');

  // Once they've landed: Continue, which closes the view.
  await expect(mainButton(page)).toBeEnabled({ timeout: 30_000 });
  await mainButton(page).click();
  await expect(page.locator('#orders .targeting')).toHaveCount(0);
  await expect(page.locator('#target-side')).toBeHidden();
});

test('Cancel targeting closes the view without firing', async ({ page }) => {
  await startScenario(page, 'Introductory Scenario');
  await playToFirePhase(page);
  expect(await startTargeting(page)).toBe(true);
  await mainButton(page).click();
  await expect(page.locator('#orders .targeting')).toHaveCount(0);
  // Nothing was fired, so the go is still open: the button passes it.
  await expect(mainButton(page)).toHaveText('Pass');
});
