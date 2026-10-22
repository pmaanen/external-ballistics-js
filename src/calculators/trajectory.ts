import { solveScenario, validateScenario } from '../ballistics/model';
import type { Scenario, Solution } from '../ballistics/model';
import { maximumRange } from './maximum-range';

// The optimum angle is found using a complete calm, flat-ground flight. The
// workbench then plots the requested distance using its sight-line solver;
// explicit coverage/termination metadata still applies to that plot.
export function configuredTrajectory(scenario: Scenario, distanceM: number): Solution {
  validateScenario(scenario);
  const angle = scenario.aimMode === 'maximum-range'
    ? maximumRange(scenario, scenario.launchHeightM, 1).flight.angleDeg : undefined;
  return solveScenario(scenario, distanceM, angle);
}
