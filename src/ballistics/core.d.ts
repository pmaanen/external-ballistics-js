export interface LegacyInputs {
  dragFunction: string;
  dragCoefficient: number;
  muzzleVelocity: number;
  sightHeight: number;
  shootingAngle: number;
  windSpeed: number;
  windAngle: number;
  zeroRange: number;
  yIntercept?: number;
}
export interface CorePoint {
  x: number; y: number; time: number; vx: number; vy: number; ax: number; ay: number;
}
export interface CoreResult {
  points: CorePoint[];
  termination: 'requested-range' | 'step-limit' | 'time-limit' | 'forward-limit' | 'model-limit';
  steps: number; boreAngle: number; maxRange: number; muzzleVelocity: number; crossWind: number;
}
export interface IntegrationOptions {
  maxRange?: number; stepFeet?: number; intervalYards?: number; maxSteps?: number;
  maxTime?: number; calm?: boolean; shootingAngle?: number;
}
export interface LegacySample {
  range: number; path: number; time: number; velocity: number; velocityX: number;
  velocityY: number; windage: number; moa: number | null; windageMOA: number | null;
}
export default class ExternalBallistics {
  static VERSION: string;
  static sample(result: CoreResult, yardage: number): LegacySample | null;
  BCOMP_MAXRANGE: number;
  DEFAULT_GRAVITY: number;
  DEFAULT_YINTERCEPT: number;
  DRAG_FUNCTIONS: Record<string, { thresholds: number[]; values: { A: number; M: number }[] }>;
  gravity: number; yIntercept: number; zeroRange: number;
  solution: (number | null)[]; maximumValidRange: number; result: CoreResult | null;
  setVariables(inputs: LegacyInputs): void;
  retard(velocity: number): number;
  getZeroAngle(): number;
  integrate(angle: number, options?: IntegrationOptions): CoreResult;
  solveAll(options?: IntegrationOptions): CoreResult;
  sampleAt(yardage: number): LegacySample | null;
  getRange(yardage: number): number | null;
  getPath(yardage: number): number | null;
  getVelocity(yardage: number): number | null;
  getVelocityX(yardage: number): number | null;
  getVelocityY(yardage: number): number | null;
  getTime(yardage: number): number | null;
  getMinuteOfAngle(yardage: number): number | null;
  getWindage(yardage: number): number | null;
  getWindageMOA(yardage: number): number | null;
  getHeadWind(speed: number, angle: number): number;
  getCrossWind(speed: number, angle: number): number;
}
