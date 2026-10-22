import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#solution-count')).toHaveText('1');
});

test('calculator source is selectable and saving another load preserves selection and result', async ({ page }) => {
  const original = await page.locator('#calculator-solution').inputValue();
  await page.locator('#load-name').fill('Slow bullet');
  await page.locator('#muzzle').fill('2200');
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.locator('#save-solution').click();
  await expect(page.locator('#calculator-solution')).toHaveValue(original);
  await page.locator('#calculator-solution').selectOption({ label: 'Slow bullet' });
  const selected = await page.locator('#calculator-solution').inputValue();
  await page.locator('#calculate-energy').click();
  await expect(page.locator('#energy-status')).toHaveText('Calculated from Slow bullet.');
  const slowDistance = await page.locator('#energy-result .result-lead').textContent();
  await page.locator('#load-name').fill('Third bullet');
  await page.locator('#muzzle').fill('2900');
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.locator('#save-solution').click();
  await expect(page.locator('#calculator-solution')).toHaveValue(selected);
  await expect(page.locator('#energy-result .result-lead')).toHaveText(slowDistance!);
  await page.locator('#calculator-solution').selectOption(original);
  await expect(page.locator('#energy-result')).toContainText('will appear here');
  await page.locator('#calculate-energy').click();
  await expect(page.locator('#energy-status')).toContainText('Calculated from .308');
  expect(await page.locator('#energy-result .result-lead').textContent()).not.toBe(slowDistance);
});

test('zero height and manual angle work; maximum range is separate', async ({ page }) => {
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await page.locator('#zero').fill('100');
  await page.locator('#zero-height').fill('5');
  await page.getByLabel('Zero height unit', { exact: true }).selectOption('mm');
  await expect(page.locator('#zero-height')).toHaveValue('50');
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  // Clear unused zero inputs: disabling zeroing must also disable their validation.
  await page.locator('#zero').fill('');
  await page.locator('#zero-height').fill('');
  await page.locator('#aim-mode').selectOption('angle');
  await expect(page.locator('#zero')).toBeDisabled();
  await page.locator('#bore-angle').fill('2');
  await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await expect(page.locator('#preview-banner')).toContainText('2.0000° bore');
  await expect(page.locator('#aim-mode option[value="maximum-range"]')).toHaveCount(0);
  await page.locator('#save-solution').click();
  await page.locator('#calculator-solution').selectOption({ index: 1 });
  await expect(page.locator('#source-summary')).toContainText('manual angle');
  await page.locator('#calculate-energy').click();
  await expect(page.locator('#energy-status')).toContainText('Calculated from');
  await page.getByRole('button', { name: 'Maximum range', exact: true }).click();
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
  await expect(page.locator('#max-preview-summary')).toContainText('Safe distance');
});

test('PBR reports zero height at chosen range and saved editor preserves the optimized angle', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await page.locator('#pbr-zero-range').fill('100');
  await page.locator('#calculate-pbr').click();
  await expect(page.locator('#pbr-status')).toContainText('Optimum verified');
  await expect(page.locator('#pbr-result')).toContainText('Zero height at 100.0 m');
  const grid = page.locator('#pbr-result .result-grid > div');
  const height = Number((await grid.first().locator('strong').innerText()).split(' ')[0]);
  expect(height).toBeGreaterThan(0);
  const angle = await grid.filter({ hasText: 'Bore elevation' }).locator('strong').innerText();
  await page.screenshot({ path: info.outputPath('zero-height-pbr.png'), fullPage: true });
  await page.locator('#save-pbr').click();
  await page.getByRole('button', { name: /Edit .* · PBR/, exact: false }).click();
  await expect(page.locator('#aim-mode')).toHaveValue('angle');
  expect(Number(await page.locator('#bore-angle').inputValue())).toBeCloseTo(Number(angle.replace('°', '')), 4);
  await page.locator('#aim-mode').selectOption('zero');
  await expect(page.locator('#zero')).toHaveValue('100');
  expect(Number(await page.locator('#zero-height').inputValue())).toBeCloseTo(height, 2);
  await page.locator('#pbr-zero-range').fill('9000');
  await page.locator('#calculate-pbr').click();
  await expect(page.locator('#pbr-status')).toContainText('Optimum verified');
  await expect(page.locator('#pbr-result')).toContainText('Outside verified coverage');
});
