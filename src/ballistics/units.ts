export const units = {
  m: { label: 'm', factor: 1, quantity: 'length' },
  yd: { label: 'yd', factor: 0.9144, quantity: 'length' },
  ft: { label: 'ft', factor: 0.3048, quantity: 'length' },
  mm: { label: 'mm', factor: 0.001, quantity: 'length' },
  cm: { label: 'cm', factor: 0.01, quantity: 'length' },
  in: { label: 'in', factor: 0.0254, quantity: 'length' },
  g: { label: 'g', factor: 0.001, quantity: 'mass' },
  gr: { label: 'gr', factor: 0.00006479891, quantity: 'mass' },
  'm/s': { label: 'm/s', factor: 1, quantity: 'speed' },
  'ft/s': { label: 'ft/s', factor: 0.3048, quantity: 'speed' },
  mph: { label: 'mph', factor: 0.44704, quantity: 'speed' },
  'km/h': { label: 'km/h', factor: 1 / 3.6, quantity: 'speed' },
  J: { label: 'J', factor: 1, quantity: 'energy' },
  'ft·lbf': { label: 'ft·lbf', factor: 1.3558179483314004, quantity: 'energy' },
  MOA: { label: 'MOA', factor: Math.PI / 10800, quantity: 'angle' },
  mrad: { label: 'mrad', factor: 0.001, quantity: 'angle' },
} as const;

export type Unit = keyof typeof units;
export type UnitPreferences = {
  zeroHeight: Unit; height: Unit; mass: Unit; muzzle: Unit; sight: Unit; zero: Unit; wind: Unit;
  range: Unit; path: Unit; speed: Unit; energy: Unit; angle: Unit;
};
export const presets: Record<'metric' | 'imperial', UnitPreferences> = {
  metric: { zeroHeight: 'cm', height: 'm', mass: 'g', muzzle: 'm/s', sight: 'mm', zero: 'm', wind: 'm/s',
    range: 'm', path: 'cm', speed: 'm/s', energy: 'J', angle: 'mrad' },
  imperial: { zeroHeight: 'in', height: 'ft', mass: 'gr', muzzle: 'ft/s', sight: 'in', zero: 'yd', wind: 'mph',
    range: 'yd', path: 'in', speed: 'ft/s', energy: 'ft·lbf', angle: 'MOA' },
};
export const toSI = (value: number, unit: Unit): number => value * units[unit].factor;
export const fromSI = (value: number, unit: Unit): number => value / units[unit].factor;
export function convert(value: number, from: Unit, to: Unit): number {
  if (units[from].quantity !== units[to].quantity) throw new Error('Cannot convert unrelated quantities.');
  return fromSI(toSI(value, from), to);
}
export function format(value: number | null, unit?: Unit, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const n = unit ? fromSI(value, unit) : value;
  return (Math.abs(n) < 0.5 * 10 ** -decimals ? 0 : n).toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}
