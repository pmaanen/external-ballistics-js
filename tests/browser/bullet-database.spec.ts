import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#solution-count')).toHaveText('1');
});

test('database copies an explicit G7 pair in mixed units while keeping velocity and saved results', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await page.getByLabel('Muzzle velocity unit', { exact: true }).selectOption('ft/s');
  const previous = await page.locator('#solution-table tbody').textContent();
  await page.locator('#open-bullet-database').click();
  await expect(page.locator('#bullet-search')).toBeFocused();
  await page.locator('#bullet-search').fill('berger 130 hybrid');
  await page.locator('#bullet-manufacturer').selectOption('Berger');
  await page.locator('#bullet-caliber').selectOption('0.264');
  await page.locator('#bullet-results').selectOption({ label: 'Berger · AR Hybrid OTM 26195 · 130 gr · 0.264 in' });
  await page.locator('#bullet-bc-model').selectOption('G7');
  await expect(page.locator('#bullet-bc-note')).toContainText('G7: 0.291');
  await page.screenshot({ path: info.outputPath('bullet-database.png') });
  await page.locator('#bullet-apply').click();
  await expect(page.locator('#bullet-database-dialog')).toBeHidden();
  await expect(page.locator('#drag-model')).toHaveValue('G7');
  await expect(page.locator('#bc')).toHaveValue('0.291');
  expect(Number(await page.locator('#mass').inputValue())).toBeCloseTo(130 * .06479891, 10);
  await expect(page.locator('#muzzle')).toHaveValue('2650');
  await expect(page.locator('#load-name')).toHaveValue('Berger AR Hybrid OTM 26195 · 130 gr');
  expect(await page.locator('#solution-table tbody').textContent()).toBe(previous);
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.locator('#save-solution').click();
  await expect(page.locator('#solution-count')).toHaveText('2');
});

test('unavailable and invalid source BCs clear the old value and require manual input', async ({ page }) => {
  await page.locator('#open-bullet-database').click();
  await page.locator('#bullet-search').fill('FPBB EPRX');
  await page.locator('#bullet-results').selectOption({ index: 1 });
  await expect(page.locator('#bullet-bc-model')).toBeDisabled();
  await expect(page.locator('#bullet-bc-note')).toContainText('No usable listed BC');
  await page.locator('#bullet-apply').click();
  await expect(page.locator('#bc')).toHaveValue('');
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Complete all required');
  await expect(page.locator('#save-solution')).toBeDisabled();
  await page.locator('#bc').fill('0.173');
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.locator('#open-bullet-database').click();
  await page.locator('#bullet-search').fill('457-500-3R');
  await page.locator('#bullet-manufacturer').selectOption('LEE');
  await page.locator('#bullet-results').selectOption({ index: 1 });
  await expect(page.locator('#bullet-bc-note')).toContainText('unsupported source value 443');
  await page.locator('#bullet-apply').click();
  await expect(page.locator('#bc')).toHaveValue('');
  await expect(page.locator('#save-solution')).toBeDisabled();
});

test('maximum-range picker, keyboard dismissal, credits and mobile filters work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Maximum range', exact: true }).click();
  await page.locator('#max-open-bullet-database').click();
  await page.locator('#bullet-search').fill('no-such-bullet-xyz');
  await expect(page.locator('#bullet-match-count')).toHaveText('0 matches.');
  await expect(page.locator('#bullet-apply')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bullet-database-dialog')).toBeHidden();
  await expect(page.locator('#max-mass')).toHaveValue('168');
  await page.locator('#max-open-bullet-database').click();
  await expect(page.locator('.database-credit')).toContainText('Reese Wilson / Wilson Armament Bureau');
  await page.locator('.database-license summary').click();
  await expect(page.locator('.database-license pre')).toContainText('Copyright (c) 2026 Wilson Kinetics');
  await expect(page.locator('.database-credit a')).toHaveAttribute('href', /c3d69d364bafb2664507ffc41b4bac7b3e1a1d81/);
  await page.locator('#bullet-search').fill('berger 130 hybrid');
  await page.locator('#bullet-results').selectOption({ label: 'Berger · AR Hybrid OTM 26195 · 130 gr · 0.264 in' });
  const box = await page.locator('#bullet-database-dialog').boundingBox();
  expect(box!.width).toBeLessThan(390);
  expect(await page.locator('#bullet-database-dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.locator('#bullet-apply').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#max-mass')).toHaveValue('130');
  await expect(page.locator('#max-bc')).toHaveValue('0.614');
  await expect(page.locator('#max-muzzle')).toHaveValue('2650');
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
});
