import { bindCardOrder, dragGrip, moveCard } from './card-order';
import type { RangeWorkspace, RangeComparison as Comparison } from './workspace-state';
import { safeDistance, safeDistanceReason } from '../calculators/safe-distance';
import { chooseBullet } from './bullet-picker';
import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip } from 'chart.js';
import type { ChartDataset, ScatterDataPoint } from 'chart.js';
import { defaultScenario, dragModels } from '../ballistics/model';
import { projectileFrom, validateProjectile } from '../ballistics/flight';
import type { FlightPoint, Projectile } from '../ballistics/flight';
import type { MaximumRangeResult } from '../calculators/maximum-range';
import { format, fromSI, toSI } from '../ballistics/units';
import type { Unit, UnitPreferences } from '../ballistics/units';
import type { SavedSolution } from './store';
import { escapeHtml } from './table';
import { WorkerClient } from './worker-client';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);
interface Dependencies { preferences: () => UnitPreferences; setPreferences: (p: UnitPreferences) => void; savedLoads: () => SavedSolution[]; changed: () => void }
const colors = ['#a5f27a', '#79c7ff', '#f9b56b', '#e1a0ed', '#69e0cd', '#f98599'];
const opts = (values: readonly string[]) => values.map(v => `<option value="${v}">${v}</option>`).join('');
const editable = (v: number) => Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '';
function freeze<T extends object>(value: T): T {
  for (const v of Object.values(value)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(value);
}

export class MaximumRangeMode {
  private worker = new WorkerClient();
  private projectile: Projectile = projectileFrom(defaultScenario);
  private heightM = 1.5;
  private thresholdJ = 1500;
  private heightUnit: Unit = 'ft';
  private comparisons: Comparison[] = [];
  private preview: MaximumRangeResult | null = null;
  private editingId = '';
  private charts: Chart<'line', ScatterDataPoint[]>[];
  private preferencesKey = '';
  private sourceId = '';
  private busy = false;
  private serial = 0;
  private sequence = 0;
  constructor(private root: HTMLElement, private deps: Dependencies) {
    root.innerHTML = `<div class="max-workspace">
      <aside class="editor"><form id="max-range-form" novalidate><div class="card-title"><div><span class="eyebrow">01 / PROJECTILE</span><h2>Maximum-range load</h2></div></div>
        <div class="field"><label for="max-source">Copy a saved load (optional)</label><select id="max-source"></select></div>
        <div class="field max-name-field"><label for="max-name">Bullet name</label><input id="max-name" maxlength="100" required /></div>
        <button type="button" id="max-open-bullet-database" class="button secondary database-open">Choose from bullet database</button>
        <div class="two-fields">${this.field('mass', 'Bullet mass', ['gr', 'g'], 'mass')}${this.field('muzzle', 'Initial velocity', ['ft/s', 'm/s'], 'muzzle')}</div>
        <div class="two-fields"><div class="field"><label for="max-drag">Projectile drag model</label><select id="max-drag">${opts(dragModels)}</select></div>${this.field('bc', 'Projectile BC')}</div>
        <fieldset><legend>Ground &amp; energy</legend>${this.field('height', 'Muzzle height above ground', ['ft', 'm'])}
          <div class="max-energy-field">${this.field('threshold', 'Maximum-range energy threshold', ['ft·lbf', 'J'], 'energy')}</div>
          <p class="field-hint">Flat ground. Calm wind. Sight height, zero range and shooting-angle inputs are not used; the launch angle is searched automatically.</p></fieldset>
        <div class="form-actions"><button type="submit" class="button primary" id="max-calculate">Calculate maximum range →</button><button type="button" class="button secondary" id="max-save" disabled>+ Save range comparison</button><button type="button" class="button secondary" id="max-overwrite" disabled>Overwrite edited comparison</button><button type="button" class="button secondary" id="max-cancel" hidden>Cancel range calculation</button></div>
        <p id="max-status" class="status-message" role="status" aria-live="polite">Enter a projectile, then calculate its complete flight to first ground impact.</p>
      </form><div class="editor-footer">Numerical limits produce an error, never an estimated maximum from an incomplete flight.</div></aside>
      <div class="results"><section class="section-heading"><div><span class="eyebrow">02 / RANGE STUDY</span><h2>Maximum-range comparison</h2></div></section>
        <p class="range-model-note">Modelled first-impact reach, not a certified danger radius. Terrain, ricochet, atmospheric variability and uncertainty are not included. “Safe distance” below is the earlier modelled ground impact or energy-threshold event. It is not a certified safe-distance boundary; energy can rise again during descent.</p>
        <div class="max-display-controls output-units"><span>Display units</span><label>Horizontal distance<select id="max-distance-unit" data-max-pref="range" aria-label="Maximum-range distance display unit">${opts(['yd', 'm'])}</select></label><label>Height<select id="max-height-display" aria-label="Maximum-range height display unit">${opts(['ft', 'm'])}</select></label><label>Energy<select data-max-pref="energy" aria-label="Maximum-range energy display unit">${opts(['ft·lbf', 'J'])}</select></label></div>
        <p class="reorder-hint">Drag a card grip to reorder, or focus it and use arrow keys.</p><div id="max-comparisons" class="max-comparisons"></div><div id="max-preview-summary" class="max-preview-summary"></div>
        <div id="max-legend" class="chart-legend"></div>
        <div class="chart-card max-chart"><div class="chart-heading"><div><span class="eyebrow">COMPLETE FLIGHT / HORIZONTAL DISTANCE</span><h3>Height above flat ground</h3></div></div><div class="chart-space"><canvas id="max-height-chart" role="img" aria-label="Maximum-range flight heights and energy crossing markers"></canvas></div></div>
        <div class="chart-card max-chart"><div class="chart-heading"><div><span class="eyebrow">SAME MAXIMUM-RANGE TRAJECTORIES</span><h3>Kinetic energy to first impact</h3></div></div><div class="chart-space"><canvas id="max-energy-chart" role="img" aria-label="Energy along maximum-range trajectories, including upward and downward threshold crossings"></canvas></div></div>
        <section class="table-section"><div class="section-heading"><div><span class="eyebrow">03 / COMPARE</span><h2>Reach and threshold crossings</h2></div></div><div class="table-wrapper" tabindex="0" role="region" aria-label="Maximum-range comparison results"><table id="max-summary-table"></table></div></section>
        <section class="table-section"><div class="section-heading"><div><span class="eyebrow">04 / CROSSINGS</span><h2>Every crossing on the longest-range flight</h2></div></div><p class="table-note">Energy may increase again during descent. Both downward and upward crossings are reported, together with energy at ground impact.</p><div class="table-wrapper" tabindex="0" role="region" aria-label="All energy threshold crossings"><table id="max-events-table"></table></div></section>
      </div></div>`;
    this.charts = ['max-height-chart', 'max-energy-chart'].map(id => new Chart<'line', ScatterDataPoint[]>(this.el<HTMLCanvasElement>(id), {
      type: 'line', data: { datasets: [] }, options: { animation: false, responsive: true, maintainAspectRatio: false,
        parsing: false, interaction: { mode: 'nearest', intersect: false },
        elements: { point: { radius: 0, hitRadius: 7 }, line: { borderWidth: 2, tension: 0 } },
        scales: { x: { type: 'linear', min: 0, ticks: { color: '#91a18a', maxTicksLimit: 7 }, grid: { color: '#ffffff09' }, title: { display: true, color: '#91a18a', text: '' } },
          y: { type: 'linear', min: 0, ticks: { color: '#91a18a', maxTicksLimit: 6 }, grid: { color: '#ffffff09' }, title: { display: true, color: '#91a18a', text: '' } } },
        plugins: { tooltip: { callbacks: { afterLabel: item => `Flight time: ${format((item.raw as { timeS: number }).timeS, undefined, 3)} s` } } },
      },
    }));
    this.bind(); this.sync();
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.root.querySelector<T>(`#${id}`)!; }
  private field(id: string, label: string, choices?: Unit[], pref?: keyof UnitPreferences): string {
    return `<div class="field"><label for="max-${id}">${label}</label><div class="number-field"><input id="max-${id}" type="number" step="any" required inputmode="decimal" aria-describedby="max-status" />${choices ? `<select id="max-${id}-unit" ${pref ? `data-max-pref="${pref}"` : ''} aria-label="${label} unit">${opts(choices)}</select>` : ''}</div></div>`;
  }
  private setStatus(text: string, error = false): void { this.el('max-status').textContent = text; this.el('max-status').classList.toggle('error', error); }
  private number(id: string): number { const s = this.el<HTMLInputElement>(id).value; return s.trim() ? Number(s) : NaN; }
  private renderInputs(): void {
    const p = this.deps.preferences();
    this.el<HTMLInputElement>('max-name').value = this.projectile.name;
    this.el<HTMLSelectElement>('max-drag').value = this.projectile.dragModel;
    this.el<HTMLInputElement>('max-mass').value = editable(fromSI(this.projectile.massKg, p.mass));
    this.el<HTMLInputElement>('max-muzzle').value = editable(fromSI(this.projectile.muzzleMps, p.muzzle));
    this.el<HTMLInputElement>('max-bc').value = editable(this.projectile.bc);
    this.el<HTMLInputElement>('max-height').value = editable(fromSI(this.heightM, this.heightUnit));
    this.el<HTMLInputElement>('max-threshold').value = editable(fromSI(this.thresholdJ, p.energy));
    this.root.querySelectorAll<HTMLSelectElement>('[data-max-pref]').forEach(s => s.value = p[s.dataset.maxPref as keyof UnitPreferences]);
    this.el<HTMLSelectElement>('max-height-unit').value = this.heightUnit;
    this.el<HTMLSelectElement>('max-height-display').value = this.heightUnit;
  }
  sync(): void {
    const p = this.deps.preferences(), key = JSON.stringify(p);
    if (key !== this.preferencesKey) {
      const old = this.preferencesKey ? JSON.parse(this.preferencesKey) as UnitPreferences : null;
      if (!old || old.range !== p.range) this.heightUnit = p.range === 'm' ? 'm' : 'ft';
      this.preferencesKey = key; this.renderInputs();
    }
    const loads = this.deps.savedLoads();
    if (!loads.some(s => s.id === this.sourceId)) this.sourceId = '';
    this.el<HTMLSelectElement>('max-source').innerHTML = '<option value="">New bullet / current fields</option>' + loads.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    this.el<HTMLSelectElement>('max-source').value = this.sourceId;
    this.renderResults();
  }
  snapshot(): RangeWorkspace {
    return { comparisons: this.comparisons.map(c => ({ ...c })), preview: this.preview, editingId: this.editingId, heightUnit: this.heightUnit };
  }
  restore(state: RangeWorkspace): void {
    this.comparisons = state.comparisons.map(c => ({ ...c, result: freeze(structuredClone(c.result)) }));
    this.preview = state.preview ? freeze(structuredClone(state.preview)) : null;
    this.editingId = state.editingId; this.heightUnit = state.heightUnit; this.sequence = this.comparisons.length;
    const result = this.preview ?? this.comparisons.find(c => c.id === this.editingId)?.result ?? this.comparisons[0]?.result;
    if (result) { this.projectile = { ...result.projectile }; this.heightM = result.launchHeightM; this.thresholdJ = result.energy.thresholdJ; }
    this.renderInputs(); this.renderResults();
  }
  resize(): void { requestAnimationFrame(() => this.charts.forEach(chart => chart.resize())); }
  private changed(): void {
    if (this.busy) this.worker.cancel();
    this.preview = null; this.el<HTMLButtonElement>('max-save').disabled = true;
    this.setStatus('Inputs changed. Calculate to update the preview.'); this.renderResults();
  }
  private bind(): void {
    bindCardOrder(this.el('max-comparisons'), (id, target, after) => { moveCard(this.comparisons, id, target, after); this.renderResults(); });
    this.el('max-overwrite').addEventListener('click', () => {
      const item = this.comparisons.find(c => c.id === this.editingId);
      if (!item || !this.preview || this.busy) return;
      item.result = freeze(structuredClone(this.preview)); item.name = item.result.projectile.name;
      this.preview = null; this.setStatus('Comparison overwritten. Its position, color and visibility were preserved.'); this.renderResults();
    });
    this.el('max-open-bullet-database').addEventListener('click', () => chooseBullet(this.projectile.dragModel, selection => {
      this.projectile = { ...this.projectile, ...selection }; this.sourceId = '';
      this.el<HTMLSelectElement>('max-source').value = '';
      this.changed(); this.renderInputs();
      this.setStatus(Number.isFinite(selection.bc) ? 'Bullet loaded from WilsonKinetics. Check your muzzle velocity, then calculate.' : 'Bullet loaded from WilsonKinetics. Enter its BC and check your muzzle velocity before calculating.', !Number.isFinite(selection.bc));
    }));
    this.el('max-source').addEventListener('change', () => {
      this.sourceId = this.el<HTMLSelectElement>('max-source').value;
      const item = this.deps.savedLoads().find(s => s.id === this.sourceId);
      if (item) this.projectile = { ...projectileFrom(item.result.inputs), name: item.name };
      this.changed(); this.renderInputs();
    });
    for (const id of ['name', 'mass', 'muzzle', 'bc', 'drag', 'height', 'threshold']) this.el(`max-${id}`).addEventListener('input', () => {
      const p = this.deps.preferences();
      if (id === 'name') this.projectile.name = this.el<HTMLInputElement>('max-name').value;
      if (id === 'drag') this.projectile.dragModel = this.el<HTMLSelectElement>('max-drag').value as Projectile['dragModel'];
      if (id === 'mass') this.projectile.massKg = toSI(this.number('max-mass'), p.mass);
      if (id === 'muzzle') this.projectile.muzzleMps = toSI(this.number('max-muzzle'), p.muzzle);
      if (id === 'bc') this.projectile.bc = this.number('max-bc');
      if (id === 'height') this.heightM = toSI(this.number('max-height'), this.heightUnit);
      if (id === 'threshold') this.thresholdJ = toSI(this.number('max-threshold'), p.energy);
      this.changed();
    });
    this.root.querySelectorAll<HTMLSelectElement>('[data-max-pref]').forEach(select => select.addEventListener('change', () => {
      this.deps.setPreferences({ ...this.deps.preferences(), [select.dataset.maxPref!]: select.value });
    }));
    for (const id of ['max-height-unit', 'max-height-display']) this.el(id).addEventListener('change', () => {
      this.heightUnit = this.el<HTMLSelectElement>(id).value as Unit; this.renderInputs(); this.renderResults();
    });
    this.el('max-range-form').addEventListener('submit', event => { event.preventDefault(); void this.calculate(); });
    this.el('max-cancel').addEventListener('click', () => this.worker.cancel());
    this.el('max-save').addEventListener('click', () => {
      if (!this.preview) return;
      const index = this.sequence++;
      const result = freeze(structuredClone(this.preview));
      this.comparisons.push({ id: crypto.randomUUID(), name: result.projectile.name, color: colors[index % colors.length], visible: true, result });
      this.preview = null; this.editingId = ''; this.setStatus('Saved. Edit the projectile to compare another complete maximum-range flight.'); this.renderResults();
    });
    this.el('max-comparisons').addEventListener('change', event => {
      const target = event.target as HTMLInputElement, item = this.comparisons.find(s => s.id === target.dataset.rangeVisible);
      if (item) { item.visible = target.checked; this.renderResults(); }
    });
    this.el('max-comparisons').addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-range-remove], [data-range-edit]');
      if (button?.dataset.rangeEdit) {
        const item = this.comparisons.find(c => c.id === button.dataset.rangeEdit)!;
        this.editingId = item.id; this.projectile = { ...item.result.projectile, name: item.name };
        this.heightM = item.result.launchHeightM; this.thresholdJ = item.result.energy.thresholdJ;
        this.changed(); this.renderInputs(); this.setStatus('Editing saved comparison. Calculate, then overwrite it or save a new comparison.');
        this.el('max-name').focus();
      } else if (button?.dataset.rangeRemove) {
        this.comparisons = this.comparisons.filter(s => s.id !== button.dataset.rangeRemove);
        if (this.editingId === button.dataset.rangeRemove) this.editingId = '';
        this.renderResults();
      }
    });
  }
  private async calculate(): Promise<void> {
    const serial = ++this.serial;
    try {
      if (!this.el<HTMLFormElement>('max-range-form').reportValidity()) throw new Error('Complete all maximum-range fields.');
      validateProjectile(this.projectile);
      if (!Number.isFinite(this.heightM) || this.heightM < 0 || this.heightM > 1000) throw new Error('Muzzle height must be between 0 and 1,000 m.');
      if (!Number.isFinite(this.thresholdJ) || this.thresholdJ <= 0) throw new Error('Energy threshold must be positive.');
      this.preview = null; this.busy = true; this.renderResults();
      this.el<HTMLButtonElement>('max-calculate').disabled = true; this.el('max-cancel').hidden = false;
      this.setStatus('Searching launch angles and integrating each flight to ground impact…');
      const value = await this.worker.run({ kind: 'maximum-range', projectile: { ...this.projectile }, heightM: this.heightM, thresholdJ: this.thresholdJ });
      if (serial !== this.serial || value.kind !== 'maximum-range') return;
      this.preview = value.result;
      this.setStatus('Maximum-range flight complete. Save it for comparison.');
    } catch (error) { if (serial === this.serial) this.setStatus((error as Error).message, true); }
    finally {
      if (serial === this.serial) { this.busy = false; this.el<HTMLButtonElement>('max-calculate').disabled = false; this.el('max-cancel').hidden = true; this.renderResults(); }
    }
  }
  private visible(): Comparison[] {
    const rows = this.comparisons.filter(s => s.visible);
    if (this.preview) rows.push({ id: 'range-preview', name: `Preview · ${this.preview.projectile.name}`, color: '#e4eee7', visible: true, result: this.preview });
    return rows;
  }
  private renderResults(): void {
    const prefs = this.deps.preferences(), rows = this.visible();
    this.el<HTMLButtonElement>('max-save').disabled = !this.preview || this.busy;
    const edited = this.comparisons.find(c => c.id === this.editingId);
    this.el<HTMLButtonElement>('max-overwrite').disabled = !this.preview || !edited || this.busy;
    this.el('max-overwrite').textContent = edited ? `Overwrite ${edited.name}` : 'Overwrite edited comparison';
    this.el('max-comparisons').innerHTML = this.comparisons.map(s => `<div class="saved-solution" data-card-id="${s.id}" style="--series-color:${s.color}">${dragGrip(s.id, s.name)}<label class="visibility-toggle"><input type="checkbox" data-range-visible="${s.id}" ${s.visible ? 'checked' : ''} aria-label="Show maximum range for ${escapeHtml(s.name)}" /><span></span></label><div class="saved-body"><strong>${escapeHtml(s.name)}</strong><span class="solution-meta">${s.result.projectile.dragModel} · BC ${s.result.projectile.bc} · ${format(s.result.projectile.massKg, prefs.mass, 1)} ${prefs.mass}</span></div><button class="text-button" data-range-edit="${s.id}" aria-label="Edit maximum range for ${escapeHtml(s.name)}">Edit</button><button class="text-button" data-range-remove="${s.id}" aria-label="Remove maximum range for ${escapeHtml(s.name)}">Remove</button></div>`).join('');
    this.el('max-preview-summary').innerHTML = this.preview ? `<div class="range-highlight"><span>MODELLED MAXIMUM GROUND RANGE</span><strong>${format(this.preview.flight.impact.distanceM, prefs.range, 1)} ${prefs.range}</strong><p>${format(this.preview.flight.angleDeg, undefined, 3)}° launch · ${format(this.preview.flight.impact.timeS, undefined, 2)} s to first impact · ${format(this.preview.flight.impact.energyJ, prefs.energy, 1)} ${prefs.energy} at impact</p><div class="safe-distance-summary"><span>Safe distance · modelled</span><strong>${format(safeDistance(this.preview).point.distanceM, prefs.range, 1)} ${prefs.range}</strong><p>${safeDistanceReason[safeDistance(this.preview).reason]} · ${format(safeDistance(this.preview).point.timeS, undefined, 3)} s</p></div></div>` : '';
    this.el('max-legend').innerHTML = rows.map(s => `<span><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('') || '<span>Calculate and save bullets to overlay their longest-range flights.</span>';
    this.charts.forEach((chart, index) => {
      const valueUnit = index ? prefs.energy : this.heightUnit;
      const point = (p: FlightPoint) => ({ x: fromSI(p.distanceM, prefs.range), y: fromSI(index ? p.energyJ : p.heightM, valueUnit), timeS: p.timeS });
      const datasets: ChartDataset<'line', ScatterDataPoint[]>[] = [];
      for (const row of rows) {
        const flight = row.result.flight, points = flight.points.filter((_, i) => i % Math.max(1, Math.ceil(flight.points.length / 700)) === 0);
        if (points.at(-1) !== flight.impact) points.push(flight.impact);
        datasets.push({ label: row.name, borderColor: row.color, backgroundColor: row.color, borderDash: row.id === 'range-preview' ? [6, 4] : [], data: points.map(point) });
        datasets.push({ label: `${row.name} · safe distance (modelled)`, borderColor: row.color, backgroundColor: row.color, showLine: false, pointRadius: 6, pointStyle: 'triangle', data: [point(safeDistance(row.result).point)] });
        datasets.push({ label: `${row.name} · threshold crossings`, borderColor: row.color, backgroundColor: row.color, showLine: false, pointRadius: 4, data: row.result.energy.crossings.map(c => point(c.point)) });
        if (index) datasets.push({ label: `${row.name} · threshold`, borderColor: `${row.color}88`, borderDash: [3, 5], data: [0, flight.impact.distanceM].map(x => ({ x: fromSI(x, prefs.range), y: fromSI(row.result.energy.thresholdJ, prefs.energy), timeS: 0 })) });
      }
      chart.data.datasets = datasets;
      chart.options.scales!.x!.title = { display: true, color: '#91a18a', text: `Horizontal distance (${prefs.range})` };
      chart.options.scales!.y!.title = { display: true, color: '#91a18a', text: `${index ? 'Kinetic energy' : 'Height above ground'} (${valueUnit})` };
      chart.options.plugins!.tooltip!.callbacks!.label = item => `${item.dataset.label}: ${item.parsed.y?.toFixed(2)} ${valueUnit}`;
      chart.update('none');
    });
    const th = (label: string, unit: string) => `<th scope="col">${label}<span>${unit}</span></th>`;
    this.el<HTMLTableElement>('max-summary-table').innerHTML = rows.length ? `<caption class="sr-only">Complete maximum-range flights under calm wind over flat ground.</caption><thead><tr><th>Bullet</th>${th('Maximum ground range', prefs.range)}${th('Safe distance · modelled', prefs.range)}<th>Limiting event</th>${th('Launch angle', 'deg')}${th('Muzzle height', this.heightUnit)}${th('Threshold', prefs.energy)}${th('First downward crossing', prefs.range)}${th('Height at crossing', this.heightUnit)}${th('Time at crossing', 's')}${th('Impact energy', prefs.energy)}${th('Time to impact', 's')}</tr></thead><tbody>${rows.map(s => {
      const r = s.result, p = r.energy.firstDownward, limit = safeDistance(r);
      return `<tr><th scope="row">${escapeHtml(s.name)}</th><td>${format(r.flight.impact.distanceM, prefs.range, 1)}</td><td class="safe-distance-cell">${format(limit.point.distanceM, prefs.range, 1)}</td><td>${safeDistanceReason[limit.reason]}</td><td>${format(r.flight.angleDeg, undefined, 3)}</td><td>${format(r.launchHeightM, this.heightUnit)}</td><td>${format(r.energy.thresholdJ, prefs.energy, 1)}</td><td>${p ? format(p.distanceM, prefs.range, 1) : r.energy.initial === 'below' ? 'Below at muzzle' : 'Not reached before impact'}</td><td>${format(p?.heightM ?? null, this.heightUnit, 1)}</td><td>${format(p?.timeS ?? null, undefined, 3)}</td><td>${format(r.flight.impact.energyJ, prefs.energy, 1)}</td><td>${format(r.flight.impact.timeS, undefined, 3)}</td></tr>`;
    }).join('')}</tbody>` : '<caption>Calculate a maximum-range load to see its ground reach and energy crossings.</caption>';
    this.el<HTMLTableElement>('max-events-table').innerHTML = rows.length ? `<thead><tr><th>Bullet</th><th>Crossing</th>${th('Horizontal distance', prefs.range)}${th('Height', this.heightUnit)}${th('Flight time', 's')}${th('Energy', prefs.energy)}</tr></thead><tbody>${rows.map(s => s.result.energy.crossings.length ? s.result.energy.crossings.map(c => `<tr><th scope="row">${escapeHtml(s.name)}</th><td>${c.direction === 'down' ? 'Downward' : c.direction === 'up' ? 'Upward during descent' : 'Touches threshold'}</td><td>${format(c.point.distanceM, prefs.range, 1)}</td><td>${format(c.point.heightM, this.heightUnit, 1)}</td><td>${format(c.point.timeS, undefined, 3)}</td><td>${format(c.point.energyJ, prefs.energy, 1)}</td></tr>`).join('') : `<tr><th scope="row">${escapeHtml(s.name)}</th><td colspan="5">${s.result.energy.initial === 'below' ? 'Below threshold at muzzle.' : 'No crossing before first ground impact.'}</td></tr>`).join('')}</tbody>` : '<caption>Both downward and upward crossings will appear here.</caption>';
    this.deps.changed();
  }
  destroy(): void { this.worker.cancel(); this.charts.forEach(c => c.destroy()); }
}
