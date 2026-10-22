import { toSI } from './units';
import type { DragModel, Scenario } from './model';

export interface BulletRecord {
  readonly id: string;
  readonly manufacturer: string;
  readonly name: string;
  readonly caliberIn: number;
  readonly caliberM: number;
  readonly grains: number;
  readonly massKg: number;
  readonly bc: Readonly<Record<'G1' | 'G7', number | null>>;
  readonly sourceBC: Readonly<Record<'G1' | 'G7', string>>;
}
export interface BulletCatalog { readonly bullets: readonly BulletRecord[]; readonly blankRows: number; readonly invalidRows: number }
export type BulletSelection = Pick<Scenario, 'name' | 'massKg' | 'dragModel' | 'bc'>;

// CSV supports BOM, CRLF, quoted commas/newlines and doubled quote escapes.
// Keep the source file intact; validation happens when reading its records.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === ',') { row.push(value); value = ''; }
    else if (!quoted && (c === '\r' || c === '\n')) {
      row.push(value); rows.push(row); row = []; value = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else value += c;
  }
  if (quoted) throw new Error('Unclosed quoted field in bullet database.');
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
export function parseBulletDatabase(text: string): BulletCatalog {
  const [header, ...rows] = parseCSV(text);
  if (header?.join('|') !== 'Caliber|Manufacturer|Bullet Name|Grain|G1 BC|G7 BC') throw new Error('Unsupported bullet database columns.');
  const bullets: BulletRecord[] = [];
  let blankRows = 0, invalidRows = 0;
  const coefficient = (value: string) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= .001 && n <= 10 ? n : null;
  };
  rows.forEach((row, index) => {
    const fields = row.map(s => s.trim());
    if (fields.every(s => !s)) { blankRows++; return; }
    const [diameter, manufacturer, name, weight, g1, g7] = fields;
    const caliberIn = Number(diameter), grains = Number(weight), massKg = toSI(grains, 'gr');
    if (fields.length !== 6 || !manufacturer || !name || !Number.isFinite(caliberIn) || caliberIn <= 0
      || !Number.isFinite(massKg) || massKg < .000001 || massKg > 1) { invalidRows++; return; }
    bullets.push(Object.freeze({ id: `wilson-${index + 2}`, manufacturer, name, caliberIn,
      caliberM: toSI(caliberIn, 'in'), grains, massKg,
      bc: Object.freeze({ G1: coefficient(g1), G7: coefficient(g7) }),
      sourceBC: Object.freeze({ G1: g1, G7: g7 }) }));
  });
  return Object.freeze({ bullets: Object.freeze(bullets), blankRows, invalidRows });
}
export function searchBullets(bullets: readonly BulletRecord[], query: string, manufacturer = '', caliberIn = ''): BulletRecord[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return bullets.filter(b => (!manufacturer || b.manufacturer === manufacturer) && (!caliberIn || b.caliberIn === Number(caliberIn))
    && words.every(word => `${b.manufacturer} ${b.name} ${b.grains} gr ${b.caliberIn} in ${(b.caliberM * 1000).toFixed(3)} mm`.toLowerCase().includes(word)));
}
export function bulletSelection(bullet: BulletRecord, model: DragModel): BulletSelection {
  // Missing/invalid BC clears the form's previous value and requires manual entry.
  // Never carry a previous bullet's BC across, or convert between drag models.
  return { name: `${bullet.manufacturer} ${bullet.name} · ${bullet.grains} gr`.slice(0, 100),
    massKg: bullet.massKg, dragModel: model, bc: model === 'G1' || model === 'G7' ? bullet.bc[model] ?? NaN : NaN };
}
