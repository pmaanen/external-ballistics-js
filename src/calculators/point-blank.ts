import { distances, sampleAt, solveScenario } from '../ballistics/model';
import type { Sample, Scenario, Solution } from '../ballistics/model';
import { crossings } from './events';

export interface PointBlankResult {
  solution: Solution; radiusM: number; nearEntry: Sample; farExit: Sample;
  apex: Sample; nearZero: Sample | null; farZero: Sample | null; muzzleCovered: boolean;
}
export function apexOf(solution: Solution): Sample {
  const candidates = [sampleAt(solution, 0)!, sampleAt(solution, solution.maxDistanceM)!,
    ...crossings(solution, p => p.vyMps, 'down')];
  return candidates.reduce((a, b) => a.pathM > b.pathM ? a : b);
}
export function pointBlank(scenario: Scenario, diameterM: number, searchM: number,
  integrate: (angle: number) => Solution = angle => solveScenario(scenario, searchM, angle)): PointBlankResult {
  if (!Number.isFinite(diameterM) || diameterM <= 0 || diameterM > 5) throw new Error('Target diameter must be positive and at most 5 m.');
  const radiusM = diameterM / 2;
  let low = 0, high = 0.01;
  let upper = integrate(high);
  for (let i = 0; i < 14 && apexOf(upper).pathM < radiusM; i++) {
    high = Math.min(45, high * 2);
    upper = integrate(high);
    if (high === 45) break;
  }
  if (apexOf(upper).pathM < radiusM) throw new Error('No feasible optimum within the search distance and angle limits.');
  let solution = upper;
  for (let i = 0; i < 36; i++) {
    const angle = (low + high) / 2;
    solution = integrate(angle);
    const peak = apexOf(solution);
    if (peak.pathM > radiusM) high = angle; else low = angle;
    if (Math.abs(peak.pathM - radiusM) < 1e-8) break;
  }
  const apex = apexOf(solution);
  if (apex.distanceM >= solution.maxDistanceM - 1e-4 || apex.vyMps > 1e-3) {
    throw new Error('The trajectory apex is beyond verified coverage. Increase the search distance.');
  }
  const muzzle = sampleAt(solution, 0)!;
  const muzzleCovered = muzzle.pathM >= -radiusM;
  const nearEntry = muzzleCovered ? muzzle : crossings(solution, p => p.pathM + radiusM, 'up')[0];
  const farExit = crossings(solution, p => p.pathM + radiusM, 'down').find(p => p.distanceM > apex.distanceM);
  if (!nearEntry || !farExit) throw new Error(`Corridor exit not reached within ${solution.maxDistanceM.toFixed(0)} m. Increase the search distance.`);
  const zeros = crossings(solution, p => p.pathM);
  const nearZero = zeros.find(p => p.distanceM <= apex.distanceM) ?? null;
  const farZero = zeros.find(p => p.distanceM > apex.distanceM) ?? null;
  // Verify the actual interval, not merely the root-search objective.
  for (const x of distances(solution)) {
    if (x > nearEntry.distanceM && x < farExit.distanceM) {
      const height = sampleAt(solution, x)!.pathM;
      if (height > radiusM + 1e-6 || height < -radiusM - 1e-6) throw new Error('Point-blank corridor verification failed.');
    }
  }
  solution.inputs = { ...solution.inputs, name: `${scenario.name} · PBR`.slice(0, 100),
    zeroRangeM: farZero?.distanceM ?? scenario.zeroRangeM };
  return { solution, radiusM, nearEntry, farExit, apex, nearZero, farZero, muzzleCovered };
}
