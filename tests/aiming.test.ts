import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultScenario, sampleAt, solveScenario, validateScenario } from '../src/ballistics/model';
import { maximumRange } from '../src/calculators/maximum-range';
import { configuredTrajectory } from '../src/calculators/trajectory';
import { pointBlank } from '../src/calculators/point-blank';
const close = (a: number, b: number, tol = 1e-7) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test('zero-height input reaches positive and negative SI offsets at fractional zero range', () => {
  for (const zeroHeightM of [-.05, 0, .08]) {
    const s = { ...defaultScenario, zeroRangeM: 123.4567, zeroHeightM };
    close(sampleAt(solveScenario(s, 500), s.zeroRangeM)!.pathM, zeroHeightM);
  }
  assert.throws(() => validateScenario({ ...defaultScenario, zeroHeightM: NaN }));
  assert.throws(() => validateScenario({ ...defaultScenario, zeroHeightM: 3 }));
});

test('manual angles bypass zeroing and preserve explicit angle in snapshots', () => {
  const s = { ...defaultScenario, aimMode: 'angle' as const, boreAngleDeg: 2, zeroRangeM: NaN, zeroHeightM: NaN };
  const result = configuredTrajectory(s, 500);
  const expected = solveScenario(defaultScenario, 500, 2);
  close(result.zeroAngleDeg, 2);
  close(sampleAt(result, 123.456)!.pathM, sampleAt(expected, 123.456)!.pathM);
  assert.equal(result.inputs.aimMode, 'angle');
  for (const boreAngleDeg of [NaN, -46, 46]) assert.throws(() => configuredTrajectory({ ...s, boreAngleDeg }, 500));
  assert.throws(() => validateScenario({ ...defaultScenario, aimMode: 'bad' as 'zero' }));
});

test('optimum angle matches complete ground-range search, independent of sight zero', () => {
  const s = { ...defaultScenario, aimMode: 'maximum-range' as const, launchHeightM: 1.5, zeroRangeM: NaN, zeroHeightM: NaN };
  const expected = maximumRange(s, s.launchHeightM, 1);
  const result = configuredTrajectory(s, 1000);
  close(result.zeroAngleDeg, expected.flight.angleDeg);
  const extended = solveScenario(result.inputs, 2000, result.zeroAngleDeg);
  close(sampleAt(result, 999)!.pathM, sampleAt(extended, 999)!.pathM);
  assert.throws(() => configuredTrajectory({ ...s, launchHeightM: -1 }, 1000));
  assert.throws(() => configuredTrajectory({ ...s, windMps: 1 }, 1000));
});

test('PBR reports height at chosen zero range and saved angle reproduces its full trajectory', () => {
  const s = { ...defaultScenario, zeroRangeM: 100.123 };
  const result = pointBlank(s, .15, 1500);
  assert.ok(result.zeroAtRange);
  close(result.zeroRangeM, s.zeroRangeM);
  close(result.zeroAtRange!.pathM, sampleAt(result.solution, s.zeroRangeM)!.pathM);
  assert.equal(result.solution.inputs.aimMode, 'angle');
  close(result.solution.inputs.zeroRangeM, s.zeroRangeM);
  close(result.solution.inputs.zeroHeightM, result.zeroAtRange!.pathM);
  const saved = configuredTrajectory(result.solution.inputs, 1500);
  for (const x of [0, 100.123, result.farExit.distanceM, 1000]) {
    close(sampleAt(saved, x)!.pathM, sampleAt(result.solution, x)!.pathM);
    close(sampleAt(saved, x)!.timeS, sampleAt(result.solution, x)!.timeS);
  }
  const rezeroed = configuredTrajectory({ ...result.solution.inputs, aimMode: 'zero' }, 1500);
  close(rezeroed.zeroAngleDeg, result.solution.zeroAngleDeg, 1e-6);
});

test('PBR zero-height reporting handles negative offsets and missing reference coverage', () => {
  const negative = pointBlank({ ...defaultScenario, zeroRangeM: 500 }, .15, 1500);
  assert.ok(negative.zeroAtRange!.pathM < 0);
  const missing = pointBlank({ ...defaultScenario, zeroRangeM: 2000 }, .15, 1000);
  assert.equal(missing.zeroAtRange, null);
  assert.throws(() => pointBlank({ ...defaultScenario, zeroRangeM: 0 }, .15, 1000));
});
