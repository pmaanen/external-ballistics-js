import { distanceGrid, validateScenario } from '../ballistics/model';
import type { Solution } from '../ballistics/model';
import { validateProjectile } from '../ballistics/flight';
import type { MaximumRangeResult } from '../calculators/maximum-range';
import { presets, units } from '../ballistics/units';
import type { Unit, UnitPreferences } from '../ballistics/units';
import type { SavedSolution } from './store';

export interface RangeComparison { id: string; name: string; color: string; visible: boolean; result: MaximumRangeResult }
export interface RangeWorkspace { comparisons: RangeComparison[]; preview: MaximumRangeResult | null; editingId: string; heightUnit: Unit }
export interface WorkspaceState {
  schema: 1; solutions: SavedSolution[]; preview: Solution | null; editingId: string;
  activeId: string; preferences: UnitPreferences;
  view: { min: number; max: number; step: number };
  mode: 'trajectory' | 'maximum-range'; maximum: RangeWorkspace;
}
function require(condition: unknown): asserts condition { if (!condition) throw new Error('Saved workspace is invalid or uses an unsupported format.'); }
function object(v: unknown): Record<string, any> { require(v && typeof v === 'object' && !Array.isArray(v)); return v as Record<string, any>; }
function number(v: unknown, min = -Infinity, max = Infinity): void { require(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max); }
function name(v: unknown): void { require(typeof v === 'string' && v.trim().length > 0 && v.length <= 100); }
function list(v: unknown, max: number): any[] { require(Array.isArray(v) && v.length <= max); return v; }
function card(v: unknown): Record<string, any> {
  const c = object(v); require(typeof c.id === 'string' && /^[\w-]{1,100}$/.test(c.id)); name(c.name);
  require(typeof c.visible === 'boolean' && typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color)); return c;
}
function point(v: unknown, fields: string[]): Record<string, any> { const p = object(v); for (const key of fields) number(p[key]); return p; }
function solution(v: unknown): void {
  const s = object(v); validateScenario(object(s.inputs) as any);
  number(s.zeroAngleDeg, -45, 45); number(s.requestedDistanceM, .01, 10000); number(s.maxDistanceM, 0, s.requestedDistanceM + 1e-5);
  require(typeof s.solverVersion === 'string' && s.solverVersion.length <= 50);
  const t = object(s.trajectory); number(t.maxRange, 0, 50000); number(t.boreAngle, -45, 45);
  number(t.muzzleVelocity, 1, 9999); number(t.crossWind); number(t.steps, 0, 250001);
  require(['requested-range', 'step-limit', 'time-limit', 'forward-limit', 'model-limit'].includes(t.termination));
  const points = list(t.points, 40000); require(points.length > 0);
  let x = -1, time = -1;
  for (const v of points) {
    const p = point(v, ['x', 'y', 'time', 'vx', 'vy', 'ax', 'ay']);
    require(p.x > x && p.time > time && p.vx > 0); x = p.x; time = p.time;
  }
  require(points[0].x === 0 && points[0].time === 0);
  require(Math.abs(x * .3048 - s.maxDistanceM) < 1e-5 && Math.abs(t.maxRange * .9144 - s.maxDistanceM) < 1e-5);
}
const flightFields = ['timeS', 'distanceM', 'heightM', 'vxMps', 'vyMps', 'axMps2', 'ayMps2', 'speedMps', 'energyJ'];
function rangeResult(v: unknown): void {
  const r = object(v); validateProjectile(object(r.projectile) as any); number(r.launchHeightM, 0, 1000);
  require(r.assumptions === 'flat-ground-calm-wind'); number(r.evaluations, 1, 100);
  const f = object(r.flight); validateProjectile(object(f.projectile) as any);
  require(JSON.stringify(f.projectile) === JSON.stringify(r.projectile));
  number(f.angleDeg, 0, 90); number(f.launchHeightM, 0, 1000); number(f.steps, 0, 200000);
  const points = list(f.points, 200001); require(points.length > 0);
  let time = -1, distance = -1;
  for (const v of points) {
    const p = point(v, flightFields);
    require(p.timeS > time && p.distanceM >= distance && p.heightM >= -1e-5 && p.energyJ >= 0 && p.speedMps >= 0);
    time = p.timeS; distance = p.distanceM;
  }
  const impact = point(f.impact, flightFields); require(impact.heightM === 0 && impact.timeS === time && impact.distanceM === distance);
  point(r.apex, flightFields);
  const e = object(r.energy); number(e.thresholdJ, Number.MIN_VALUE); require(['above', 'below', 'equal'].includes(e.initial));
  require(typeof e.impactAboveThreshold === 'boolean');
  const event = (v: unknown) => { const p = point(v, flightFields); require(p.timeS >= 0 && p.timeS <= time && p.distanceM >= 0 && p.distanceM <= distance); };
  if (e.firstDownward !== null) event(e.firstDownward);
  for (const c of list(e.crossings, 1000)) { require(['up', 'down', 'touch'].includes(object(c).direction)); event(c.point); }
}
export function decodeWorkspace(value: unknown): WorkspaceState {
  const w = object(value); require(w.schema === 1);
  const saved = list(w.solutions, 500); const ids = new Set<string>();
  for (const v of saved) { const s = card(v); require(!ids.has(s.id)); ids.add(s.id); solution(s.result); for (const n of list(s.dash, 10)) number(n, 0, 100); }
  require(typeof w.activeId === 'string' && (!w.activeId || ids.has(w.activeId)));
  require(typeof w.editingId === 'string' && (!w.editingId || ids.has(w.editingId)));
  if (w.preview !== null) solution(w.preview);
  const p = object(w.preferences);
  for (const key of Object.keys(presets.imperial) as (keyof UnitPreferences)[]) {
    require(typeof p[key] === 'string' && Object.hasOwn(units, p[key]));
    require(units[p[key] as Unit].quantity === units[presets.imperial[key]].quantity);
  }
  const view = object(w.view); distanceGrid(view.min, view.max, view.step);
  require(w.mode === 'trajectory' || w.mode === 'maximum-range');
  const max = object(w.maximum); require(max.heightUnit === 'ft' || max.heightUnit === 'm');
  const rangeIds = new Set<string>();
  for (const v of list(max.comparisons, 500)) { const c = card(v); require(!rangeIds.has(c.id)); rangeIds.add(c.id); rangeResult(c.result); }
  require(typeof max.editingId === 'string' && (!max.editingId || rangeIds.has(max.editingId)));
  if (max.preview !== null) rangeResult(max.preview);
  return w as unknown as WorkspaceState;
}
