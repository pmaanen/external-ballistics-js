import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, fromSI, presets, toSI, units } from '../src/ballistics/units';
import { defaultScenario, distanceGrid, makeCore, sampleAt, solveScenario, validateScenario } from '../src/ballistics/model';
import type { Solution } from '../src/ballistics/model';
import { energyThreshold } from '../src/calculators/energy';
import { pointBlank } from '../src/calculators/point-blank';
import { SolutionStore } from '../src/app/store';
function close(a: number, b: number, tolerance = 1e-8) { assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b} ± ${tolerance}`); }

test('unit identities and repeated round trips preserve physical values', () => {
  close(convert(1, 'yd', 'm'), .9144); close(convert(1, 'gr', 'g'), .06479891);
  close(convert(1, 'mph', 'm/s'), .44704); close(convert(1, 'ft·lbf', 'J'), 1.3558179483314004);
  close(convert(60, 'MOA', 'mrad'), Math.PI * 1000 / 180);
  for (const unit of Object.keys(units) as (keyof typeof units)[]) {
    let value = 123.456789;
    for (let i = 0; i < 100; i++) value = fromSI(toSI(value, unit), unit);
    close(value, 123.456789, 1e-10);
  }
  assert.throws(() => convert(1, 'gr', 'yd'));
});
test('imperial, metric and mixed inputs solve identically', () => {
  const reconstructed = { ...defaultScenario,
    massKg: toSI(fromSI(defaultScenario.massKg, presets.metric.mass), presets.metric.mass),
    muzzleMps: toSI(fromSI(defaultScenario.muzzleMps, presets.imperial.muzzle), presets.imperial.muzzle),
    zeroRangeM: toSI(fromSI(defaultScenario.zeroRangeM, 'm'), 'm'),
    sightHeightM: toSI(fromSI(defaultScenario.sightHeightM, 'mm'), 'mm') };
  const a = sampleAt(solveScenario(defaultScenario, 500), 321.123)!;
  const b = sampleAt(solveScenario(reconstructed, 500), 321.123)!;
  close(a.pathM, b.pathM); close(a.energyJ, b.energyJ); close(a.timeS, b.timeS);
});
test('mass changes energy without changing BC-based trajectory', () => {
  const a = sampleAt(solveScenario(defaultScenario, 400), 300)!;
  const b = sampleAt(solveScenario({ ...defaultScenario, massKg: defaultScenario.massKg * 2 }, 400), 300)!;
  close(a.speedMps, b.speedMps); close(a.pathM, b.pathM); close(a.energyJ * 2, b.energyJ);
});
test('time is monotonic and output corrections oppose displacement', () => {
  const r = solveScenario({ ...defaultScenario, windMps: 5 }, 500);
  let previous = -1;
  for (const distance of distanceGrid(0, 500, 7.123)) {
    const p = sampleAt(r, distance)!;
    assert.ok(p.timeS > previous); previous = p.timeS;
    if (distance) assert.ok(p.driftM * p.windCorrectionRad! <= 0);
  }
  assert.equal(sampleAt(r, 501), null);
});
test('validation accepts physical zero values and rejects malformed inputs', () => {
  validateScenario({ ...defaultScenario, sightHeightM: 0, inclinationDeg: 0, windMps: 0, windDeg: 0 });
  for (const overrides of [{ massKg: NaN }, { massKg: 0 }, { zeroRangeM: 0 }, { name: '' }, { windMps: -1 }]) {
    assert.throws(() => validateScenario({ ...defaultScenario, ...overrides }));
  }
});
test('distance grids preserve fractional endpoints and enforce row limits', () => {
  assert.deepEqual(distanceGrid(0, 10, 3), [0, 3, 6, 9, 10]);
  close(distanceGrid(5.5, 10.5, .3).at(-1)!, 10.5);
  assert.throws(() => distanceGrid(0, 1000, .01)); assert.throws(() => distanceGrid(5, 3, 1));
});
test('energy threshold refines a crossing instead of returning a table row', () => {
  const solution = solveScenario(defaultScenario, 1000);
  const expected = sampleAt(solution, 321.12345)!;
  const result = energyThreshold(solution, expected.energyJ);
  assert.equal(result.status, 'crossing');
  if (result.status === 'crossing') {
    close(result.point.distanceM, expected.distanceM, 2e-6); close(result.point.energyJ, expected.energyJ, 1e-4);
  }
  const endpoint = energyThreshold(solution, sampleAt(solution, 1000)!.energyJ);
  assert.equal(endpoint.status, 'crossing');
  if (endpoint.status === 'crossing') close(endpoint.point.distanceM, 1000, 2e-6);
});
test('energy threshold handles muzzle equality, already below, and no crossing', () => {
  const solution = solveScenario(defaultScenario, 100);
  const muzzle = sampleAt(solution, 0)!;
  const equality = energyThreshold(solution, muzzle.energyJ);
  assert.equal(equality.status, 'crossing'); if (equality.status === 'crossing') assert.equal(equality.point.distanceM, 0);
  assert.equal(energyThreshold(solution, muzzle.energyJ + 1).status, 'already-below');
  assert.equal(energyThreshold(solution, 1).status, 'not-reached');
  assert.throws(() => energyThreshold(solution, 0));
});
test('no-drag energy can increase: absence of a downward crossing is valid', () => {
  const core = makeCore(defaultScenario); core.retard = () => 0;
  const trajectory = core.integrate(0, { maxRange: 1000 });
  const solution: Solution = { inputs: { ...defaultScenario }, trajectory, zeroAngleDeg: 0,
    maxDistanceM: trajectory.maxRange * .9144, requestedDistanceM: 914.4, solverVersion: 'test' };
  assert.equal(energyThreshold(solution, sampleAt(solution, 0)!.energyJ - 1).status, 'not-reached');
});
test('PBR optimum satisfies the full corridor and reacts to angle perturbations', () => {
  const result = pointBlank(defaultScenario, .15, 1500);
  close(result.apex.pathM, .075, 2e-7);
  close(result.farExit.pathM, -.075, 2e-6);
  assert.ok(result.nearZero && result.farZero);
  assert.ok(result.farExit.distanceM > result.farZero!.distanceM);
  assert.equal(result.muzzleCovered, true); assert.equal(result.nearEntry.distanceM, 0);
  const higher = solveScenario(defaultScenario, 1500, result.solution.zeroAngleDeg + .0001);
  assert.ok(sampleAt(higher, result.apex.distanceM)!.pathM > result.radiusM);
  const lower = solveScenario(defaultScenario, 1500, result.solution.zeroAngleDeg - .0001);
  assert.ok(sampleAt(lower, result.farExit.distanceM)!.pathM < -result.radiusM);
});
test('PBR no-drag optimum agrees with the analytic apex constraint', () => {
  const range = 1500;
  const integrate = (angle: number): Solution => {
    const core = makeCore(defaultScenario); core.retard = () => 0;
    const trajectory = core.integrate(angle, { maxRange: range / .9144 });
    return { inputs: { ...defaultScenario }, trajectory, zeroAngleDeg: angle,
      maxDistanceM: trajectory.maxRange * .9144, requestedDistanceM: range, solverVersion: 'analytic' };
  };
  const result = pointBlank(defaultScenario, .15, range, integrate);
  const g = 32.174 * .3048, height = defaultScenario.sightHeightM;
  const vy = Math.sqrt(2 * g * (.075 + height));
  const vx = Math.sqrt(defaultScenario.muzzleMps ** 2 - vy ** 2);
  const farTime = (vy + Math.sqrt(vy ** 2 + 2 * g * (.075 - height))) / g;
  close(result.solution.zeroAngleDeg, Math.asin(vy / defaultScenario.muzzleMps) * 180 / Math.PI, 2e-7);
  close(result.farExit.distanceM, vx * farTime, .001);
});
test('PBR reports a nonzero near entry for sights taller than the radius', () => {
  const result = pointBlank(defaultScenario, .025, 1000);
  assert.equal(result.muzzleCovered, false); assert.ok(result.nearEntry.distanceM > 0);
  close(result.nearEntry.pathM, -.0125, 2e-6);
  assert.throws(() => pointBlank(defaultScenario, 0, 1000));
  assert.throws(() => pointBlank(defaultScenario, .15, 10), /coverage|exit|apex/);
});
test('saved solution snapshots, duplicate, rename, visibility and deletion are independent', () => {
  const store = new SolutionStore(); const original = solveScenario(defaultScenario, 100);
  const first = store.add(original); const copy = store.duplicate(first.id);
  original.inputs.bc = .8; assert.equal(first.result.inputs.bc, .465);
  assert.throws(() => { first.result.inputs.bc = .8; });
  store.rename(first.id, 'First load'); assert.notEqual(copy.name, first.name);
  copy.visible = false; assert.equal(store.visible().length, 1);
  store.remove(first.id); assert.equal(store.items.length, 1);
  assert.throws(() => store.get(first.id));
});
