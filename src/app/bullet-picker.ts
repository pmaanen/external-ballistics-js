import csv from '../data/wilson/bullet_database.csv?raw';
import license from '../data/wilson/LICENSE?raw';
import source from '../data/wilson/source.json';
import { bulletSelection, parseBulletDatabase, searchBullets } from '../ballistics/bullet-database';
import type { BulletRecord, BulletSelection } from '../ballistics/bullet-database';
import type { DragModel } from '../ballistics/model';
import { escapeHtml } from './table';

const catalog = parseBulletDatabase(csv);
const maxResults = 150;
export const bulletDatabaseCredit = `<a href="${source.sourceUrl}" target="_blank" rel="noopener">WilsonKinetics bullet database</a> by Reese Wilson / Wilson Armament Bureau · MIT · © 2026 Wilson Kinetics`;
class BulletPicker {
  private dialog = document.createElement('dialog');
  private selected: BulletRecord | null = null;
  private model: DragModel = 'G1';
  private preferredModel: DragModel = 'G1';
  private apply: ((bullet: BulletSelection) => void) | null = null;
  constructor() {
    this.dialog.id = 'bullet-database-dialog';
    this.dialog.setAttribute('aria-labelledby', 'bullet-database-title');
    this.dialog.innerHTML = `<button type="button" class="dialog-close" id="bullet-database-close" aria-label="Close bullet database">×</button>
      <span class="eyebrow">PROJECTILE LIBRARY / ${catalog.bullets.length.toLocaleString('en-US')} BULLETS</span><h2 id="bullet-database-title">Find your bullet</h2>
      <p class="database-credit">${bulletDatabaseCredit}</p>
      <div class="field"><label for="bullet-search">Search bullet database</label><input id="bullet-search" type="search" autocomplete="off" placeholder="Name, manufacturer, diameter or weight…" /></div>
      <div class="two-fields database-filters"><div class="field"><label for="bullet-manufacturer">Manufacturer filter</label><select id="bullet-manufacturer"><option value="">All manufacturers</option>${[...new Set(catalog.bullets.map(b => b.manufacturer))].sort((a, b) => a.localeCompare(b)).map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}</select></div>
      <div class="field"><label for="bullet-caliber">Diameter filter</label><select id="bullet-caliber"><option value="">All diameters</option>${[...new Set(catalog.bullets.map(b => b.caliberIn))].sort((a, b) => a - b).map(n => `<option value="${n}">${n.toFixed(3)} in / ${(n * 25.4).toFixed(3)} mm</option>`).join('')}</select></div></div>
      <p id="bullet-match-count" class="database-match-count" role="status" aria-live="polite"></p>
      <div class="field"><label for="bullet-results">Matching bullets</label><select id="bullet-results" size="7" aria-describedby="bullet-match-count"></select></div>
      <div id="bullet-detail" class="database-detail" aria-live="polite">Choose a bullet to inspect its listed coefficients.</div>
      <div class="field"><label for="bullet-bc-model">Database BC model</label><select id="bullet-bc-model" disabled></select></div>
      <p id="bullet-bc-note" class="field-hint"></p>
      <p class="field-hint">Copies name, mass and the chosen listed BC. Muzzle velocity and sight settings stay as entered. Verify the chosen projectile and supply your measured muzzle velocity.</p>
      <button type="button" id="bullet-apply" class="button primary" disabled>Use bullet</button>
      <details class="database-license"><summary>Credits &amp; MIT license</summary><p>Snapshot ${source.revision.slice(0, 12)} · ${source.retrieved}. Source CSV retained in the repository; no online lookup is required. Blank rows are omitted; missing and unsupported BCs require manual entry.</p><pre>${escapeHtml(license)}</pre></details>`;
    document.body.append(this.dialog);
    this.el('bullet-database-close').addEventListener('click', () => this.dialog.close());
    // Search inputs otherwise consume Escape to clear their text in some
    // browsers. Keep dismissal consistent with the rest of the modal UI.
    this.dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.dialog.close(); }
    });
    this.dialog.addEventListener('close', () => { this.apply = null; });
    this.el('bullet-search').addEventListener('input', () => this.renderMatches());
    for (const id of ['bullet-manufacturer', 'bullet-caliber']) this.el(id).addEventListener('change', () => this.renderMatches());
    this.el('bullet-results').addEventListener('change', () => {
      this.selected = catalog.bullets.find(b => b.id === this.el<HTMLSelectElement>('bullet-results').value) ?? null;
      this.renderSelection();
    });
    this.el('bullet-bc-model').addEventListener('change', () => {
      this.model = this.el<HTMLSelectElement>('bullet-bc-model').value as DragModel;
      this.renderNote();
    });
    this.el('bullet-apply').addEventListener('click', () => {
      if (!this.selected || !this.apply) return;
      const apply = this.apply, patch = bulletSelection(this.selected, this.model);
      this.dialog.close(); apply(patch);
    });
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.dialog.querySelector<T>(`#${id}`)!; }
  open(model: DragModel, apply: (bullet: BulletSelection) => void): void {
    this.apply = apply; this.preferredModel = model;
    this.el<HTMLInputElement>('bullet-search').value = '';
    this.el<HTMLSelectElement>('bullet-manufacturer').value = '';
    this.el<HTMLSelectElement>('bullet-caliber').value = '';
    this.renderMatches(); this.dialog.showModal(); this.el('bullet-search').focus();
  }
  private renderMatches(): void {
    const matches = searchBullets(catalog.bullets, this.el<HTMLInputElement>('bullet-search').value,
      this.el<HTMLSelectElement>('bullet-manufacturer').value, this.el<HTMLSelectElement>('bullet-caliber').value);
    const shown = matches.slice(0, maxResults);
    this.el('bullet-match-count').textContent = `${matches.length.toLocaleString('en-US')} matches${matches.length > maxResults ? ` · showing first ${maxResults}; narrow the search to see more` : ''}.`;
    this.el<HTMLSelectElement>('bullet-results').innerHTML = '<option value="" selected disabled>Choose a bullet…</option>' + shown.map(b => `<option value="${b.id}">${escapeHtml(`${b.manufacturer} · ${b.name} · ${b.grains} gr · ${b.caliberIn.toFixed(3)} in`)}</option>`).join('');
    this.selected = null; this.renderSelection();
  }
  private renderSelection(): void {
    const b = this.selected, select = this.el<HTMLSelectElement>('bullet-bc-model');
    this.el<HTMLButtonElement>('bullet-apply').disabled = !b;
    if (!b) { select.innerHTML = ''; select.disabled = true; this.el('bullet-detail').textContent = 'Choose a bullet to inspect its listed coefficients.'; this.el('bullet-bc-note').textContent = ''; return; }
    const available = (['G1', 'G7'] as const).filter(model => b.bc[model] !== null);
    this.model = available.includes(this.preferredModel as 'G1' | 'G7') ? this.preferredModel : available[0] ?? this.preferredModel;
    select.innerHTML = available.length ? (['G1', 'G7'] as const).map(model => `<option value="${model}" ${b.bc[model] === null ? 'disabled' : ''}>${model}${b.bc[model] !== null ? ` · ${b.bc[model]}` : ' · unavailable'}</option>`).join('') : '<option value="">Manual BC required</option>';
    select.disabled = !available.length;
    if (available.length) select.value = this.model;
    this.el('bullet-detail').textContent = `${b.manufacturer} · ${b.name} · ${b.grains} gr (${(b.massKg * 1000).toFixed(4)} g) · diameter ${b.caliberIn.toFixed(3)} in / ${(b.caliberM * 1000).toFixed(3)} mm`;
    this.renderNote();
  }
  private renderNote(): void {
    const b = this.selected;
    if (!b) return;
    const valid = (this.model === 'G1' || this.model === 'G7') && b.bc[this.model] !== null;
    const describe = (m: 'G1' | 'G7') => b.bc[m] !== null ? `${m}: ${b.bc[m]}`
      : Number(b.sourceBC[m]) === 0 ? `${m}: not supplied` : `${m}: unsupported source value ${b.sourceBC[m]}`;
    this.el('bullet-bc-note').textContent = `${describe('G1')} · ${describe('G7')}. ${valid ? 'Uses the selected model’s listed coefficient; no G1/G7 conversion.' : 'No usable listed BC. Applying this bullet clears the old BC; enter a valid coefficient before calculating.'}`;
    this.el('bullet-apply').textContent = valid ? `Use bullet · ${this.model}` : 'Use bullet · enter BC manually';
  }
}
let picker: BulletPicker | null = null;
export function chooseBullet(model: DragModel, apply: (bullet: BulletSelection) => void): void {
  picker ??= new BulletPicker(); picker.open(model, apply);
}
