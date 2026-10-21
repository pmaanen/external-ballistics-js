import type { Scenario, Solution } from '../ballistics/model';
import type { EnergyResult } from '../calculators/energy';
import type { PointBlankResult } from '../calculators/point-blank';

export type Task =
  | { kind: 'solve'; scenario: Scenario; distanceM: number }
  | { kind: 'energy'; solution: Solution; distanceM: number; thresholdJ: number }
  | { kind: 'pbr'; scenario: Scenario; distanceM: number; diameterM: number };
export type TaskResult =
  | { kind: 'solve'; solution: Solution }
  | { kind: 'energy'; result: EnergyResult }
  | { kind: 'pbr'; result: PointBlankResult };
export type Request = { id: number; task: Task };
export type Response = { id: number; ok: true; value: TaskResult } | { id: number; ok: false; error: string };
