import ExternalBallistics from './core.js';
import type { CoreResult, LegacyInputs } from './core.js';
import { fromSI, toSI } from './units';

export const dragModels = ['G1', 'G2', 'G5', 'G6', 'G7', 'G8'] as const;
export type DragModel = typeof dragModels[number];
export interface Scenario {
  name: string;
  dragModel: DragModel;
  bc: number;
  massKg: number;
  muzzleMps: number;
  sightHeightM: number;
  zeroRangeM: number;
  inclinationDeg: number;
  windMps: number;
  windDeg: number;
}
export interface Solution {
  inputs: Scenario;
  trajectory: CoreResult;
  zeroAngleDeg: number;
  maxDistanceM: number;
  requestedDistanceM: number;
  solverVersion: string;
}
export interface Sample {
  distanceM: number; pathM: number; timeS: number; speedMps: number;
  vxMps: number; vyMps: number; energyJ: number; driftM: number;
  elevationRad: number | null; windCorrectionRad: number | null;
}
export class ScenarioValidationError extends Error {
  constructor(public field: keyof Scenario, message: string) {
    super(message); this.name = 'ScenarioValidationError';
  }
}
export const defaultScenario: Scenario = {
  name: '.308 Win · 168 gr Match', dragModel: 'G1', bc: 0.465,
  massKg: toSI(168, 'gr'), muzzleMps: toSI(2650, 'ft/s'),
  sightHeightM: toSI(1.6, 'in'), zeroRangeM: toSI(200, 'yd'),
  inclinationDeg: 0, windMps: 0, windDeg: 90,
};

export function validateScenario(s: Scenario): void {
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 100) throw new ScenarioValidationError('name', 'Name your solution (1–100 characters).');
  if (!dragModels.includes(s.dragModel)) throw new ScenarioValidationError('dragModel', 'Choose a supported drag model.');
  const ranges: [keyof Scenario, number, number, string][] = [
    ['bc', 0.001, 10, 'BC'], ['massKg', 0.000001, 1, 'Projectile mass (kg)'],
    ['muzzleMps', 0.3048, 3047, 'Muzzle velocity (m/s)'],
    ['sightHeightM', 0, 2.54, 'Sight height (m)'], ['zeroRangeM', 0.01, 10000, 'Zero range (m)'],
    ['inclinationDeg', -89, 89, 'Shooting angle (degrees)'], ['windMps', 0, 89.408, 'Wind speed (m/s)'],
    ['windDeg', -3600, 3600, 'Wind direction (degrees)'],
  ];
  for (const [key, min, max, label] of ranges) {
    const n = s[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
      throw new ScenarioValidationError(key, `${label} must be between ${min} and ${max}.`);
    }
  }
}
export function legacyInputs(s: Scenario): LegacyInputs {
  validateScenario(s);
  return { dragFunction: s.dragModel, dragCoefficient: s.bc,
    muzzleVelocity: fromSI(s.muzzleMps, 'ft/s'), sightHeight: fromSI(s.sightHeightM, 'in'),
    zeroRange: fromSI(s.zeroRangeM, 'yd'), shootingAngle: s.inclinationDeg,
    windSpeed: fromSI(s.windMps, 'mph'), windAngle: s.windDeg };
}
export function makeCore(s: Scenario): ExternalBallistics {
  const core = new ExternalBallistics();
  core.setVariables(legacyInputs(s));
  return core;
}
export function solveScenario(s: Scenario, maxDistanceM: number, boreAngleDeg?: number): Solution {
  if (!Number.isFinite(maxDistanceM) || maxDistanceM < 0.01 || maxDistanceM > 10000) {
    throw new Error('Calculation distance must be between 0.01 and 10,000 m.');
  }
  const core = makeCore(s);
  const zeroAngleDeg = boreAngleDeg ?? core.getZeroAngle();
  const trajectory = core.integrate(zeroAngleDeg, { maxRange: fromSI(maxDistanceM, 'yd') });
  return { inputs: { ...s }, trajectory, zeroAngleDeg, maxDistanceM: toSI(trajectory.maxRange, 'yd'),
    requestedDistanceM: maxDistanceM, solverVersion: ExternalBallistics.VERSION };
}
export function sampleAt(solution: Solution, distanceM: number): Sample | null {
  if (!Number.isFinite(distanceM) || distanceM < 0) throw new Error('Distance must be a nonnegative finite number.');
  if (distanceM > solution.maxDistanceM + 1e-8) return null;
  const s = ExternalBallistics.sample(solution.trajectory, fromSI(distanceM, 'yd'));
  if (!s) return null;
  const speedMps = toSI(s.velocity, 'ft/s');
  return { distanceM: toSI(s.range, 'yd'), pathM: toSI(s.path, 'in'), timeS: s.time,
    speedMps, vxMps: toSI(s.velocityX, 'ft/s'), vyMps: toSI(s.velocityY, 'ft/s'),
    energyJ: 0.5 * solution.inputs.massKg * speedMps ** 2, driftM: toSI(s.windage, 'in'),
    elevationRad: s.moa === null ? null : toSI(s.moa, 'MOA'),
    windCorrectionRad: s.windageMOA === null ? null : -toSI(s.windageMOA, 'MOA') };
}
export function distances(solution: Solution): number[] {
  return solution.trajectory.points.map(p => p.x * 0.3048);
}
export function distanceGrid(min: number, max: number, step: number): number[] {
  if (![min, max, step].every(Number.isFinite) || min < 0 || max <= min || max > 10000 || step <= 0) {
    throw new Error('Use 0 ≤ minimum < maximum ≤ 10,000 m and a positive table step.');
  }
  const count = Math.floor((max - min) / step + 1e-9);
  if (count > 1999) throw new Error('Use a larger step: the table is limited to 2,000 rows.');
  const grid = Array.from({ length: count + 1 }, (_, i) => min + i * step);
  if (max - grid[grid.length - 1] > 1e-7) grid.push(max);
  if (grid.length > 2000) throw new Error('Use a larger step: the table is limited to 2,000 rows.');
  return grid;
}
