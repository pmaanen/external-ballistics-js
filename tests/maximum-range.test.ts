import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultScenario } from '../src/ballistics/model';
import { groundFlight, gravityMps2, interpolateFlight } from '../src/ballistics/flight';
import { maximumRange, flightEnergy } from '../src/calculators/maximum-range';
const vacuum = { dragLaw: () => 0 };
function close(a: number, b: number, tolerance: number) { assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b} ± ${tolerance}`); }

test('time-based ground flights agree with vacuum impact and energy identities', () => {
  const p = { ...defaultScenario, muzzleMps: 100 }, height = 1.5;
  for (const angle of [0, 15, 45, 80, 90]) {
    const r = groundFlight(p, angle, height, vacuum);
    const rad = angle * Math.PI / 180, vx = 100 * Math.cos(rad), vy = 100 * Math.sin(rad);
    const time = (vy + Math.sqrt(vy ** 2 + 2 * gravityMps2 * height)) / gravityMps2;
    close(r.impact.timeS, time, 1e-7); close(r.impact.distanceM, vx * time, 1e-5);
    close(r.impact.energyJ, .5 * p.massKg * 100 ** 2 + p.massKg * gravityMps2 * height, 1e-6);
    assert.equal(r.impact.heightM, 0); assert.ok(r.points.slice(0, -1).every(p => p.heightM >= 0));
    const a = r.points[1], b = r.points[2], mid = interpolateFlight(a, b, p.massKg, (a.timeS + b.timeS) / 2);
    close(mid.distanceM, vx * mid.timeS, 1e-8);
    close(mid.heightM, height + vy * mid.timeS - gravityMps2 * mid.timeS ** 2 / 2, 1e-8);
  }
});
test('maximum-range search recovers the analytic vacuum optimum at two heights', () => {
  const p = { ...defaultScenario, muzzleMps: 100 };
  for (const height of [0, 20]) {
    const r = maximumRange(p, height, 30, vacuum);
    const angle = Math.atan(100 / Math.sqrt(100 ** 2 + 2 * gravityMps2 * height)) * 180 / Math.PI;
    const range = 100 / gravityMps2 * Math.sqrt(100 ** 2 + 2 * gravityMps2 * height);
    close(r.flight.angleDeg, angle, .0002); close(r.flight.impact.distanceM, range, 1e-5);
  }
});
test('all drag models complete ground impact and a verified local maximum', () => {
  for (const dragModel of ['G1', 'G2', 'G5', 'G6', 'G7', 'G8'] as const) {
    const p = { ...defaultScenario, dragModel };
    const r = maximumRange(p, 1.5, 100);
    assert.equal(r.assumptions, 'flat-ground-calm-wind');
    assert.ok(r.flight.impact.distanceM > 1000 && r.apex.heightM > 100);
    for (const offset of [-.1, .1]) assert.ok(groundFlight(p, r.flight.angleDeg + offset, 1.5).impact.distanceM <= r.flight.impact.distanceM + .01);
    assert.ok(r.flight.impact.vyMps < 0, 'complete descending impact');
    for (let i = 1; i < r.flight.points.length; i++) assert.ok(r.flight.points[i].timeS > r.flight.points[i - 1].timeS);
  }
});
test('energy crossing is on the maximum-range trajectory and includes possible descent re-entry', () => {
  const r = maximumRange(defaultScenario, 1.5, 1500);
  assert.ok(r.energy.firstDownward);
  close(r.energy.firstDownward!.energyJ, 1500, .0001);
  assert.ok(r.energy.firstDownward!.distanceM < r.flight.impact.distanceM);
  const minimum = Math.min(...r.flight.points.map(p => p.energyJ));
  assert.ok(r.flight.impact.energyJ > minimum);
  const threshold = (minimum + r.flight.impact.energyJ) / 2;
  const rebound = flightEnergy(r.flight, threshold);
  assert.equal(rebound.crossings.length, 2);
  assert.equal(rebound.crossings[0].direction, 'down'); assert.equal(rebound.crossings[1].direction, 'up');
  assert.equal(rebound.impactAboveThreshold, true);
  for (const event of rebound.crossings) close(event.point.energyJ, threshold, .0001);
});
test('energy edge cases do not imply safety beyond a threshold', () => {
  const r = maximumRange(defaultScenario, 1.5, 1);
  assert.equal(r.energy.firstDownward, null); assert.equal(r.energy.impactAboveThreshold, true);
  const start = r.flight.points[0].energyJ;
  assert.equal(flightEnergy(r.flight, start + 1).initial, 'below');
  assert.equal(flightEnergy(r.flight, start).firstDownward?.timeS, 0);
  assert.throws(() => flightEnergy(r.flight, 0));
});
test('mass affects energy but not the BC-based range or maximum angle', () => {
  const a = maximumRange(defaultScenario, 1.5, 100);
  const b = maximumRange({ ...defaultScenario, massKg: defaultScenario.massKg * 2 }, 1.5, 100);
  close(a.flight.impact.distanceM, b.flight.impact.distanceM, 1e-8);
  close(a.flight.angleDeg, b.flight.angleDeg, 1e-8); close(a.flight.impact.energyJ * 2, b.flight.impact.energyJ, 1e-8);
});
test('refined time steps preserve the maximum-range result', () => {
  const a = maximumRange(defaultScenario, 1.5, 1500);
  const b = groundFlight(defaultScenario, a.flight.angleDeg, 1.5, { maxStepS: .025 });
  close(a.flight.impact.distanceM, b.impact.distanceM, .02);
  close(a.flight.impact.timeS, b.impact.timeS, .001);
  close(a.flight.impact.energyJ, b.impact.energyJ, .01);
});
test('invalid inputs and incomplete flights fail without reporting a maximum', () => {
  assert.throws(() => maximumRange({ ...defaultScenario, bc: 0 }, 1.5, 50));
  assert.throws(() => maximumRange(defaultScenario, -1, 50));
  assert.throws(() => maximumRange(defaultScenario, 1.5, NaN));
  assert.throws(() => maximumRange(defaultScenario, 1.5, 50, { maxTimeS: .01 }), /before ground impact/);
  assert.throws(() => groundFlight(defaultScenario, 45, 1.5, { maxSteps: 1 }), /before ground impact/);
  assert.throws(() => groundFlight(defaultScenario, 91, 1.5));
  assert.throws(() => groundFlight(defaultScenario, 45, 1.5, { dragLaw: () => -1 }));
});

test('steep flights continue past the legacy slope limit to ground', () => {
  const r = groundFlight(defaultScenario, 80, 1.5);
  assert.ok(r.points.some(p => -p.vyMps > 3 * p.vxMps));
  assert.equal(r.impact.heightM, 0);
});

test('a shallow ground launch landing within its first step does not return muzzle impact', () => {
  const p = { ...defaultScenario, muzzleMps: 100 };
  const r = groundFlight(p, .001, 0, vacuum);
  const expected = 2 * 100 * Math.sin(.001 * Math.PI / 180) / gravityMps2;
  close(r.impact.timeS, expected, 1e-9);
  assert.ok(r.impact.distanceM > 0 && r.impact.vyMps < 0);
});
