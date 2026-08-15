import { test, expect, type Page } from '@playwright/test';

/**
 * Validation catalogue journeys over the built bundle.
 *
 * Deliberately a small, targeted matrix rather than one journey per dataset: the whole catalogue
 * is already checked dataset-by-dataset in the domain suite, and each defect family is solved
 * through the real pipeline in the store suite. What only a browser can prove is what lives here —
 * that the shards stay out of the initial download, that blind mode holds on a real page, and
 * that a defect is diagnosable end to end.
 */

test.use({ timezoneId: 'UTC' });

const CANONICAL = 'BTM-VAL-041';

async function openCatalogue(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-validation-catalogue').click();
  await page.waitForURL(/validation-catalogue$/);
  await expect(page.getByTestId('validation-result-count')).toContainText('100 of 100 datasets', { timeout: 60_000 });
}

/** Imports a dataset and lands on its Analysis Lab session. */
async function importDataset(page: Page, datasetId: string) {
  await page.getByTestId(`open-${datasetId}`).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Open ${datasetId}`) })).toBeVisible();
  await page.getByTestId('confirm-import').click();
  await page.waitForURL(/processing\/topographic-adjustment\/\d+\/analysis$/, { timeout: 120_000 });
}

test('catalogue: no shard is downloaded until a dataset is opened', async ({ page }) => {
  test.setTimeout(180_000);

  const shardRequests: string[] = [];
  page.on('request', (request) => {
    if (/demo-datasets\/v1\/shards\//.test(request.url())) shardRequests.push(request.url());
  });

  await openCatalogue(page);
  // The manifest alone drives the whole listing.
  expect(shardRequests).toHaveLength(0);

  await importDataset(page, CANONICAL);
  expect(shardRequests.length).toBeGreaterThan(0);
  // and only the one shard that actually contains the dataset
  expect(new Set(shardRequests).size).toBe(1);
  expect(shardRequests[0]).toContain('validation-041-050.json');
});

test('catalogue: filters narrow the list and blind mode hides the answer', async ({ page }) => {
  test.setTimeout(180_000);
  await openCatalogue(page);

  // Blind by default: no scenario is named anywhere in the table.
  await expect(page.getByTestId(`validation-row-${CANONICAL}`)).toContainText('Hidden');
  await expect(page.getByText('Moved reference')).toHaveCount(0);

  await page.getByLabel('Stations').click();
  await page.getByRole('option', { name: '1', exact: true }).click();
  await expect(page.getByTestId('validation-result-count')).toContainText('20 of 100 datasets');

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('validation-result-count')).toContainText('100 of 100 datasets');

  // Turning blind mode off is what reveals the family, and only then.
  await page.getByTestId('blind-mode-toggle').locator('input').click();
  await expect(page.getByText('Moved reference').first()).toBeVisible();
});

test('lab: a clean reference network is explained rather than reported as broken', async ({ page }) => {
  test.setTimeout(240_000);
  await openCatalogue(page);
  await importDataset(page, CANONICAL);

  await expect(page.getByTestId('validation-session-card')).toContainText(CANONICAL);
  await expect(page.getByTestId('load-baseline')).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId('load-baseline').click();
  await expect(page.getByText(/Points · Trial 0 · baseline/)).toBeVisible({ timeout: 120_000 });

  // The generated references sit exactly on their truth while declaring 1-1.5 mm, so the test
  // fails on the low side. The lab must say which side, not just "failed".
  await expect(page.getByText('The adjustment fits better than the declared precision')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Network map with stations, points and error ellipses' })).toBeVisible();

  // Identity: shared physical points are resolved, homonyms stay separate.
  const pointTable = page.getByRole('table', { name: 'Analysis point results' });
  await expect(pointTable.getByText('Shared physical points')).toBeVisible();
});

test('lab: a gross distance error is diagnosable and its answer stays sealed until revealed', async ({ page }) => {
  test.setTimeout(240_000);
  await openCatalogue(page);

  // Choosing the family to practise on is a recette action; blind mode stays on, so the page
  // still never states which dataset carries what.
  await page.getByRole('combobox', { name: 'Scenario' }).click();
  await page.getByRole('option', { name: 'Gross error on distance' }).click();
  await expect(page.getByTestId('validation-result-count')).toContainText('6 of 100 datasets');
  await expect(page.locator('[data-testid^="validation-row-BTM-VAL-"]').first()).toContainText('Hidden');

  const firstRow = page.locator('[data-testid^="validation-row-BTM-VAL-"]').first();
  const datasetId = (await firstRow.getAttribute('data-testid'))!.replace('validation-row-', '');
  await importDataset(page, datasetId);

  await expect(page.getByTestId('load-baseline')).toBeEnabled({ timeout: 120_000 });
  // The incident epoch is where the generator injects the fault.
  await page.getByLabel('Epoch / output slot').click();
  const options = page.getByRole('option');
  await options.nth(1).click();
  await page.getByTestId('load-baseline').click();
  await expect(page.getByText(/Points · Trial 0 · baseline/)).toBeVisible({ timeout: 120_000 });

  // Blind: nothing on the page names the family yet.
  await expect(page.getByTestId('revealed-oracle')).toHaveCount(0);
  await expect(page.getByTestId('validation-session-card')).not.toContainText('Gross error on distance');

  // Revealing is an explicit, separate action.
  await page.getByTestId('reveal-answer').click();
  await expect(page.getByTestId('revealed-oracle')).toContainText('Gross error on distance', { timeout: 60_000 });
});
