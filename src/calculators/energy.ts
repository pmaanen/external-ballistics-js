import { sampleAt } from '../ballistics/model';
import type { Sample, Solution } from '../ballistics/model';
import { crossings } from './events';

export type EnergyResult =
  | { status: 'crossing'; point: Sample; thresholdJ: number }
  | { status: 'already-below' | 'not-reached'; thresholdJ: number; searchedM: number };
export function energyThreshold(solution: Solution, thresholdJ: number): EnergyResult {
  if (!Number.isFinite(thresholdJ) || thresholdJ <= 0) throw new Error('Energy threshold must be positive.');
  const muzzle = sampleAt(solution, 0)!;
  if (Math.abs(muzzle.energyJ - thresholdJ) < 1e-8) return { status: 'crossing', point: muzzle, thresholdJ };
  if (muzzle.energyJ < thresholdJ) return { status: 'already-below', thresholdJ, searchedM: 0 };
  const point = crossings(solution, s => s.energyJ - thresholdJ, 'down')[0];
  return point ? { status: 'crossing', point, thresholdJ }
    : { status: 'not-reached', thresholdJ, searchedM: solution.maxDistanceM };
}
