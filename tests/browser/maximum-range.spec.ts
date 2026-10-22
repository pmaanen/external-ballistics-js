import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#solution-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Maximum range', exact: true }).click();
});

test('complete maximum-range flights can be compared independently of trajectory settings', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.locator('#load-form')).toBeHidden();
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#max-range-form');
  await page.locator('#max-name').fill('First bullet');
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
  await expect(page.locator('#max-events-table')).toContainText('Downward');
  await page.screenshot({ path: info.outputPath('maximum-range-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
  await page.locator('#max-save').click();
  const first = await page.locator('#max-summary-table tbody tr').first().innerText();
  await page.locator('#max-name').fill('Heavy bullet');
  await page.locator('#max-mass').fill('336');
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
  await page.locator('#max-save').click();
  await expect(page.locator('#max-summary-table tbody tr')).toHaveCount(2);
  expect(await page.locator('#max-summary-table tbody tr').first().innerText()).toBe(first);
  await page.getByRole('checkbox', { name: 'Show maximum range for First bullet', exact: true }).uncheck();
  await expect(page.locator('#max-summary-table tbody tr')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Show maximum range for First bullet', exact: true }).check();
  await page.getByRole('button', { name: 'Trajectory', exact: true }).click();
  await expect(page.locator('#solution-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Maximum range', exact: true }).click();
  await expect(page.locator('#max-summary-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove maximum range for Heavy bullet', exact: true }).click();
  await expect(page.locator('#max-summary-table tbody tr')).toHaveCount(1);
});

test('mixed units preserve values, energy descent crossings, and input validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await expect(page.locator('#max-height')).toHaveValue('1.5');
  await page.locator('#max-threshold').fill('105');
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
  await expect(page.locator('#max-events-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#max-events-table')).toContainText('Upward during descent');
  await page.getByLabel('Initial velocity unit', { exact: true }).selectOption('ft/s');
  await expect(page.locator('#max-muzzle')).toHaveValue('2650');
  await expect(page.locator('#max-save')).toBeEnabled();
  await page.locator('#max-save').click();
  await page.locator('#max-height-unit').selectOption('ft');
  expect(Number(await page.locator('#max-height').inputValue())).toBeCloseTo(1.5 / .3048, 8);
  await page.locator('#max-height').fill('-1');
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('Muzzle height must be');
  await expect(page.locator('#max-summary-table tbody tr')).toHaveCount(1);
  await page.locator('#max-height').fill('0');
  await page.locator('#max-threshold').fill('999999');
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
  await expect(page.locator('#max-summary-table')).toContainText('Below at muzzle');
});

test('saved load copying, keyboard navigation and mobile charts work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#max-source').selectOption({ index: 1 });
  await expect(page.locator('#max-name')).toHaveValue(/308/);
  await page.locator('#max-calculate').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#max-status')).toContainText('flight complete');
  const canvas = await page.locator('#max-height-chart').boundingBox();
  expect(canvas!.width).toBeGreaterThan(200);
  expect(canvas!.width).toBeLessThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('maximum-range work can be cancelled and restarted', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown): void { setTimeout(() => super.postMessage(message), 500); }
    } as typeof Worker;
  });
  await page.reload();
  await expect(page.locator('#solution-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Maximum range', exact: true }).click();
  await page.locator('#max-calculate').click();
  await page.locator('#max-cancel').click();
  await expect(page.locator('#max-status')).toContainText('cancelled');
  await expect(page.locator('#max-save')).toBeDisabled();
  await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
});
