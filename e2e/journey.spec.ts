import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

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

  const open = page.getByTestId(/open-processing-/).first();
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.click();
  await expect(page.getByRole('heading', { name: /NTE ATS34/ })).toBeVisible();

  const runRows = page.locator('table[aria-label="Runs"] tbody tr');
  await expect(runRows).toHaveCount(2);

  await page.getByTestId(/open-run-/).first().click();
  await expect(page.getByRole('heading', { name: /Run run-/ })).toBeVisible();
  await expect(page.getByText(/χ²/).first()).toBeVisible();
  await page.getByRole('button', { name: '.dat preview' }).click();
  await expect(page.locator('pre')).toContainText('Output slot');
  await expect(page.getByText('Run with STAR*NET 14')).toBeVisible();
  await page.getByRole('button', { name: 'File fallback' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-starnet-job').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.btmjob\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const vmJob = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
    jobId: string;
    runId: string;
    processingId: number;
    files: { projectFileName: string; project: string; data: string };
  };
  expect(vmJob.files.project).toContain('*STAR*NET 2');
  expect(vmJob.files.projectFileName).toBe('project.prj');
  expect(vmJob.files.project).toContain('3 "input.dat"');
  expect(vmJob.files.data).toContain('DB  NTE_ATS34');

  const nativeListing = [
    'Solution Has Converged in 3 Iterations',
    'Chi-Square Test at 5.00% Level Passed',
    'Network Processing Completed',
    'Elapsed Time = 00:00:02',
  ].join('\n');
  await page.locator('input[type="file"]').setInputFiles({
    name: `${vmJob.jobId}.btmresult.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      kind: 'btm-starnet-result',
      schemaVersion: 1,
      jobId: vmJob.jobId,
      processingId: vmJob.processingId,
      runId: vmJob.runId,
      status: 'succeeded',
      exitCode: 0,
      startedAt: '2026-07-25T20:00:00.000Z',
      finishedAt: '2026-07-25T20:00:02.000Z',
      starNet: { executableName: 'StarNet.exe', fileVersion: '14.0.2.9137', noGraphics: true, mode: 'run' },
      console: { stdout: nativeListing, stderr: '' },
      outputFiles: [{ name: 'project.lst', extension: '.lst', sizeBytes: nativeListing.length, content: nativeListing }],
    })),
  });
  await expect(page.getByText('STAR*NET succeeded')).toBeVisible();
  await expect(page.getByLabel('STAR*NET native output')).toContainText('Network Processing Completed');
  await page.getByRole('link', { name: 'Back to processing' }).click();

  await page.getByRole('tab', { name: /Configuration versions/ }).click();
  await expect(page.getByText('immutable', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Output variables/ }).click();
  await expect(page.getByText('variance-factor').first()).toBeVisible();
  await expect(page.getByText(/Per-target variables/)).toBeVisible();

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

test('inactive processing: explains missing slots and reopens a clean editable configuration', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);

  await page.getByTestId('processing-name').fill('E2E inactive processing');
  await page.getByRole('button', { name: 'Stations' }).click();
  await page.getByLabel('Select NTE_ATS34').click();
  await expect(page.getByLabel('Select NTE_ATS34')).toBeChecked();

  await page.getByRole('button', { name: 'Initialisation' }).click();
  await page.getByTestId('compute-initialisation').click();
  await page.getByTestId('use-as-initial').click();
  await expect(page.getByText('Initial coordinates accepted')).toBeVisible();

  await page.getByRole('button', { name: 'Review & Create' }).click();
  await page.getByTestId('create-inactive').click();
  await page.waitForURL(/processing\/topographic-adjustment\/\d+$/);
  await expect(page.getByTestId('no-active-config')).toContainText('No active configuration');

  await page.getByTestId('edit-processing').click();
  await page.waitForURL(/\/create\/draft-/);
  await expect(page.getByRole('heading', { name: /Edit E2E inactive processing/ })).toBeVisible();

  await page.getByRole('button', { name: 'Adjustment' }).click();
  await expect(page.getByRole('heading', { name: /Adjustment/ })).toBeVisible();
  await expect(page.getByTestId('run-test-epoch')).toBeEnabled();
  await expect(page.getByText('No output slot is available.')).not.toBeVisible();
});

test('UK wizard: nine steps, test epoch, create and activate, then run a slot', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);

  await page.getByTestId('processing-name').fill('E2E UK single station');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByLabel('Select NTE_ATS35')).toBeVisible();
  await page.getByLabel('Select NTE_ATS34').click();
  await expect(page.getByLabel('Select NTE_ATS34')).toBeChecked();
  await expect(page.getByText(/station\(s\) selected/)).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Instruments' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Targets & measurement setup' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Target measurement setup' })).toBeVisible();
  await expect(page.getByText('Target & source', { exact: true })).toBeVisible();
  await expect(page.getByText('Prism correction · mm', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Search target or BTM ID')).toBeVisible();
  await expect(page.getByText('Targets per page', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByTestId('compute-initialisation')).toBeEnabled();
  await page.getByTestId('compute-initialisation').click();
  await page.getByTestId('use-as-initial').click();
  await expect(page.getByText('Initial coordinates accepted')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByTestId('run-test-epoch')).toBeEnabled();
  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByText('Preparation test passed — activation unlocked')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Test this adjustment with real STAR*NET 14')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Launch mode' })).toContainText(
    'Standard CLI · Typical install',
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review & Create' })).toBeVisible();
  await page.getByTestId('create-activate').click();

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

  await page.getByLabel('Weight multiplier (×)').fill('2');
  await page.getByTestId('run-trial').click();
  await expect(page.getByText('Trial 1')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Sigmas inflated ×2/)).toBeVisible();

  await page.getByTestId('candidate-reason').locator('input').fill('E2E candidate from inflated-weights trial');
  await page.getByTestId('save-candidate').click();
  await expect(page.getByText(/Saved as draft version/)).toBeVisible();
});

test('network wizard: user matches seeds, confirms proposals and inspects the initial network', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('new-processing').click();
  await page.waitForURL(/\/create\//);

  await page.getByTestId('processing-name').fill('E2E synthetic network');
  await page.getByRole('radio', { name: 'Network (connected)' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Select SYN_A').click();
  await expect(page.getByLabel('Select SYN_A')).toBeChecked();
  await page.getByLabel('Select SYN_B').click();
  await expect(page.getByLabel('Select SYN_B')).toBeChecked();
  await page.getByLabel('Select SYN_C').click();
  await expect(page.getByLabel('Select SYN_C')).toBeChecked();
  await expect(page.getByText('3 station(s) selected', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Common physical points (network)')).toBeVisible();
  const stationAPoints = page.getByRole('combobox', { name: 'SYN_A point' });
  const stationBPoints = page.getByRole('combobox', { name: 'SYN_B equivalent' });
  await stationAPoints.nth(0).click();
  await page.getByRole('option', { name: 'P_201' }).click();
  await stationBPoints.nth(0).click();
  await page.getByRole('option', { name: 'MB_11' }).click();
  await stationAPoints.nth(1).click();
  await page.getByRole('option', { name: 'P_202' }).click();
  await stationBPoints.nth(1).click();
  await page.getByRole('option', { name: 'MB_12' }).click();
  await page.getByRole('button', { name: 'Analyse and propose matches' }).click();
  await expect(page.getByText(/Weak geometry/)).toBeVisible({ timeout: 60_000 });

  const candidateBoxes = page.getByRole('checkbox', { name: /Confirm .* with .*/ });
  const count = await candidateBoxes.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < 3; index += 1) await candidateBoxes.nth(index).check();
  await page.getByRole('button', { name: /Confirm 3 selected pair/ }).click();
  await expect(page.getByText('SP_1')).toBeVisible();
  await expect(page.getByText('SYN_A↔SYN_B (3 shared)')).toBeVisible();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Initialisation' })).toBeVisible();
  await expect(page.getByText(/reference cycle calendar/)).toBeVisible();
  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByTestId('compute-initialisation')).toBeEnabled();
  await page.getByTestId('compute-initialisation').click();
  await expect(page.getByTestId('initial-network-view')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Zoom in network' }).click();
  await expect(page.getByText('120%')).toBeVisible();
});
