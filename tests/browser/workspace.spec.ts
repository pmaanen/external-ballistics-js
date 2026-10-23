import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function saved(page: Page) { await expect(page.locator('#workspace-status')).toHaveAttribute('data-state', 'saved'); }
async function read(page: Page): Promise<any> {
  await saved(page);
  return page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('vector-ballistics', 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, t = db.transaction('workspace'), get = t.objectStore('workspace').get('current'); t.oncomplete = () => { db.close(); resolve(get.result); }; };
  }));
}

test('saved trajectories support drag ordering, overwrite, reload and deliberate empty libraries', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#solution-count')).toHaveText('1');
  await page.getByRole('button', { name: /Duplicate .308/ }).click();
  await page.locator('.solution-name').nth(1).fill('Second'); await page.locator('h1').click();
  const state = await read(page), second = state.solutions[1];
  await page.locator('#calculator-solution').selectOption(second.id);
  await page.getByRole('checkbox', { name: 'Show Second', exact: true }).uncheck();
  await page.locator(`[data-drag-id="${second.id}"]`).dragTo(page.locator('#saved-solutions .saved-solution').first(), { targetPosition: { x: 8, y: 4 } });
  await expect(page.locator('.solution-name').first()).toHaveValue('Second');
  await page.getByRole('button', { name: 'Edit Second', exact: true }).click();
  await page.locator('#load-name').fill('Updated'); await page.locator('#muzzle').fill('2800');
  await page.locator('#load-form button[type="submit"]').click(); await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.locator('#overwrite-solution').click();
  await expect(page.locator('#solution-count')).toHaveText('2');
  const overwritten = await read(page);
  expect(overwritten.solutions[0].id).toBe(second.id); expect(overwritten.solutions[0].color).toBe(second.color);
  expect(overwritten.solutions[0].visible).toBe(false); expect(overwritten.solutions[0].name).toBe('Updated');
  expect(overwritten.solutions[0].result.inputs.muzzleMps).toBeCloseTo(2800 * .3048, 8);
  await page.reload(); await expect(page.locator('#form-status')).toContainText('restored');
  await expect(page.locator('.solution-name').first()).toHaveValue('Updated');
  await expect(page.locator('#calculator-solution')).toHaveValue(second.id);
  await expect(page.getByRole('checkbox', { name: 'Show Updated', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Remove Updated', exact: true }).click();
  await page.getByRole('button', { name: /Remove .308/ }).click(); await saved(page);
  await page.reload(); await expect(page.locator('#form-status')).toContainText('restored');
  await expect(page.locator('#solution-count')).toHaveText('0');
});

test('previews and maximum-range edits, keyboard order and safe distances survive reload', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#solution-count')).toHaveText('1');
  await page.locator('#load-name').fill('Unsaved trajectory'); await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready');
  await page.getByRole('button', { name: 'Maximum range', exact: true }).click();
  await page.locator('#max-name').fill('First range'); await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete');
  await expect(page.locator('#max-preview-summary .safe-distance-summary')).toContainText('Energy threshold');
  await page.locator('#max-save').click();
  await page.locator('#max-name').fill('Second range'); await page.locator('#max-mass').fill('300');
  await page.locator('#max-calculate').click(); await expect(page.locator('#max-status')).toContainText('flight complete'); await page.locator('#max-save').click();
  await page.locator('#max-comparisons .drag-grip').last().focus(); await page.keyboard.press('Home');
  await expect(page.locator('#max-comparisons strong').first()).toHaveText('Second range');
  await page.getByRole('button', { name: 'Edit maximum range for Second range', exact: true }).click();
  await page.locator('#max-mass').fill('250'); await page.locator('#max-calculate').click();
  await expect(page.locator('#max-status')).toContainText('flight complete'); await page.locator('#max-overwrite').click();
  await expect(page.locator('#max-comparisons .saved-solution')).toHaveCount(2); await saved(page);
  await page.reload(); await expect(page.locator('#form-status')).toContainText('restored');
  await expect(page.locator('#maximum-range-mode')).toBeVisible();
  await expect(page.locator('#max-comparisons strong').first()).toHaveText('Second range');
  await expect(page.locator('#max-mass')).toHaveValue('250');
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  await page.locator('#max-threshold').fill('1'); await page.locator('#max-calculate').click(); await expect(page.locator('#max-status')).toContainText('flight complete');
  const last = page.locator('#max-summary-table tbody tr').last();
  expect(await last.locator('.safe-distance-cell').textContent()).toBe(await last.locator('td').first().textContent());
  await expect(page.locator('#max-preview-summary .safe-distance-summary')).toContainText('First ground impact');
  await page.locator('#max-threshold').fill('999999'); await page.locator('#max-calculate').click(); await expect(page.locator('#max-status')).toContainText('flight complete');
  await expect(page.locator('#max-preview-summary .safe-distance-summary strong')).toHaveText('0.0 m');
  await page.getByRole('button', { name: 'Trajectory', exact: true }).click();
  await expect(page.locator('#preview-banner')).toContainText('Unsaved trajectory');
});

test('distance updates recalculate all hidden and visible records, latest edit wins, cancellation retains old data', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const pending: (() => void)[] = [];
    Object.assign(window, { releaseRecalculations() { pending.splice(0).forEach(send => send()); } });
    window.Worker = class extends Native {
      private stopped = false;
      terminate() { this.stopped = true; super.terminate(); }
      postMessage(message: any) {
        if (message.task?.kind === 'recalculate' && message.task.distanceM === 1200) {
          queueMicrotask(() => { if (!this.stopped) this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, ok: false, error: 'Injected batch failure' } })); });
        } else if (message.task?.kind === 'recalculate') pending.push(() => { if (!this.stopped) super.postMessage(message); });
        else super.postMessage(message);
      }
    } as typeof Worker;
  });
  await page.goto('/'); await expect(page.locator('#solution-count')).toHaveText('1');
  await page.getByRole('button', { name: /Duplicate .308/ }).click();
  await page.locator('#saved-solutions input[type="checkbox"]').last().uncheck();
  await page.getByRole('button', { name: 'Metric', exact: true }).click();
  const before = await read(page);
  await page.locator('#range-max').fill('2000'); await page.locator('#range-max').dispatchEvent('change');
  await page.locator('#range-max').fill('600'); await page.locator('#range-max').dispatchEvent('change');
  await page.locator('h1').click(); await expect(page.locator('#task-bar')).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseRecalculations(): void }).releaseRecalculations());
  await expect(page.locator('#range-status')).toContainText('recalculated'); await expect(page.locator('#task-bar')).toBeHidden();
  const after = await read(page);
  expect(after.view.max).toBe(600);
  for (let i = 0; i < after.solutions.length; i++) { expect(after.solutions[i].result.requestedDistanceM).toBe(600); expect(after.solutions[i].result.zeroAngleDeg).toBe(before.solutions[i].result.zeroAngleDeg); }
  expect(after.solutions[1].visible).toBe(false);
  await page.locator('#range-max').fill('1000'); await page.locator('h1').click();
  await expect(page.locator('#task-bar')).toBeVisible(); await page.locator('#cancel-task').click();
  await expect(page.locator('#range-status')).toContainText('Previous distance window and calculations retained');
  expect((await read(page)).view.max).toBe(600);
  await page.locator('#range-max').fill('1200'); await page.locator('h1').click();
  await expect(page.locator('#range-status')).toContainText('Injected batch failure');
  expect((await read(page)).solutions.map((s: any) => s.result.requestedDistanceM)).toEqual([600, 600]);
  await page.reload(); await expect(page.locator('#range-max')).toHaveValue('600');
});

test('localStorage fallback persists when IndexedDB is unavailable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
  await page.goto('/'); await expect(page.locator('#solution-count')).toHaveText('1');
  await page.locator('#zero').fill(''); await page.locator('#aim-mode').selectOption('angle');
  await page.locator('#bore-angle').fill('1'); await page.locator('#load-form button[type="submit"]').click();
  await expect(page.locator('#form-status')).toContainText('Trajectory ready'); await saved(page);
  await page.reload(); await expect(page.locator('#form-status')).toContainText('restored');
  await expect(page.locator('#aim-mode')).toHaveValue('angle'); await expect(page.locator('#bore-angle')).toHaveValue('1');
  await expect(page.locator('#preview-banner')).toBeVisible();
});

test('unreadable data is preserved until explicit replacement; unavailable storage keeps the app usable', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#solution-count')).toHaveText('1'); await saved(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('vector-ballistics', 1); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, t = db.transaction('workspace', 'readwrite'); t.objectStore('workspace').put({ schema: 99, original: 'preserve' }, 'current'); t.oncomplete = () => { db.close(); resolve(); }; };
  }));
  await page.reload(); await expect(page.locator('#workspace-status')).toContainText('Local saving is paused');
  await expect(page.locator('#solution-count')).toHaveText('1');
  const original = await page.evaluate(() => new Promise<any>(resolve => { const r = indexedDB.open('vector-ballistics', 1); r.onsuccess = () => { const db = r.result, t = db.transaction('workspace'), get = t.objectStore('workspace').get('current'); t.oncomplete = () => { db.close(); resolve(get.result); }; }; }));
  expect(original).toEqual({ schema: 99, original: 'preserve' });
  await page.locator('#workspace-retry').click(); expect((await read(page)).schema).toBe(1);
  await page.addInitScript(() => {
    for (const key of ['indexedDB', 'localStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await page.reload(); await expect(page.locator('#solution-count')).toHaveText('1'); await expect(page.locator('#workspace-status')).toHaveAttribute('data-state', 'error');
  await page.locator('#load-form button[type="submit"]').click(); await expect(page.locator('#form-status')).toContainText('Trajectory ready');
});

test('a quota/write failure reports unsaved state and preserves the previous durable record', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#solution-count')).toHaveText('1'); await saved(page);
  await page.evaluate(() => { IDBObjectStore.prototype.put = function (): IDBRequest<IDBValidKey> { throw new DOMException('Storage quota reached', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: /Duplicate .308/ }).click();
  await expect(page.locator('#solution-count')).toHaveText('2');
  await expect(page.locator('#workspace-status')).toContainText('Could not save locally');
  await expect(page.locator('#workspace-status')).toHaveAttribute('data-state', 'error');
  await page.reload(); await expect(page.locator('#form-status')).toContainText('restored');
  await expect(page.locator('#solution-count')).toHaveText('1');
});
