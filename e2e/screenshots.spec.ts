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
  /**
   * A tool, not an assertion suite: it walks the whole wizard to write PNGs for a review. That makes
   * it the slowest and most fragile file here, and a flake in it says nothing about the product while
   * failing the suite. So it is skipped unless asked for:
   *
   *     BTM_CAPTURES=1 npx playwright test e2e/screenshots.spec.ts --workers=1
   */
  test.skip(!process.env['BTM_CAPTURES'], 'set BTM_CAPTURES=1 to write the review captures');
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

  // The reflector filter lists the reflectors of the chosen template — here the UK circular prism,
  // L-bar, micro prism, 360 mini and reflectorless — not three abstract families.
  await page.getByRole('combobox', { name: /Réflecteur|Reflector/ }).click();
  await expect(page.getByRole('option').first()).toBeVisible();
  // The menu fades in: `toBeVisible` is true half-way through, and the shot caught it translucent.
  await page.waitForTimeout(400);
  await page.screenshot({ path: '../screenshots/15-filtre-reflecteurs.png' });
  await page.keyboard.press('Escape');

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
  // The compute button stays disabled until the cycle catalogue has arrived and the window has been
  // snapped onto two real epochs. Flipping the mode before that races the normalisation, whose ref
  // guard then refuses to run twice — the button never enables and the capture times out. Waiting
  // for it to be enabled once, here, is what the journey spec does.
  await expect(page.getByTestId('compute-initialisation')).toBeEnabled({ timeout: 60_000 });
  // `check()` asserts the state flips on the spot, and this radio only flips once the draft has been
  // persisted; under a loaded parallel run that round trip is slower than the assertion. Clicking and
  // then waiting for what the mode actually produces — the reference chips — tests the same thing
  // without racing the write.
  await page.getByRole('radio', { name: /Compute from the known reference coordinates|Calculer depuis/ }).click();
  // A chip is not removed once used: it turns green and stops responding. So the loop has to walk the
  // list — clicking the first one three times adds a single reference and leaves the resection short.
  const referenceChips = page.getByTestId(/^add-reference-/);
  await expect(referenceChips.first()).toBeVisible({ timeout: 30_000 });
  for (let index = 0; index < 3; index += 1) await referenceChips.nth(index).click();
  await expect(page.getByTestId('compute-initialisation')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('compute-initialisation').click();
  await page.getByTestId('use-as-initial').click();

  await page.getByRole('button', { name: /Adjustment|Compensation/ }).click();
  await expect(page.getByTestId('datum-summary-table')).toBeVisible();
  await page.screenshot({ path: '../screenshots/05-ajustement-referentiel-et-sigmas.png', fullPage: true });

  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByTestId('trial-row-1')).toBeVisible({ timeout: 180_000 });
  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByTestId('trial-row-2')).toBeVisible({ timeout: 180_000 });
  await page.screenshot({ path: '../screenshots/06-ajustement-essais-compares.png', fullPage: true });

  // Single station: the two network-only rules must be absent, and the timeline still explains
  // fresh/reused/missing for the one station that exists.
  await page.getByRole('button', { name: /^(Run|Exécution)/ }).click();
  await expect(page.getByText(/What a run would do with your data/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: '../screenshots/07-run-station-seule.png', fullPage: true });

  await page.getByRole('button', { name: /^(Output|Publication)/ }).click();
  await page.screenshot({ path: '../screenshots/08-output.png', fullPage: true });
});

/**
 * The Run step in network scope: the timeline carries one lane per station, and the two rules that
 * only mean something for a network — the indispensable-station list and "compute without the
 * optional stations" — appear here and nowhere else.
 */
test('captures: run réseau, règles réservées au réseau', async ({ page }) => {
  test.skip(!process.env['BTM_CAPTURES'], 'set BTM_CAPTURES=1 to write the review captures');
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'French' }).click();

  /**
   * The country templates, which are now data the user owns: shipped ones read-only, a duplicate
   * editable. Captured before entering the wizard, because the wizard's template selector reads
   * this very list.
   */
  await page.getByRole('button', { name: /Templates pays|Country templates/ }).click();
  await page.getByTestId('view-template-fr-starnet-monitoring').click();
  const values = page.getByTestId('template-values-fr-starnet-monitoring');
  await expect(values).toBeVisible();
  // The Collapse animates: `toBeVisible` is true half-way through it, and the capture caught the
  // block clipped mid-height. Waiting for the last row settles the height before the shot.
  await expect(values.getByText(/Provenance/).first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '../screenshots/13-templates-pays.png', fullPage: true });

  /**
   * The editor of a duplicated template: one reflector catalogue where a prism, a sheet and a mini
   * prism are the same row with a different constant, and an instrument list that can grow.
   */
  await page.getByTestId('duplicate-template-fr-starnet-monitoring').click();
  await page.getByTestId('new-template-label').fill('FR — pont de captures');
  await page.getByTestId('confirm-duplicate-template').click();
  await page.getByTestId('edit-template-fr-pont-de-captures').click();
  await page.getByTestId('add-reflector').click();
  await page.getByTestId('reflector-label-3').fill('360 mini — +30 mm');
  await expect(page.getByTestId('save-template')).toBeEnabled();
  await page.screenshot({ path: '../screenshots/14-template-editeur.png', fullPage: true });
  await page.getByRole('button', { name: /Annuler|Cancel/ }).click();

  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);
  await page.getByTestId('processing-name').fill('Captures — règles du run en réseau');
  await page.getByRole('radio', { name: 'Network (connected)' }).click();

  await page.getByRole('button', { name: 'Stations' }).click();
  for (const station of ['SYN_A', 'SYN_B', 'SYN_C']) {
    await page.getByLabel(`Select ${station}`).click();
    await expect(page.getByLabel(`Select ${station}`)).toBeChecked();
  }

  await page.getByRole('button', { name: /^(Run|Exécution)/ }).click();
  await expect(page.getByTestId('station-required-SYN_A')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: '../screenshots/09-run-reseau.png', fullPage: true });

  /**
   * Every worked example open at once, so the reviewer reads the explanations without clicking.
   *
   * The locator is re-queried on each pass instead of collecting handles up front: opening one
   * example re-renders the group, which detaches every handle taken before the first click and
   * makes the next one time out. And an opened toggle renames itself to "Example ▴", so the
   * "▾" query shrinks by one each time and the loop ends on its own.
   */
  for (let guard = 0; guard < 20; guard += 1) {
    const next = page.getByRole('button', { name: 'Example ▾' }).first();
    if (await next.count() === 0) break;
    await next.click();
  }
  await page.screenshot({ path: '../screenshots/10-run-reseau-exemples.png', fullPage: true });

  await page.getByRole('button', { name: 'Instruments' }).click();
  await expect(page.getByText(/Formule atmosphérique|Atmospheric formula/).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: '../screenshots/11-instruments-formule.png', fullPage: true });

  /**
   * The fixed-atmosphere path, which no capture used to exercise. Choosing the mode must *write*
   * 12 °C and 1013.25 hPa, not merely display them: the proof on the image is that the formula block
   * switches from "reference atmosphere" to this station's own fixed values, since it substitutes
   * what the policy actually holds.
   */
  const atmosphere = page.getByRole('combobox', { name: /Correction atmosphérique|Atmospheric correction/ }).first();
  await atmosphere.click();
  await page.getByRole('option', { name: /température et pression fixes|Fixed temperature/ }).click();
  await expect(page.getByLabel(/Température fixe|Fixed temperature/).first()).toHaveValue('12');
  await expect(page.getByLabel(/Pression fixe|Fixed pressure/).first()).toHaveValue('1013.25');
  await page.screenshot({ path: '../screenshots/12-instruments-tp-fixes.png', fullPage: true });
});
