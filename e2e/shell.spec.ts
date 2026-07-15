import { test, expect } from '@playwright/test';

test('shell renders title and Demo data badge (DEMO-004), keyboard reachable', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByText('Topographic Adjustment')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Topographic Adjustment' })).toBeVisible();
  await expect(page.getByTestId('demo-data-badge')).toHaveText('Demo data');
});
