import { test, expect } from '@playwright/test';

/**
 * End-to-end journeys over the built bundle (MSW is the backend, demo/40 §1).
 * Four tests cover the four user-facing surfaces: administration (list → detail → run →
 * versions → outputs → reprocess), the UK creation wizard happy path, the Analysis Lab,
 * and the network shared-point confirmation flow (POINT-011).
 */

test.use({ timezoneId: 'UTC' });

test('administration: seeded processing, run detail, versions, outputs, reprocessing', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');

  // list shows the seeded UK processing with a working open action
  const open = page.getByTestId(/open-processing-/).first();
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.click();
  await expect(page.getByRole('heading', { name: /NTE ATS34/ })).toBeVisible();

  // overview: the seed ran the last two slots
  const runRows = page.locator('table[aria-label="Runs"] tbody tr');
  await expect(runRows).toHaveCount(2);

  // run detail: diagnostic, χ² badge, .dat preview with the output slot
  await page.getByTestId(/open-run-/).first().click();
  await expect(page.getByRole('heading', { name: /Run run-/ })).toBeVisible();
  await expect(page.getByText(/χ²/).first()).toBeVisible();
  await page.getByRole('button', { name: '.dat preview' }).click();
  await expect(page.locator('pre')).toContainText('Output slot');
  // MUI Button with component=RouterLink renders an <a>: role is link, not button
  await page.getByRole('link', { name: 'Back to processing' }).click();

  // versions: v1 active and immutable (used by runs)
  await page.getByRole('tab', { name: /Configuration versions/ }).click();
  await expect(page.getByText('immutable', { exact: true })).toBeVisible();

  // outputs: stable variables with series
  await page.getByRole('tab', { name: /Output variables/ }).click();
  await expect(page.getByText('variance-factor').first()).toBeVisible();
  await expect(page.getByText(/Per-target variables/)).toBeVisible();

  // reprocessing: preview a narrow window around the seeded runs, then execute with a reason
  const processingId = Number(page.url().match(/topographic-adjustment\/(\d+)/)?.[1]);
  const slots = await page.evaluate(
    (id) => fetch(`/api/v2/topographic-adjustments/${id}/slots`).then((r) => r.json() as Promise<string[]>),
    processingId,
  );
  const windowSlots = slots.slice(-2);
  await page.getByRole('tab', { name: 'Reprocessing' }).click();
  await page.getByLabel('From').fill(windowSlots[0].slice(0, 16));
  await page.getByRole('textbox', { name: 'To', exact: true }).fill(windowSlots[1].slice(0, 16));
  await page.getByTestId('reprocess-preview').click();
  await expect(page.getByText(/slot\(s\) in window/)).toBeVisible();
  await expect(page.getByText(/existing measure\(s\) to replace/)).toBeVisible();
  await page.getByTestId('reprocess-reason').locator('input').fill('E2E replay after late data');
  await page.getByTestId('reprocess-execute').click();
  await expect(page.getByText(/slot\(s\) reprocessed/)).toBeVisible({ timeout: 60_000 });
});

test('administration: edit an existing processing and save a new configuration version', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByTestId(/edit-processing-/).first().click();
  await page.waitForURL(/\/create\//);
  await expect(page.getByRole('heading', { name: /Edit NTE ATS34/ })).toBeVisible();
  await expect(page.getByText(/history stays unchanged/)).toBeVisible();
  await page.getByTestId('processing-name').fill('NTE ATS34 — edited demo');
  await page.getByRole('button', { name: 'Review & Create' }).click();
  await expect(page.getByRole('heading', { name: 'Review & Save' })).toBeVisible();
  await page.getByTestId('create-inactive').click();
  await page.waitForURL(/processing\/topographic-adjustment\/\d+$/);
  await expect(page.getByRole('heading', { name: 'NTE ATS34 — edited demo' })).toBeVisible();
  await page.getByRole('tab', { name: /Configuration versions \(2\)/ }).click();
  await expect(page.getByText('v2', { exact: true })).toBeVisible();
});

test('UK wizard: nine steps, test epoch, create and activate, then run a slot', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);

  // 1. General
  await page.getByTestId('processing-name').fill('E2E UK single station');
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. Stations — single-station: exactly one. The checkbox is controlled and only flips
  // after the draft round-trip, so click + assert instead of check().
  await page.getByLabel('Select NTE_ATS34').click();
  await expect(page.getByLabel('Select NTE_ATS34')).toBeChecked();
  await expect(page.getByText(/station\(s\) selected/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 3. Instruments (defaults) → 4. Targets (defaults)
  await expect(page.getByRole('heading', { name: 'Instruments' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Targets & Measurements' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 5. Initialisation — local anchor 0/0/0/0 (INIT-002), compute medians, accept
  await page.getByTestId('compute-initialisation').click();
  await page.getByTestId('use-as-initial').click();
  await expect(page.getByText('Initial coordinates accepted')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 6. Adjustment — test one epoch unlocks activation
  await page.getByRole('combobox', { name: 'Output slot' }).click();
  await page.getByRole('option').last().click();
  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByText('Test epoch passed — activation unlocked')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Next' }).click();

  // 7. Run → 8. Output → 9. Review & Create
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Review & Create' })).toBeVisible();
  await page.getByTestId('create-activate').click();

  // atomic creation lands on the processing detail; run one slot manually
  await page.waitForURL(/processing\/topographic-adjustment\/\d+$/);
  await expect(page.getByRole('heading', { name: 'E2E UK single station' })).toBeVisible();
  await page.getByTestId('run-now').click();
  await expect(page.locator('table[aria-label="Runs"] tbody tr')).toHaveCount(1, { timeout: 120_000 });
});

test('Analysis Lab: baseline, inflated-weights trial raises an alert, save candidate version', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByTestId(/open-processing-/).first().click();
  await page.getByTestId('open-analysis-lab').click();

  await page.getByRole('combobox', { name: 'Version' }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('combobox', { name: 'Epoch / output slot' }).click();
  await page.getByRole('option').last().click();
  await page.getByTestId('load-baseline').click();
  await expect(page.getByText('Trial 0 (baseline — immutable)')).toBeVisible({ timeout: 120_000 });

  // inflate sigmas ×2 → anti-manipulation alert (ADJ-009), never silently accepted
  await page.getByLabel('Weight multiplier (×)').fill('2');
  await page.getByTestId('run-trial').click();
  await expect(page.getByText('Trial 1')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Sigmas inflated ×2/)).toBeVisible();

  // saving requires a justification and creates a NEW draft version (VER-002)
  await page.getByTestId('candidate-reason').locator('input').fill('E2E candidate from inflated-weights trial');
  await page.getByTestId('save-candidate').click();
  await expect(page.getByText(/Saved as draft version/)).toBeVisible();
});

test('network wizard: geometry check with 2 seeds is weak, confirmation connects the pair (POINT-011)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);

  // scope is chosen in wizard step 1 (single source of truth)
  await page.getByTestId('processing-name').fill('E2E synthetic network');
  await page.getByRole('radio', { name: 'Network (connected)' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // sequential selection: each toggle recomputes from the saved draft, so wait for each
  // round-trip before the next click (controlled checkboxes)
  await page.getByLabel('Select SYN_A').click();
  await expect(page.getByLabel('Select SYN_A')).toBeChecked();
  await page.getByLabel('Select SYN_B').click();
  await expect(page.getByLabel('Select SYN_B')).toBeChecked();
  await page.getByLabel('Select SYN_C').click();
  await expect(page.getByLabel('Select SYN_C')).toBeChecked();
  await page.getByLabel('Select SYN_D').click();
  await expect(page.getByLabel('Select SYN_D')).toBeChecked();
  await expect(page.getByText('4 station(s) selected', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Targets: shared points are never automatic — seed two pairs, check, confirm manually
  await expect(page.getByText('Common physical points (network)')).toBeVisible();
  await page.getByText('seed 1 · A…').click();
  await page.getByRole('option', { name: 'P_201' }).click();
  await page.getByText('B…', { exact: true }).first().click();
  await page.getByRole('option', { name: 'MB_11' }).click();
  await page.getByText('seed 2 · A…').click();
  await page.getByRole('option', { name: 'P_202' }).click();
  await page.getByText('B…', { exact: true }).first().click();
  await page.getByRole('option', { name: 'MB_12' }).click();
  await page.getByRole('button', { name: 'Check common points' }).click();
  await expect(page.getByText('Weak geometry —')).toBeVisible({ timeout: 60_000 });

  // candidates are proposed unchecked (POINT-011); confirm three of them
  const candidateBoxes = page.getByRole('checkbox', { name: /Confirm .*\|/ });
  const count = await candidateBoxes.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < 3; i += 1) await candidateBoxes.nth(i).check();
  await page.getByRole('button', { name: /Confirm 3 selected pair/ }).click();
  await expect(page.getByText('SP_1')).toBeVisible();
  await expect(page.getByText('SYN_A↔SYN_B (3 shared):')).toBeVisible();
});
