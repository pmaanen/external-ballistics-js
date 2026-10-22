import { defaultScenario, makeCore } from './model';
import type { Scenario } from './model';
import ExternalBallistics from './core.js';

export type Projectile = Pick<Scenario, 'name' | 'dragModel' | 'bc' | 'massKg' | 'muzzleMps'>;
export interface FlightPoint {
  timeS: number; distanceM: number; heightM: number;
  vxMps: number; vyMps: number; axMps2: number; ayMps2: number;
  speedMps: number; energyJ: number;
}
export interface GroundFlight {
  projectile: Projectile; launchHeightM: number; angleDeg: number;
  points: FlightPoint[]; impact: FlightPoint; steps: number;
}
export interface FlightOptions {
  maxTimeS?: number; maxSteps?: number; maxStepS?: number;
  // SI drag acceleration; permits independent analytic validation of this engine.
  dragLaw?: (speedMps: number) => number;
}
export const gravityMps2 = -new ExternalBallistics().DEFAULT_GRAVITY * 0.3048;
export function projectileFrom(s: Projectile): Projectile {
  return { name: s.name, dragModel: s.dragModel, bc: s.bc, massKg: s.massKg, muzzleMps: s.muzzleMps };
}
export function validateProjectile(p: Projectile): void { makeCore({ ...defaultScenario, ...projectileFrom(p) }); }
function finite(name: string, value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
}
type State = [number, number, number, number]; // horizontal x, height, vx, vy, SI
function add(s: State, d: State, dt: number): State { return s.map((v, i) => v + d[i] * dt) as State; }

// This engine uses time, independently of the sight-line/forward-slope limits
// in the legacy solver. Every successful flight ends at first ground impact.
export function groundFlight(p: Projectile, angleDeg: number, launchHeightM: number, options: FlightOptions = {}): GroundFlight {
  validateProjectile(p);
  finite('Launch angle (degrees)', angleDeg, 0, 90);
  finite('Muzzle height (m)', launchHeightM, 0, 1000);
  const maxTime = finite('Flight time limit (s)', options.maxTimeS ?? 600, .001, 1200);
  const maxSteps = finite('Flight step limit', options.maxSteps ?? 100000, 1, 200000);
  const maxStep = finite('Maximum time step (s)', options.maxStepS ?? .2, .00001, .5);
  const core = makeCore({ ...defaultScenario, ...projectileFrom(p) });
  const dragLaw = options.dragLaw ?? ((speed: number) => core.retard(speed / .3048) * .3048);
  function derivative(s: State): State {
    if (!s.every(Number.isFinite)) throw new Error('Flight left the finite numerical domain.');
    const speed = Math.hypot(s[2], s[3]);
    const drag = speed > 1e-10 ? dragLaw(speed) : 0;
    if (!Number.isFinite(drag) || drag < 0) throw new Error('Drag acceleration must be finite and nonnegative.');
    return [s[2], s[3], speed > 1e-10 ? -drag * s[2] / speed : 0,
      -gravityMps2 + (speed > 1e-10 ? -drag * s[3] / speed : 0)];
  }
  function rk4(s: State, dt: number): State {
    const a = derivative(s), b = derivative(add(s, a, dt / 2));
    const c = derivative(add(s, b, dt / 2)), d = derivative(add(s, c, dt));
    return s.map((v, i) => v + dt * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6) as State;
  }
  function point(s: State, timeS: number): FlightPoint {
    const d = derivative(s), speedMps = Math.hypot(s[2], s[3]);
    return { timeS, distanceM: s[0], heightM: s[1], vxMps: s[2], vyMps: s[3],
      axMps2: d[2], ayMps2: d[3], speedMps, energyJ: .5 * p.massKg * speedMps ** 2 };
  }
  const rad = angleDeg * Math.PI / 180;
  let s: State = [0, launchHeightM, p.muzzleMps * Math.cos(rad), p.muzzleMps * Math.sin(rad)];
  let time = 0, dt = Math.min(.01, maxStep);
  const points = [point(s, 0)];
  if (launchHeightM === 0 && angleDeg === 0) return { projectile: projectileFrom(p), launchHeightM, angleDeg, points, impact: points[0], steps: 0 };
  for (let steps = 0; steps < maxSteps; steps++) {
    dt = Math.min(dt, maxTime - time);
    if (dt < 1e-8) throw new Error('Flight time limit reached before ground impact; maximum range is unknown.');
    const full = rk4(s, dt), half = rk4(s, dt / 2), fine = rk4(half, dt / 2);
    // Piecewise GNU drag coefficients can make adaptive step choices sensitive
    // to floating-point differences. Keep local error well below the global
    // range/impact refinement bounds, including across coefficient boundaries.
    const error = Math.max(...fine.map((v, i) => Math.abs(v - full[i]) / (15 * (1e-7 + 1e-10 * Math.max(Math.abs(v), Math.abs(s[i]))))));
    if (!Number.isFinite(error)) throw new Error('Flight could not be resolved numerically.');
    if (error > 1) { dt *= Math.max(.1, .9 * error ** -.2); continue; }
    const next = point(fine, time + dt);
    const previous = points[points.length - 1];
    if (next.heightM <= 0 && next.vyMps < 0) {
      // A shallow launch from ground can rise and land inside the first
      // accepted step. Bracket after its apex so t=0 is not mistaken for impact.
      const start = previous.heightM === 0 && previous.vyMps > 0
        ? refineFlightEvent(previous, next, p.massKg, point => point.vyMps) : previous;
      const impact = refineFlightEvent(start, next, p.massKg, point => point.heightM);
      impact.heightM = 0;
      points.push(impact);
      return { projectile: projectileFrom(p), launchHeightM, angleDeg, points, impact, steps: steps + 1 };
    }
    points.push(next); s = fine; time += dt;
    dt = Math.min(maxStep, dt * Math.min(4, error > 0 ? Math.max(.2, .9 * error ** -.2) : 4));
  }
  throw new Error('Flight step limit reached before ground impact; maximum range is unknown.');
}

function cubic(a: number, b: number, da: number, db: number, dt: number, u: number): number {
  return (2 * u ** 3 - 3 * u ** 2 + 1) * a + (u ** 3 - 2 * u ** 2 + u) * dt * da
    + (-2 * u ** 3 + 3 * u ** 2) * b + (u ** 3 - u ** 2) * dt * db;
}
function cubicRate(a: number, b: number, da: number, db: number, dt: number, u: number): number {
  return ((6 * u ** 2 - 6 * u) * a + (3 * u ** 2 - 4 * u + 1) * dt * da
    + (-6 * u ** 2 + 6 * u) * b + (3 * u ** 2 - 2 * u) * dt * db) / dt;
}
export function interpolateFlight(a: FlightPoint, b: FlightPoint, massKg: number, timeS: number): FlightPoint {
  const dt = b.timeS - a.timeS;
  if (dt <= 0) return { ...a };
  const u = Math.max(0, Math.min(1, (timeS - a.timeS) / dt));
  const vxMps = cubic(a.vxMps, b.vxMps, a.axMps2, b.axMps2, dt, u);
  const vyMps = cubic(a.vyMps, b.vyMps, a.ayMps2, b.ayMps2, dt, u);
  const speedMps = Math.hypot(vxMps, vyMps);
  return { timeS: a.timeS + u * dt,
    distanceM: cubic(a.distanceM, b.distanceM, a.vxMps, b.vxMps, dt, u),
    heightM: cubic(a.heightM, b.heightM, a.vyMps, b.vyMps, dt, u),
    vxMps, vyMps, speedMps, energyJ: .5 * massKg * speedMps ** 2,
    axMps2: cubicRate(a.vxMps, b.vxMps, a.axMps2, b.axMps2, dt, u),
    ayMps2: cubicRate(a.vyMps, b.vyMps, a.ayMps2, b.ayMps2, dt, u) };
}
export function refineFlightEvent(a: FlightPoint, b: FlightPoint, mass: number, f: (point: FlightPoint) => number): FlightPoint {
  let lo = a.timeS, hi = b.timeS;
  const fa = f(a);
  if (Math.abs(fa) < 1e-12) return { ...a };
  for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2, p = interpolateFlight(a, b, mass, mid), fm = f(p);
    if (Math.abs(fm) < 1e-12) return p;
    if (Math.sign(fm) === Math.sign(fa)) lo = mid; else hi = mid;
  }
  return interpolateFlight(a, b, mass, (lo + hi) / 2);
}
