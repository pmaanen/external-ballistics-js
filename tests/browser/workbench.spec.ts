import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#solution-count')).toHaveText('1');
  await expect(page.locator('#task-bar')).toBeHidden();
});

test('reference load, three charts, exact-distance table, and local assets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page).toHaveTitle('Vector — Ballistics Workbench');
  await expect(page.locator('canvas')).toHaveCount(3);
  const rows = page.locator('#solution-table tbody tr');
  await expect(rows).toHaveCount(17);
  await expect(rows.first().locator('th')).toHaveText('0.00');
  await expect(rows.first().locator('td').last()).toHaveText('0.000');
  await expect(rows.first().locator('td').nth(1)).toHaveText('—');
  await expect(rows.first().locator('td').nth(5)).toHaveText('—');
  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  expect(urls.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
  expect(errors).toEqual([]);
});

test('mixed units preserve physical inputs, output units, and saved snapshots', async ({ page }) => {
  const before = await page.locator('#solution-table tbody tr').nth(4).textContent();
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await expect(page.locator('#mass')).toHaveValue('10.88621688');
  await expect(page.locator('#muzzle')).toHaveValue('807.72');
  await expect(page.locator('#zero')).toHaveValue('182.88');
  await page.getByLabel('Projectile mass unit', { exact: true }).selectOption('gr');
  await expect(page.locator('#mass')).toHaveValue('168');
  await expect(page.locator('#unit-state')).toHaveText('Mixed units');
  await page.getByRole('button', { name: 'Imperial', exact: true }).click();
  expect(await page.locator('#solution-table tbody tr').nth(4).textContent()).toBe(before);
  await expect(page.locator('#solution-count')).toHaveText('1');
});

test('calculate, save three solutions, rename, duplicate, overlay and remove', async ({ page }) => {
  const firstRow = await page.locator('#solution-table tbody tr').nth(4).textContent();
  await page.locator('#load-name').fill('Faster comparison');
  await page.locator('#muzzle').fill('2800');
  await page.getByRole('button', { name: 'Calculate trajectory' }).click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.getByRole('button', { name: '+ Save to comparison', exact: true }).click();
  await expect(page.locator('#solution-count')).toHaveText('2');
  const rowText = await page.locator('#solution-table tbody tr').nth(4).textContent();
  expect(rowText).toContain(firstRow!);
  await page.getByRole('button', { name: 'Duplicate Faster comparison', exact: true }).click();
  await expect(page.locator('#solution-count')).toHaveText('3');
  await page.getByRole('textbox', { name: 'Name for Faster comparison · copy', exact: true }).fill('Independent copy');
  await page.locator('h1').click();
  await expect(page.locator('#solution-table thead tr').first()).toContainText('Independent copy');
  await page.getByRole('checkbox', { name: 'Show Faster comparison', exact: true }).uncheck();
  await expect(page.locator('#table-count')).toContainText('2 solutions');
  await page.getByRole('button', { name: 'Remove Independent copy', exact: true }).click();
  await expect(page.locator('#solution-count')).toHaveText('2');
  await expect(page.locator('#table-count')).toContainText('1 solution');
});

test('zero values recalculate, invalid fields are identified, and short coverage stays missing', async ({ page }) => {
  await page.locator('#sight').fill('0');
  await page.locator('#load-name').fill('Zero-height sight');
  await page.getByRole('button', { name: 'Calculate trajectory' }).click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await expect(page.locator('#solution-table tbody tr').first().locator('td').nth(7)).toHaveText('0.00');
  await page.getByRole('button', { name: '+ Save to comparison', exact: true }).click();
  await page.locator('#bc').fill('0');
  await page.getByRole('button', { name: 'Calculate trajectory' }).click();
  await expect(page.locator('#form-status')).toContainText('BC must');
  await expect(page.locator('#bc')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#bc')).toBeFocused();
  await expect(page.getByRole('button', { name: '+ Save to comparison', exact: true })).toBeDisabled();
  await page.locator('#range-max').fill('1000');
  await page.locator('#range-step').focus();
  await expect(page.locator('#solution-table tbody tr').last()).toContainText('outside calculated coverage');
  await page.locator('#range-step').fill('0');
  await page.locator('h1').click();
  await expect(page.locator('#range-error')).toBeVisible();
});

test('fractional metric table steps and both calculators use consistent units', async ({ page }) => {
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await page.locator('#range-max').fill('500');
  await page.locator('#range-step').fill('33.3');
  await page.locator('h1').click();
  await expect(page.locator('#solution-table tbody tr').nth(1).locator('th')).toHaveText('33.30');
  await expect(page.locator('#solution-table tbody tr').last().locator('th')).toHaveText('500.00');
  await page.locator('#threshold-energy').fill('1500');
  await page.getByRole('button', { name: 'Find distance' }).click();
  await expect(page.locator('#energy-result .result-lead')).toBeVisible();
  await expect(page.locator('#energy-result')).toContainText('1,500 J');
  await page.locator('#target-diameter').fill('15');
  await page.getByRole('button', { name: 'Optimize' }).click();
  await expect(page.locator('#pbr-status')).toContainText('Optimum verified');
  await expect(page.locator('#pbr-result')).toContainText('Peak height');
  await page.getByRole('button', { name: '+ Add optimized load to comparison', exact: true }).click();
  await expect(page.locator('#solution-count')).toHaveText('2');
  await expect(page.locator('#save-pbr')).toHaveText('✓ Optimized load saved');
});

test('threshold edge cases, narrow target near entry and changing source clear stale results', async ({ page }) => {
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await page.locator('#threshold-energy').fill('100000');
  await page.getByRole('button', { name: 'Find distance' }).click();
  await expect(page.locator('#energy-result')).toContainText('Already below');
  await page.locator('#threshold-energy').fill('1');
  await page.getByRole('button', { name: 'Find distance' }).click();
  await expect(page.locator('#energy-result')).toContainText('No downward crossing');
  await page.locator('#target-diameter').fill('2.5');
  await page.getByRole('button', { name: 'Optimize' }).click();
  await expect(page.locator('#pbr-result')).toContainText('Muzzle starts below');
  await page.getByRole('button', { name: /Duplicate .308/ }).click();
  await page.locator('#calculator-solution').selectOption({ index: 1 });
  await expect(page.locator('#energy-result')).toContainText('will appear here');
  await expect(page.locator('#pbr-result')).toContainText('will appear here');
});

test('mobile layout, model dialog, keyboard controls, and safe names', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Model notes', exact: true }).click();
  await expect(page.locator('#notes-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#notes-dialog')).toBeHidden();
  await page.locator('.solution-name').fill('<img src=x onerror=alert(1)>');
  await page.locator('h1').click();
  await expect(page.locator('#chart-legend')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#solution-table img')).toHaveCount(0);
  await page.locator('#load-name').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#mass')).toBeFocused();
  await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
});

test('cancellation terminates work and a subsequent request succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown): void { setTimeout(() => super.postMessage(message), 500); }
    } as typeof Worker;
  });
  await page.reload();
  await expect(page.locator('#solution-count')).toHaveText('1');
  await expect(page.locator('#task-bar')).toBeHidden();
  await page.getByRole('button', { name: 'Optimize' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#pbr-status')).toContainText('cancelled');
  await expect(page.locator('#task-bar')).toBeHidden();
  await page.getByRole('button', { name: 'Find distance' }).click();
  await expect(page.locator('#energy-status')).toContainText('Calculated from');
});

test('desktop overview has no runtime errors or failed assets', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload();
  await expect(page.locator('#solution-count')).toHaveText('1');
  await expect(page.locator('#task-bar')).toBeHidden();
  await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});
