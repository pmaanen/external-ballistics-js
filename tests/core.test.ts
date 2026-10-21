import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import B from '../src/ballistics/core.js';
import type { LegacyInputs } from '../src/ballistics/core.js';

const baseline: LegacyInputs = { dragFunction: 'G1', dragCoefficient: .465, muzzleVelocity: 2650,
  sightHeight: 1.6, shootingAngle: 0, windSpeed: 0, windAngle: 0, zeroRange: 200 };
function core(overrides: Partial<LegacyInputs> = {}) { const b = new B(); b.setVariables({ ...baseline, ...overrides }); return b; }
function close(a: number, b: number, tolerance = 1e-7) { assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b} ± ${tolerance}`); }

test('R8: classic and module entry points work without numerical global leaks', () => {
  const context = vm.createContext({ inputs: baseline });
  vm.runInContext(readFileSync(new URL('../src/external-ballistics.js', import.meta.url), 'utf8'), context);
  vm.runInContext('new ExternalBallistics().setVariables(inputs);', context, { timeout: 1000 });
  vm.runInContext('const b = new ExternalBallistics(); b.setVariables(inputs); b.solveAll({maxRange:300});', context, { timeout: 1000 });
  assert.deepEqual(Object.keys(context).sort(), ['ExternalBallistics', 'inputs']);
});
test('R1: calm wind is independent of direction', () => {
  const values = [0, 90, 180, 270, -90, 450].map(windAngle => {
    const b = core({ windAngle }); b.solveAll({ maxRange: 300 }); return b.sampleAt(300)!;
  });
  for (const p of values) close(p.velocity, values[0].velocity);
});
test('R1: cardinal wind components and drift signs are correct', () => {
  const b = core();
  close(b.getHeadWind(10, 0), 10); close(b.getHeadWind(10, 90), 0);
  close(b.getHeadWind(10, 180), -10); close(b.getCrossWind(10, 90), 10);
  close(b.getCrossWind(10, 270), -10); close(b.getCrossWind(10, -90), -10);
  const left = core({ windSpeed: 10, windAngle: 90 }); left.solveAll({ maxRange: 300 });
  const right = core({ windSpeed: 10, windAngle: 270 }); right.solveAll({ maxRange: 300 });
  assert.ok(left.getWindage(300)! > 0);
  close(left.getWindage(300)!, -right.getWindage(300)!, 1e-6);
});
test('R5: headwind is converted to ft/s before drag evaluation', () => {
  const b = core({ windSpeed: 10, windAngle: 0 });
  const original = b.retard.bind(b); const speeds: number[] = [];
  b.retard = v => { speeds.push(v); return original(v); };
  b.integrate(0, { maxRange: .01 });
  close(speeds[0], 2650 + 10 * 22 / 15);
});
test('R2: invalid input and drag models throw promptly', () => {
  for (const values of [{ dragCoefficient: 0 }, { dragCoefficient: -.1 }, { dragFunction: 'BAD' },
    { muzzleVelocity: NaN }, { muzzleVelocity: Infinity }, { muzzleVelocity: 0 },
    { muzzleVelocity: 10000 }, { sightHeight: undefined }, { zeroRange: 0 },
    { shootingAngle: '10' }]) {
    assert.throws(() => core(values as Partial<LegacyInputs>), /must|supported|Choose/);
  }
  assert.throws(() => core().retard(-1)); assert.throws(() => core().retard(10000));
});
test('R2: integrations terminate at configured step, time and model limits', () => {
  const b = core();
  assert.equal(b.integrate(0, { maxRange: 500, maxSteps: 1 }).termination, 'step-limit');
  assert.equal(b.integrate(0, { maxRange: 500, maxTime: .001 }).termination, 'time-limit');
  const fast = core({ muzzleVelocity: 9999, windSpeed: 200, windAngle: 0 });
  assert.throws(() => fast.integrate(0), /airspeed/);
});
test('R3: exact yard samples, fractional API, validated indices and missing coverage', () => {
  const b = core(); b.solveAll({ maxRange: 300.5 });
  close(b.getRange(100)!, 100); assert.throws(() => b.getVelocity(.2), /integer/);
  assert.throws(() => b.getVelocity(-1)); assert.equal(b.getVelocity(301), null);
  const p = b.sampleAt(100 / .9144)!; close(p.range * .9144, 100);
  assert.ok(Number.isFinite(p.velocity)); assert.equal(b.sampleAt(301), null);
  close(b.sampleAt(300.5)!.range, 300.5);
});
test('R4/R9: vacuum trajectory samples match analytic position, time and velocity', () => {
  const b = core(); b.retard = () => 0;
  const angle = .3, rad = angle * Math.PI / 180;
  const result = b.integrate(angle, { maxRange: 1000 });
  for (const yards of [0, .2, 100 / .9144, 500, 1000]) {
    const p = B.sample(result, yards)!;
    const time = yards * 3 / (2650 * Math.cos(rad));
    const vy = 2650 * Math.sin(rad) - 32.174 * time;
    close(p.time, time, 1e-10);
    close(p.path, -1.6 + 12 * (2650 * Math.sin(rad) * time - 32.174 / 2 * time ** 2), 1e-6);
    close(p.velocityY, vy, 1e-8); close(p.velocity, Math.hypot(p.velocityX, p.velocityY), 1e-10);
  }
  const muzzle = B.sample(result, 0)!;
  assert.equal(muzzle.time, 0); assert.equal(muzzle.windage, 0);
  assert.equal(muzzle.moa, null); assert.equal(muzzle.windageMOA, null);
});
test('inclined gravity is resolved against the sight axis, independently of bore angle', () => {
  const b = core({ shootingAngle: 30 }); b.retard = () => 0;
  const r = b.integrate(.3, { maxRange: 100 });
  const rad = .3 * Math.PI / 180, vx = 2650 * Math.cos(rad), vy = 2650 * Math.sin(rad);
  const gx = -32.174 * .5, gy = -32.174 * Math.cos(Math.PI / 6), x = 300;
  const t = 2 * x / (vx + Math.sqrt(vx * vx + 2 * gx * x));
  const p = B.sample(r, 100)!;
  close(p.time, t, 1e-10); close(p.path, -1.6 + 12 * (vy * t + gy / 2 * t * t), 1e-6);
});
test('R6/R7: zero reaches the exact distance and honors intercept inches', () => {
  for (const yIntercept of [-1, 0, 1]) {
    const b = core({ yIntercept }); b.solveAll({ maxRange: 200 });
    close(b.getPath(200)!, yIntercept, 2e-6);
  }
  const b = core({ zeroRange: 10000 });
  assert.throws(() => b.getZeroAngle(), /reachable|exceeds|converge/);
});
test('R11: record capacity and inclusive requested endpoint are unambiguous', () => {
  const b = core(); b.BCOMP_MAXRANGE = 10; b.solveAll();
  assert.equal(b.maximumValidRange, 10); close(b.getRange(9)!, 9); assert.equal(b.getRange(10), null);
  assert.throws(() => b.solveAll({ maxRange: 10 }), /capacity/);
});
test('successive solves clear stale data and instances remain independent', () => {
  const a = core(), b = core({ muzzleVelocity: 3000 });
  a.solveAll({ maxRange: 300 }); const old = a.getVelocity(300);
  b.solveAll({ maxRange: 300 }); assert.equal(a.getVelocity(300), old);
  a.solveAll({ maxRange: 100 }); assert.equal(a.getVelocity(300), null);
});

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/reference.json', import.meta.url), 'utf8'));
test('all six drag tables match 60 pinned C fixtures', () => {
  for (const row of fixtures.drag) {
    const value = core({ dragFunction: row.model, dragCoefficient: row.bc }).retard(row.speed);
    close(value, row.retard, Math.abs(value) * 1e-12);
  }
});
test('corrected calm trajectories remain consistent with historical C results', () => {
  // C's loose zero, stepped positions and Euler integration justify these
  // historical tolerances; tighter independent accuracy checks are below.
  for (const trajectory of fixtures.trajectories) {
    const b = core({ dragFunction: trajectory.model }); b.solveAll({ maxRange: 501 });
    for (const row of trajectory.samples) {
      const p = b.sampleAt(row.range)!;
      close(p.velocity, row.speed, .6); close(p.path, row.path, .2); close(p.time, row.time, .0006);
    }
  }
});
test('step refinement bounds the numerical error for each supported drag model', () => {
  for (const dragFunction of ['G1', 'G2', 'G5', 'G6', 'G7', 'G8']) {
    const b = core({ dragFunction }); const angle = b.getZeroAngle();
    const normal = B.sample(b.integrate(angle, { maxRange: 1000 }), 1000)!;
    const fine = B.sample(b.integrate(angle, { maxRange: 1000, stepFeet: .375 }), 1000)!;
    close(normal.velocity, fine.velocity, .06); close(normal.path, fine.path, .015); close(normal.time, fine.time, .00003);
  }
});
