import { distances, sampleAt } from '../ballistics/model';
import type { Sample, Solution } from '../ballistics/model';

export function refine(solution: Solution, a: number, b: number, f: (p: Sample) => number): Sample {
  let fa = f(sampleAt(solution, a)!);
  if (Math.abs(fa) < 1e-12) return sampleAt(solution, a)!;
  for (let i = 0; i < 55 && b - a > 1e-6; i++) {
    const mid = (a + b) / 2;
    const fm = f(sampleAt(solution, mid)!);
    if (Math.abs(fm) < 1e-12) return sampleAt(solution, mid)!;
    if (Math.sign(fm) === Math.sign(fa)) { a = mid; fa = fm; } else b = mid;
  }
  return sampleAt(solution, (a + b) / 2)!;
}
export function crossings(solution: Solution, f: (p: Sample) => number, direction: 'up' | 'down' | 'both' = 'both'): Sample[] {
  const xs = distances(solution), found: Sample[] = [];
  for (let i = 1; i < xs.length; i++) {
    const a = f(sampleAt(solution, xs[i - 1])!), b = f(sampleAt(solution, xs[i])!);
    const up = (a < 0 && b >= 0) || (a === 0 && b > 0);
    const down = (a > 0 && b <= 0) || (a === 0 && b < 0);
    if ((up && direction !== 'down') || (down && direction !== 'up')) {
      const point = refine(solution, xs[i - 1], xs[i], f);
      if (!found.length || point.distanceM - found[found.length - 1].distanceM > 1e-5) found.push(point);
    }
  }
  return found;
}
