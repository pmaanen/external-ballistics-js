import type { Scenario, Solution } from '../ballistics/model';
import type { EnergyResult } from '../calculators/energy';
import type { PointBlankResult } from '../calculators/point-blank';
import type { Projectile } from '../ballistics/flight';
import type { MaximumRangeResult } from '../calculators/maximum-range';

export type Task =
  | { kind: 'maximum-range'; projectile: Projectile; heightM: number; thresholdJ: number }
  | { kind: 'recalculate'; entries: { id: string; inputs: Scenario; angleDeg: number }[]; distanceM: number }
  | { kind: 'solve'; scenario: Scenario; distanceM: number }
  | { kind: 'energy'; solution: Solution; distanceM: number; thresholdJ: number }
  | { kind: 'pbr'; scenario: Scenario; distanceM: number; diameterM: number };
export type TaskResult =
  | { kind: 'maximum-range'; result: MaximumRangeResult }
  | { kind: 'recalculate'; results: { id: string; result: Solution }[] }
  | { kind: 'solve'; solution: Solution }
  | { kind: 'energy'; result: EnergyResult }
  | { kind: 'pbr'; result: PointBlankResult };
export type Request = { id: number; task: Task };
export type Response = { id: number; ok: true; value: TaskResult } | { id: number; ok: false; error: string };
