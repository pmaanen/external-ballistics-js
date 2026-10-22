import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultScenario, sampleAt, solveScenario } from '../src/ballistics/model';
import { presets } from '../src/ballistics/units';
import { SolutionStore } from '../src/app/store';
import { decodeWorkspace } from '../src/app/workspace-state';
import type { WorkspaceState } from '../src/app/workspace-state';
import { maximumRange } from '../src/calculators/maximum-range';
import { safeDistance } from '../src/calculators/safe-distance';
const result = solveScenario(defaultScenario, 100);
function workspace(): WorkspaceState {
  const store = new SolutionStore(), item = store.add(result);
  return { schema: 1, solutions: store.snapshot(), preview: null, editingId: item.id, activeId: item.id, preferences: { ...presets.metric },
    view: { min: 0, max: 100, step: 10 }, mode: 'trajectory', maximum: { comparisons: [], preview: null, editingId: '', heightUnit: 'm' } };
}
test('workspace snapshots restore numerical data, identity and independent frozen results', () => {
  const state = workspace();
  state.maximum.comparisons.push({ id: 'range-1', name: 'Range', color: '#abcdef', visible: false, result: maximumRange(defaultScenario, 1.5, 1500) });
  const restored = decodeWorkspace(structuredClone(state));
  const store = new SolutionStore(); store.restore(restored.solutions);
  assert.equal(store.items[0].id, state.activeId);
  assert.equal(sampleAt(store.items[0].result, 100)!.timeS, sampleAt(result, 100)!.timeS);
  restored.solutions[0].result.inputs.bc = .9;
  assert.equal(store.items[0].result.inputs.bc, .465);
  assert.ok(Object.isFrozen(store.items[0].result));
});
test('overwrites and distance updates preserve card identity, style, order and live names', () => {
  const store = new SolutionStore(), a = store.add(result), b = store.duplicate(a.id);
  a.visible = false; const color = a.color, dash = [...a.dash];
  const updated = solveScenario({ ...defaultScenario, name: 'Overwrite', muzzleMps: 900 }, 200);
  store.replace(a.id, updated);
  assert.equal(a.name, 'Overwrite'); assert.equal(a.color, color); assert.equal(a.visible, false); assert.deepEqual(a.dash, dash);
  assert.equal(store.items.length, 2); assert.equal(store.items[0].id, a.id);
  const oldB = b.result;
  store.rename(a.id, 'Renamed during calculation');
  store.move(a.id, b.id, true);
  store.replaceBatch([{ id: a.id, result }, { id: 'deleted-id', result }]);
  assert.equal(store.items[1].id, a.id); assert.equal(a.name, 'Renamed during calculation'); assert.equal(a.result.inputs.name, a.name);
  assert.equal(b.result, oldB); assert.equal(updated.inputs.name, 'Overwrite');
});
test('card moves support insertion before/after and ignore invalid or same-card drops', () => {
  const store = new SolutionStore(), a = store.add(result), b = store.duplicate(a.id), c = store.duplicate(a.id);
  store.move(c.id, a.id); assert.deepEqual(store.items.map(s => s.id), [c.id, a.id, b.id]);
  store.move(c.id, b.id, true); assert.deepEqual(store.items.map(s => s.id), [a.id, b.id, c.id]);
  store.move(a.id, a.id); store.move('missing', b.id); store.move(a.id, 'missing');
  assert.deepEqual(store.items.map(s => s.id), [a.id, b.id, c.id]);
});
test('corrupt, incompatible or unsafe persisted records are rejected explicitly', () => {
  for (const edit of [
    (s: any) => { s.schema = 99; },
    (s: any) => { s.solutions.push(s.solutions[0]); },
    (s: any) => { s.activeId = 'missing'; },
    (s: any) => { s.solutions[0].result.trajectory.points[1].vx = NaN; },
    (s: any) => { s.solutions[0].color = 'red;background:url(x)'; },
    (s: any) => { s.view.step = 0; },
    (s: any) => { s.preferences.mass = 'yd'; },
  ]) { const state = structuredClone(workspace()); edit(state); assert.throws(() => decodeWorkspace(state)); }
});
test('modelled safe distance selects the earlier threshold or impact and handles muzzle cases', () => {
  const crossing = maximumRange(defaultScenario, 1.5, 1500), limit = safeDistance(crossing);
  assert.equal(limit.reason, 'energy-threshold'); assert.ok(limit.point.distanceM < crossing.flight.impact.distanceM);
  const impact = maximumRange(defaultScenario, 1.5, 1);
  assert.equal(safeDistance(impact).point.distanceM, impact.flight.impact.distanceM); assert.equal(safeDistance(impact).reason, 'ground-impact');
  const startEnergy = impact.flight.points[0].energyJ;
  const below = { ...impact, energy: { ...impact.energy, initial: 'below' as const, thresholdJ: startEnergy + 1 } };
  assert.equal(safeDistance(below).point.distanceM, 0); assert.equal(safeDistance(below).reason, 'below-at-muzzle');
  const equal = { ...impact, energy: { ...impact.energy, initial: 'equal' as const, thresholdJ: startEnergy } };
  assert.equal(safeDistance(equal).point.timeS, 0);
});
