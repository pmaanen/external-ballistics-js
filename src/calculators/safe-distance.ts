import type { FlightPoint } from '../ballistics/flight';
import type { MaximumRangeResult } from './maximum-range';

export interface SafeDistance { point: FlightPoint; reason: 'ground-impact' | 'energy-threshold' | 'below-at-muzzle' }
// A display boundary, not a certified safety perimeter. Later upward energy
// crossings remain relevant and are retained in the complete flight result.
export function safeDistance(result: MaximumRangeResult): SafeDistance {
  const { flight, energy } = result;
  if (energy.initial !== 'above') return { point: flight.points[0], reason: energy.initial === 'below' ? 'below-at-muzzle' : 'energy-threshold' };
  const first = energy.crossings[0]?.point ?? energy.firstDownward;
  return first && first.distanceM < flight.impact.distanceM
    ? { point: first, reason: 'energy-threshold' } : { point: flight.impact, reason: 'ground-impact' };
}
export const safeDistanceReason = { 'ground-impact': 'First ground impact', 'energy-threshold': 'Energy threshold', 'below-at-muzzle': 'Already below at muzzle' } as const;
