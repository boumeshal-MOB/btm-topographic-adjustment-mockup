import { test, expect } from '@playwright/test';

/**
 * Proof captures for the review, in French — the language this refactor was specified in.
 *
 * Not an assertion suite: it walks the two rebuilt screens and writes a full-page image of each.
 * Run it with `npx playwright test e2e/screenshots.spec.ts` when a visual change needs a picture
 * attached to a pull request. The images are written *outside* the repository, so a review never
 * carries a megabyte of PNG through git history.
 */
test('captures: instruments, cibles et mesures, ajustement', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  // The toggle is pinned to en-US by the config, so its accessible name is the English word.
  await page.getByRole('button', { name: 'French' }).click();

  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);
  await page.getByTestId('processing-name').fill('Captures — refonte cibles et mesures');
  await page.getByRole('button', { name: 'Stations' }).click();
  await page.getByLabel(/NTE_ATS34/).click();

  await page.getByRole('button', { name: 'Instruments' }).click();
  await expect(page.getByTestId('precision-source-NTE_ATS34')).toBeVisible();
  await page.screenshot({ path: '../screenshots/01-instruments.png', fullPage: true });

  await page.getByRole('button', { name: /Targets|Cibles/ }).click();
  const group = page.getByTestId('station-group-NTE_ATS34');
  await expect(group).toBeVisible();
  await page.screenshot({ path: '../screenshots/02-cibles-tableau.png', fullPage: true });

  // The selection bar and the bulk editor, the gesture that makes a hundred prisms workable.
  await page.getByTestId('select-all-visible').click();
  await expect(page.getByTestId('target-bulk-bar')).toBeVisible();
  await page.getByTestId('open-bulk-editor').click();
  await page.screenshot({ path: '../screenshots/03-cibles-edition-en-lot.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Clear selection|Tout désélectionner/ }).click();

  // The inspector: one sight in full, including its E/N/H constraints.
  await group.getByTestId(/^target-row-/).first().click();
  await expect(page.getByTestId('target-inspector')).toBeVisible();
  await page.screenshot({ path: '../screenshots/04-cibles-panneau-visee.png', fullPage: true });

  await page.getByRole('button', { name: /Initialisation/ }).click();
  await page.getByRole('radio', { name: /Compute from the known reference coordinates|Calculer depuis/ }).check();
  const referenceChips = page.getByTestId(/^add-reference-/);
  await expect(referenceChips.first()).toBeVisible();
  for (let index = 0; index < 3; index += 1) await referenceChips.nth(index).click();
  await page.getByTestId('compute-initialisation').click();
  await page.getByTestId('use-as-initial').click();

  await page.getByRole('button', { name: /Adjustment|Ajustement/ }).click();
  await expect(page.getByTestId('datum-summary-table')).toBeVisible();
  await page.screenshot({ path: '../screenshots/05-ajustement-referentiel-et-sigmas.png', fullPage: true });

  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByTestId('trial-row-1')).toBeVisible({ timeout: 180_000 });
  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByTestId('trial-row-2')).toBeVisible({ timeout: 180_000 });
  await page.screenshot({ path: '../screenshots/06-ajustement-essais-compares.png', fullPage: true });
});
