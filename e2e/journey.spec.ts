import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

/**
 * End-to-end journeys over the built bundle (MSW is the backend, VALIDATION-DATASETS.md §1).
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
  await page.getByRole('button', { name: 'Native files (.dat / .prj)' }).click();
  const nativeFiles = page.getByTestId('run-native-files');
  await expect(nativeFiles.getByLabel('input.dat')).toContainText('Output slot');
  await nativeFiles.getByRole('button', { name: 'project.prj' }).click();
  await expect(nativeFiles.getByLabel('project.prj')).toContainText('input.dat');
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
  const nativeOutput = page.getByTestId('starnet-output-files');
  await expect(nativeOutput.getByLabel('project.lst')).toContainText('Network Processing Completed');
  // The captured console is readable next to the listing, for a run that returns no usable file.
  await nativeOutput.getByRole('button', { name: 'console-stdout.txt' }).click();
  await expect(nativeOutput.getByLabel('console-stdout.txt')).toContainText('Network Processing Completed');
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
  await expect(page.getByTestId('use-as-initial')).toBeDisabled();

  await page.getByRole('button', { name: 'Review & Create' }).click();
  await page.getByTestId('create-inactive').click();
  await page.waitForURL(/processing\/topographic-adjustment\/\d+$/);
  await expect(page.getByTestId('no-active-config')).toContainText('No active configuration');

  await page.getByTestId('edit-processing').click();
  await page.waitForURL(/\/create\/draft-/);
  await expect(page.getByRole('heading', { name: /Edit E2E inactive processing/ })).toBeVisible();

  await page.getByRole('button', { name: 'Adjustment' }).click();
  await expect(page.getByRole('heading', { name: /Adjustment/ })).toBeVisible();
  // The datum is decided on the prisms, in Targets & Measurements; this screen states the verdict
  // and points back at the screen that owns it.
  await expect(page.getByTestId('edit-datum-in-targets')).toBeVisible();
  // This draft was initialised from a local anchor and knows no reference coordinate: the network
  // cannot be held by the approximations it just computed, so nothing holds it.
  await expect(page.getByTestId('nothing-held')).toBeVisible();
  await expect(page.getByTestId('datum-summary-table')).toHaveCount(0);
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
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
  // Sights are grouped per station, like the blocks of the native file, reference points first.
  const stationGroup = page.getByTestId('station-group-NTE_ATS34');
  await expect(stationGroup).toBeVisible();
  await expect(stationGroup.getByRole('table', { name: 'Measurement setup — station NTE_ATS34' })).toBeVisible();
  await expect(stationGroup.getByText('Reference point', { exact: false }).first()).toBeVisible();
  // The station header states what weights its sights, so the σ columns below are never anonymous.
  await expect(stationGroup).toContainText('1.00 mm + 1.0 ppm');
  await expect(page.getByLabel('Search target or BTM ID')).toBeVisible();
  // The EDM program is not offered, and a row no longer mounts a form control per value.
  await expect(page.getByText('Precise · prism')).toHaveCount(0);
  await expect(stationGroup.getByRole('combobox')).toHaveCount(0);

  // A hundred prisms are configured by selection, not row by row: the bulk bar appears as soon as
  // something is selected, and says how many rows the next gesture will write.
  await page.getByTestId('select-all-visible').click();
  await expect(page.getByTestId('target-bulk-bar')).toBeVisible();
  await page.getByTestId('open-bulk-editor').click();
  await page.getByTestId('bulk-reflector').click();
  await page.getByRole('option', { name: /L-bar/ }).click();
  await page.getByTestId('apply-bulk-edit').click();
  // Choosing the reflector is what sets its constant: BTM now has 8.9 mm to apply.
  await expect(stationGroup.getByText('BTM +8.9').first()).toBeVisible();
  await page.getByTestId('open-bulk-editor').click();
  await page.getByTestId('bulk-reflector').click();
  await page.getByRole('option', { name: /Circular Prism/ }).click();
  await page.getByTestId('apply-bulk-edit').click();
  await expect(stationGroup.getByText('BTM +8.9')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear selection' }).click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByTestId('compute-initialisation')).toBeEnabled();
  // Next stays locked until the approximate coordinates are explicitly accepted, and the button
  // that accepts them sits right next to it.
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
  // The approximations are computed *from* the known reference coordinates — the same references
  // that will hold the network during the adjustment. At least two are required, three make the
  // resection redundant.
  await page.getByRole('radio', { name: /Compute from the known reference coordinates/ }).check();
  const referenceChips = page.getByTestId(/^add-reference-/);
  await expect(referenceChips.first()).toBeVisible();
  for (let index = 0; index < 3; index += 1) await referenceChips.nth(index).click();
  await page.getByTestId('compute-initialisation').click();
  await page.getByTestId('use-as-initial').click();
  await expect(page.getByTestId('use-as-initial')).toBeDisabled();
  await expect(page.getByTestId('wizard-next')).toBeEnabled();
  await page.getByTestId('wizard-next').click();

  // The network is held by the three known references, and by nothing else: one click frees the
  // stations and leaves the weights on the coordinates that are actually known.
  await expect(page.getByTestId('datum-summary-table')).toBeVisible();
  await expect(page.getByText('3 known reference(s) held / 2 minimum')).toBeVisible();
  await expect(page.getByTestId('not-enough-references')).toHaveCount(0);
  await expect(page.getByTestId('wizard-next')).toBeEnabled();
  // The standard errors are in the open here, on the same draft the Instruments step edits.
  await expect(page.getByTestId('adjustment-precision-NTE_ATS34')).toBeVisible();

  await expect(page.getByTestId('run-test-epoch')).toBeEnabled();
  await page.getByTestId('run-test-epoch').click();
  await expect(page.getByText('Preparation test passed — activation unlocked')).toBeVisible({ timeout: 120_000 });
  // The same engine choice as the Analysis Lab bench, and the generated files next to it.
  await expect(page.getByRole('combobox', { name: 'Engine' })).toContainText('Fast scientific preview');
  await expect(page.getByTestId('wizard-native-files')).toBeVisible();
  // Every trial is kept with the configuration that produced it, so two runs can be compared.
  await expect(page.getByTestId('trial-row-1')).toBeVisible();
  await page.getByTestId('wizard-next').click();

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
  await page.getByTestId(/open-analysis-lab-/).first().click();
  await page.waitForURL(/processing\/topographic-adjustment\/\d+\/analysis$/);

  await expect(page.getByTestId('load-baseline')).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId('load-baseline').click();
  await expect(page.getByTestId('run-recap')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('img', { name: 'Network map with stations, points and error ellipses' })).toBeVisible();

  // The coordinate table is collapsed by default; open it to work with the numbers.
  await page.getByTestId('toggle-points-table').locator('input').check();
  await expect(page.getByRole('table', { name: 'Analysis point results' })).toBeVisible();

  // Selecting a point in the table drives the shared inspector and scopes the observation list.
  const firstPointRow = page.locator('[data-testid^="point-row-"]').first();
  const engineName = (await firstPointRow.getAttribute('data-testid'))!.replace('point-row-', '');
  await firstPointRow.click();
  await expect(page.getByTestId('analysis-inspector')).toContainText(engineName);
  await expect(page.getByText(`Observations for ${engineName}`)).toBeVisible();

  // Weighting is an advanced control: the essential journey never needs it, so it lives behind a
  // collapsed section rather than an expert mode.
  await page.getByRole('button', { name: /Advanced: engine, weighting and STAR\*NET/ }).click();
  await page.getByLabel('Global sigma multiplier').fill('2');
  // Any change invalidates the displayed result until it is recalculated.
  await expect(page.getByTestId('stale-trial')).toBeVisible();
  // The bench shows the before → after summary, takes the trial name and runs it, all in one
  // block below the observations.
  const bench = page.getByTestId('run-bench');
  await expect(bench.getByTestId('bench-changes')).toBeVisible();
  await bench.getByTestId('trial-name').locator('input').fill('Inflated weights');
  await page.getByTestId('run-trial').click();
  await expect(page.getByText(/Sigmas inflated ×2/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('stale-trial')).toHaveCount(0);

  await page.getByTestId('candidate-reason').locator('input').fill('E2E candidate from inflated-weights trial');
  await page.getByTestId('save-candidate').click();
  await expect(page.getByText(/Created v\d+ as a draft/)).toBeVisible();
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
  // The step says what it is for: approximations, not a datum.
  await expect(page.getByText(/Compute from the known reference coordinates/)).toBeVisible();
  await expect(page.getByText(/what a run holds fixed is decided in the Adjustment step/)).toBeVisible();
  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByTestId('compute-initialisation')).toBeEnabled();
  await page.getByTestId('compute-initialisation').click();
  await expect(page.getByTestId('initial-network-view')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Zoom in network' }).click();
  await expect(page.getByText('120%')).toBeVisible();
});
