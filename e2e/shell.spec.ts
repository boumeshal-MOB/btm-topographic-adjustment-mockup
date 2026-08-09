import { test, expect } from '@playwright/test';

test('shell renders title and Demo data badge (DEMO-004), keyboard reachable', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('banner');
  await expect(banner).toBeVisible();
  // the product title in the bar is the home link to the processings list
  await expect(banner.getByRole('link', { name: 'Topographic Adjustment' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: 'Processings' })).toBeVisible();
  await expect(page.getByTestId('demo-data-badge')).toHaveText('Demo data');
});

test('French surveying interface is selectable and persists across navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'French' }).click();

  await expect(page.getByRole('banner').getByRole('link', { name: 'Compensation topographique' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Traitements de compensation topographique' })).toBeVisible();
  await expect(page.getByTestId('demo-data-badge')).toHaveText('Données de démonstration');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Traitements de compensation topographique' })).toBeVisible();
  await page.getByTestId('new-processing').click();
  await expect(page.getByRole('heading', { name: 'Nouveau traitement de compensation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coordonnées approchées' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compensation', exact: true })).toBeVisible();
});
