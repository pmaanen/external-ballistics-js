import { groundFlight, interpolateFlight, projectileFrom, refineFlightEvent } from '../ballistics/flight';
import type { FlightPoint, GroundFlight, Projectile, FlightOptions } from '../ballistics/flight';

export interface FlightEnergyCrossing { direction: 'down' | 'up' | 'touch'; point: FlightPoint }
export interface FlightEnergyResult {
  thresholdJ: number; initial: 'above' | 'equal' | 'below';
  firstDownward: FlightPoint | null; crossings: FlightEnergyCrossing[]; impactAboveThreshold: boolean;
}
export interface MaximumRangeResult {
  projectile: Projectile; launchHeightM: number; flight: GroundFlight;
  apex: FlightPoint; energy: FlightEnergyResult; evaluations: number;
  assumptions: 'flat-ground-calm-wind';
}
export function flightEnergy(flight: GroundFlight, thresholdJ: number): FlightEnergyResult {
  if (!Number.isFinite(thresholdJ) || thresholdJ <= 0) throw new Error('Energy threshold must be positive.');
  const mass = flight.projectile.massKg;
  const crossings: FlightEnergyCrossing[] = [];
  const rate = (p: FlightPoint) => p.vxMps * p.axMps2 + p.vyMps * p.ayMps2;
  const delta = (p: FlightPoint) => p.energyJ - thresholdJ;
  for (let i = 1; i < flight.points.length; i++) {
    const a = flight.points[i - 1], b = flight.points[i];
    const mid = interpolateFlight(a, b, mass, (a.timeS + b.timeS) / 2);
    const parts = [a];
    // Split at energy extrema so a drop followed by a rise within one accepted
    // integration step cannot silently be treated as no threshold crossing.
    for (const [l, r] of [[a, mid], [mid, b]]) {
      if (rate(l) * rate(r) < 0) parts.push(refineFlightEvent(l, r, mass, rate));
    }
    parts.push(b);
    for (let j = 1; j < parts.length; j++) {
      const l = parts[j - 1], r = parts[j], dl = delta(l), dr = delta(r);
      if (dl * dr > 0 || (dl === 0 && dr === 0)) continue;
      const point = refineFlightEvent(l, r, mass, delta);
      const direction = dr < dl ? 'down' : 'up';
      const last = crossings[crossings.length - 1];
      if (last && Math.abs(last.point.timeS - point.timeS) < 1e-6) {
        if (last.direction !== direction) last.direction = 'touch';
      } else crossings.push({ direction, point });
    }
  }
  const muzzle = flight.points[0];
  const initial = Math.abs(delta(muzzle)) < 1e-8 ? 'equal' : delta(muzzle) > 0 ? 'above' : 'below';
  return { thresholdJ, initial, firstDownward: initial === 'equal' ? muzzle : crossings.find(c => c.direction === 'down')?.point ?? null,
    crossings, impactAboveThreshold: flight.impact.energyJ >= thresholdJ };
}
export function maximumRange(projectile: Projectile, heightM: number, thresholdJ: number, options: FlightOptions = {}): MaximumRangeResult {
  if (!Number.isFinite(thresholdJ) || thresholdJ <= 0) throw new Error('Energy threshold must be positive.');
  let evaluations = 0;
  const evaluate = (angle: number) => { evaluations++; return groundFlight(projectile, angle, heightM, options); };
  // Coarse global scan followed by a bounded refinement of the best calm,
  // flat-ground branch. Never optimize a clipped or incomplete trajectory.
  let best = evaluate(0), bestIndex = 0;
  for (let i = 1; i <= 18; i++) {
    const flight = evaluate(i * 5);
    if (flight.impact.distanceM > best.impact.distanceM) { best = flight; bestIndex = i; }
  }
  let lo = Math.max(0, bestIndex - 1) * 5, hi = Math.min(18, bestIndex + 1) * 5;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = hi - ratio * (hi - lo), b = lo + ratio * (hi - lo);
  let fa = evaluate(a), fb = evaluate(b);
  for (let i = 0; i < 40 && hi - lo > .0001; i++) {
    if (fa.impact.distanceM > fb.impact.distanceM) {
      hi = b; b = a; fb = fa; a = hi - ratio * (hi - lo); fa = evaluate(a);
    } else {
      lo = a; a = b; fa = fb; b = lo + ratio * (hi - lo); fb = evaluate(b);
    }
  }
  for (const flight of [fa, fb]) if (flight.impact.distanceM > best.impact.distanceM) best = flight;
  let apex = best.points[0];
  for (let i = 1; i < best.points.length; i++) {
    const a = best.points[i - 1], b = best.points[i];
    if (a.vyMps > 0 && b.vyMps <= 0) apex = refineFlightEvent(a, b, projectile.massKg, p => p.vyMps);
  }
  return { projectile: projectileFrom(projectile), launchHeightM: heightM, flight: best, apex,
    energy: flightEnergy(best, thresholdJ), evaluations, assumptions: 'flat-ground-calm-wind' };
}
