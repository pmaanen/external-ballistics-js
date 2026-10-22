import { configuredTrajectory } from '../calculators/trajectory';
import { solveScenario } from '../ballistics/model';
import { energyThreshold } from '../calculators/energy';
import { pointBlank } from '../calculators/point-blank';
import { maximumRange } from '../calculators/maximum-range';
import type { Request, Response, TaskResult } from './protocol';

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, task } = event.data;
  let response: Response;
  try {
    let value: TaskResult;
    switch (task.kind) {
      case 'maximum-range': value = { kind: 'maximum-range', result: maximumRange(task.projectile, task.heightM, task.thresholdJ) }; break;
      case 'recalculate': value = { kind: 'recalculate', results: task.entries.map(entry => ({ id: entry.id, result: solveScenario(entry.inputs, task.distanceM, entry.angleDeg) })) }; break;
      case 'solve': value = { kind: 'solve', solution: configuredTrajectory(task.scenario, task.distanceM) }; break;
      case 'energy': {
        const solution = solveScenario(task.solution.inputs, task.distanceM, task.solution.zeroAngleDeg);
        value = { kind: 'energy', result: energyThreshold(solution, task.thresholdJ) }; break;
      }
      case 'pbr': value = { kind: 'pbr', result: pointBlank(task.scenario, task.diameterM, task.distanceM) }; break;
    }
    response = { id, ok: true, value };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : 'Calculation failed.' };
  }
  self.postMessage(response);
};
