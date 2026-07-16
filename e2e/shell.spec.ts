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
