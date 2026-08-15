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

test('the French choice survives a reload and sets the document language', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Processings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('button', { name: 'French' }).click();

  // the whole shell and the home screen switch, not just the bar
  await expect(page.getByTestId('demo-data-badge')).toHaveText('Données de démonstration');
  await expect(page.getByRole('heading', { name: 'Traitements' })).toBeVisible();
  await expect(page.getByTestId('open-validation-catalogue')).toHaveText('Parcourir le catalogue de validation');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  // a surveyor working in French should not re-pick the language on every visit
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Traitements' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('a French browser opens in French without any stored choice', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Traitements' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await context.close();
});
