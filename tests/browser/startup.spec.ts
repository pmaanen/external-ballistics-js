import { test, expect } from '@playwright/test';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('downloaded production build works offline as a standalone local file', async ({ page, context }) => {
  const directory = await mkdtemp(join(tmpdir(), 'Vector downloaded ü '));
  const html = join(directory, 'index.html');
  await copyFile(resolve('dist/index.html'), html);
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  await context.setOffline(true);
  try {
    await page.goto(pathToFileURL(html).href);
    await expect(page.locator('#load-form')).toBeVisible();
    await expect(page.locator('#solution-count')).toHaveText('1');
    await expect(page.locator('#task-bar')).toBeHidden();
    await page.getByRole('button', { name: 'Metric', exact: true }).click();
    await page.locator('#threshold-energy').fill('1500');
    await page.getByRole('button', { name: 'Find distance' }).click();
    await expect(page.locator('#energy-result .result-lead')).toBeVisible();
    await page.getByRole('button', { name: 'Optimize' }).click();
    await expect(page.locator('#pbr-status')).toContainText('Optimum verified');
    await page.locator('#muzzle').fill('850');
    await page.getByRole('button', { name: 'Calculate trajectory' }).click();
    await expect(page.locator('#form-status')).toContainText('Trajectory ready');
    await page.getByRole('button', { name: '+ Save to comparison', exact: true }).click();
    await expect(page.locator('#solution-count')).toHaveText('2');
    expect(remoteRequests).toEqual([]);
  } finally {
    await test.info().attach('startup-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
    await page.goto('about:blank');
    await rm(directory, { recursive: true, force: true });
  }
});

test('source HTML opened without a server shows startup instructions instead of a blank page', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await expect(page.locator('#startup-status')).toBeVisible();
  await expect(page.locator('#startup-status')).toContainText('npm run dev');
  await expect(page.locator('#startup-status')).toContainText('dist/index.html');
});
