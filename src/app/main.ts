import './styles.css';
import { bindCardOrder, dragGrip } from './card-order';
import { WorkspaceStorage } from './workspace-storage';
import type { WorkspaceState } from './workspace-state';
import { chooseBullet, bulletDatabaseCredit } from './bullet-picker';
import { MaximumRangeMode } from './maximum-range-mode';
import { defaultScenario, distanceGrid, dragModels, ScenarioValidationError, validateScenario } from '../ballistics/model';
import type { Scenario, Solution } from '../ballistics/model';
import { format, fromSI, presets, toSI } from '../ballistics/units';
import type { Unit, UnitPreferences } from '../ballistics/units';
import type { EnergyResult } from '../calculators/energy';
import type { PointBlankResult } from '../calculators/point-blank';
import type { Task, TaskResult } from '../workers/protocol';
import { SolutionStore } from './store';
import { Plots } from './plots';
import type { Series, ViewRange } from './plots';
import { escapeHtml, renderTable } from './table';
import { WorkerClient } from './worker-client';

const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const store = new SolutionStore();
const worker = new WorkerClient();
let prefs: UnitPreferences = { ...presets.imperial };
let draft: Scenario = { ...defaultScenario };
let preview: Solution | null = null;
let activeId = '';
let editingId = '';
let hydrated = false, persistenceEnabled = true;
let currentMode: 'trajectory' | 'maximum-range' = 'trajectory';
const persistence = new WorkspaceStorage((state, message) => {
  const element = document.getElementById('workspace-status');
  if (element) { element.textContent = message; element.dataset.state = state; element.classList.toggle('error', state === 'error'); }
});
let energy: EnergyResult | null = null;
let pbr: PointBlankResult | null = null;
let pbrSavedId: string | null = null;
let thresholdJ = 1500, diameterM = .15, searchM = 2000;
let pbrZeroRangeM = defaultScenario.zeroRangeM;
let thresholdUnit: Unit = 'ft·lbf', diameterUnit: Unit = 'in', searchUnit: Unit = 'yd';
let view: ViewRange = { min: 0, max: toSI(800, 'yd'), step: toSI(50, 'yd') };
let busyKind: Task['kind'] | null = null;
let operation = 0;

const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
const logo = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 36 24 9l17 27H7Zm0 0 17-10 17 10"/></svg>';
function options(values: readonly string[], selected?: string): string {
  return values.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');
}
type Field = { key: keyof Scenario; id: string; label: string; pref?: keyof UnitPreferences; choices?: Unit[]; suffix?: string };
const fields: Field[] = [
  { key: 'massKg', id: 'mass', label: 'Projectile mass', pref: 'mass', choices: ['gr', 'g'] },
  { key: 'muzzleMps', id: 'muzzle', label: 'Muzzle velocity', pref: 'muzzle', choices: ['ft/s', 'm/s'] },
  { key: 'bc', id: 'bc', label: 'Ballistic coefficient', suffix: 'BC' },
  { key: 'zeroHeightM', id: 'zero-height', label: 'Zero height', pref: 'zeroHeight', choices: ['in', 'cm', 'mm'] },
  { key: 'boreAngleDeg', id: 'bore-angle', label: 'Bore elevation angle', suffix: 'deg' },
  { key: 'zeroRangeM', id: 'zero', label: 'Zero range', pref: 'zero', choices: ['yd', 'm'] },
  { key: 'sightHeightM', id: 'sight', label: 'Sight height over bore', pref: 'sight', choices: ['in', 'mm', 'cm'] },
  { key: 'inclinationDeg', id: 'inclination', label: 'Shooting angle', suffix: 'deg' },
  { key: 'windMps', id: 'wind', label: 'Wind speed', pref: 'wind', choices: ['mph', 'm/s', 'km/h'] },
  { key: 'windDeg', id: 'direction', label: 'Wind from', suffix: 'deg' },
];
function field(key: keyof Scenario): string {
  const f = fields.find(f => f.key === key)!;
  return `<div class="field"><label for="${f.id}">${f.label}</label><div class="number-field">
    <input id="${f.id}" data-field="${f.key}" type="number" step="any" required inputmode="decimal" aria-describedby="form-status" />
    ${f.pref ? `<select data-input-unit="${f.pref}" aria-label="${f.label} unit">${options(f.choices!)}</select>` : `<span class="suffix">${f.suffix}</span>`}
  </div></div>`;
}

$('#app').innerHTML = `
<header class="site-header"><a class="brand" href="#" aria-label="Vector Ballistics Workbench">${logo}<span>VECTOR<span class="brand-sub">BALLISTICS WORKBENCH</span></span></a>
  <nav aria-label="Main navigation"><a href="#results">Workbench</a><a href="#calculators">Calculators</a><button id="notes-button" class="nav-button">Model notes</button></nav>
  <div class="local-status"><span class="status-dot"></span><span id="activity">COMPUTED ON YOUR DEVICE</span></div>
</header>
<main class="page">
  <section class="page-intro"><div><div class="eyebrow">EXTERNAL BALLISTICS / GNU LIBRARY</div><h1>The flight, in full.</h1><p>A clearer view of every load. Build, calculate, and compare.</p></div>
    <div class="unit-preset"><span id="unit-state">Imperial units</span><div class="segmented" role="group" aria-label="Unit preset"><button data-preset="imperial" aria-pressed="true">Imperial</button><button data-preset="metric" aria-pressed="false">Metric</button></div></div>
  </section>
  <div class="mode-switch segmented" role="group" aria-label="Calculation mode"><button data-mode="trajectory" aria-pressed="true">Trajectory</button><button data-mode="maximum-range" aria-pressed="false">Maximum range</button></div>
  <div class="workspace-storage"><p id="workspace-status" class="status-message" role="status" aria-live="polite">Restoring workspace…</p><button id="workspace-retry" class="text-button" hidden>Save this workspace instead</button></div>
  <section id="maximum-range-mode" aria-label="Maximum-range study" hidden></section>
  <div class="workspace">
    <aside class="editor"><form id="load-form" novalidate>
      <div class="card-title"><div><span class="eyebrow">01 / CONFIGURE</span><h2>Your load</h2></div><span class="small-badge">6 DRAG MODELS</span></div>
      <div class="field name-field"><label for="load-name">Solution name</label><input id="load-name" data-field="name" type="text" maxlength="100" required autocomplete="off" /></div>
      <fieldset><legend>Projectile</legend><button type="button" id="open-bullet-database" class="button secondary database-open">Choose from bullet database</button><div class="two-fields">${field('massKg')}${field('muzzleMps')}</div>
        <div class="two-fields"><div class="field"><label for="drag-model">Drag model</label><select id="drag-model" data-field="dragModel">${options(dragModels)}</select></div>${field('bc')}</div>
      </fieldset>
      <fieldset><legend>Sight &amp; aiming</legend><div class="field"><label for="aim-mode">Aiming mode</label><select id="aim-mode"><option value="zero">Zero at range and height</option><option value="angle">Disable zeroing · manual angle</option></select></div>
        ${field('sightHeightM')}<div id="zero-settings"><div class="two-fields">${field('zeroRangeM')}${field('zeroHeightM')}</div><p class="field-hint">Zero height is impact above (+) or below (−) the sight line at the zero range, in level, calm sight-in.</p></div>
        <div id="angle-settings" hidden>${field('boreAngleDeg')}<p class="field-hint">Bore elevation relative to the sight line, −45° to 45°. Shooting angle tilts the sight line.</p></div>
        ${field('inclinationDeg')}</fieldset>
      <fieldset><legend>Wind</legend><div class="two-fields">${field('windMps')}${field('windDeg')}</div>
        <div class="wind-key"><span>0° head</span><span>90° from right</span><span>180° tail</span></div>
      </fieldset>
      <div class="form-actions"><button type="submit" class="button primary" data-task="solve">Calculate trajectory ${arrow}</button>
        <button type="button" id="save-solution" class="button secondary" disabled>+ Save to comparison</button><button type="button" id="overwrite-solution" class="button secondary" disabled>Overwrite edited solution</button></div>
      <p id="form-status" class="status-message" role="status" aria-live="polite">Preparing your reference load…</p>
    </form><div class="editor-footer"><span class="status-dot"></span>Solutions and previews are saved locally on this device.</div></aside>
    <div class="results" id="results">
      <section class="comparison-section"><div class="section-heading"><div><span class="eyebrow">02 / COMPARE</span><h2>Solution library <span id="solution-count" class="count-pill">0</span></h2></div><span class="subtle">Toggle a load to overlay it</span></div>
        <p class="reorder-hint">Drag a card grip to reorder, or focus it and use arrow keys.</p><div id="saved-solutions" class="solution-list"></div><div id="preview-banner" class="preview-banner" hidden></div>
      </section>
      <section class="range-panel" aria-label="Display range"><div class="range-heading"><span class="eyebrow">DISTANCE WINDOW</span><span class="subtle">Saved solutions recalculate automatically</span></div>
        <div class="range-fields"><div class="field"><label for="range-min">From</label><input id="range-min" type="number" step="any" /></div><div class="field"><label for="range-max">To</label><input id="range-max" type="number" step="any" /></div>
          <div class="field"><label for="range-step">Table step</label><input id="range-step" type="number" step="any" /></div><div class="field"><label for="range-unit">Unit</label><select id="range-unit" data-output-unit="range">${options(['yd', 'm'])}</select></div>
        </div><p id="range-status" class="status-message" role="status" aria-live="polite"></p><p id="range-error" class="status-message error" role="alert" hidden></p>
        <div class="output-units"><span>Display units</span>${(['path', 'speed', 'energy', 'angle'] as const).map(key => `<label>${({ path: 'Path / drift', speed: 'Speed', energy: 'Energy', angle: 'Correction' })[key]}<select aria-label="${key} display unit" data-output-unit="${key}">${options(({ path: ['in', 'cm', 'mm'], speed: ['ft/s', 'm/s'], energy: ['ft·lbf', 'J'], angle: ['MOA', 'mrad'] })[key])}</select></label>`).join('')}</div>
      </section>
      <section aria-label="Ballistic plots" class="plots-section"><div class="chart-card trajectory-card"><div class="chart-heading"><div><span class="eyebrow">THE FLIGHT PATH</span><h2>Trajectory</h2></div><span id="plot-window" class="chart-note"></span></div><div id="chart-legend" class="chart-legend"></div>
        <div class="chart-space"><canvas id="trajectory-chart" role="img" aria-label="Trajectory comparison; exact values are available in the results table."></canvas></div><p class="chart-footnote">Path relative to the line of sight. Positive is above the sight line.</p></div>
        <div class="small-charts"><div class="chart-card"><div class="chart-heading"><div><span class="eyebrow">RETAINED VELOCITY</span><h3>Speed</h3></div><span class="chart-symbol">↗</span></div><div class="small-chart-space"><canvas id="speed-chart" role="img" aria-label="Speed comparison; exact values are available in the results table."></canvas></div></div>
          <div class="chart-card"><div class="chart-heading"><div><span class="eyebrow">DOWNRANGE PERFORMANCE</span><h3>Energy</h3></div><span class="chart-symbol">↘</span></div><div class="small-chart-space"><canvas id="energy-chart" role="img" aria-label="Energy comparison; exact values are available in the results table."></canvas></div></div></div>
      </section>
      <section id="calculators" class="calculator-section"><div class="section-heading"><div><span class="eyebrow">03 / EXPLORE</span><h2>Go beyond the zero</h2></div></div>
        <div class="calculator-source"><div class="field"><label for="calculator-solution">Calculator source · energy &amp; PBR</label><select id="calculator-solution"></select></div><div class="field"><label for="search-distance">Search up to</label><div class="number-field"><input id="search-distance" type="number" step="any" /><select id="search-unit" aria-label="Calculator search distance unit">${options(['yd', 'm'])}</select></div></div></div>
        <p id="source-summary" class="source-summary"></p>
        <div class="calculator-grid"><article class="calculator-card"><div class="calculator-title"><span class="tool-icon">◎</span><div><h3>Optimum point-blank range</h3><p>Find a zero that makes the most of your target zone.</p></div></div>
          <div class="field pbr-reference"><label for="pbr-zero-range">PBR reference zero range</label><div class="number-field"><input id="pbr-zero-range" type="number" step="any" /><select id="pbr-zero-unit" aria-label="PBR reference zero range unit">${options(['yd', 'm'])}</select></div></div>
          <label for="target-diameter">Target-zone diameter</label><div class="calculator-input"><div class="number-field"><input id="target-diameter" type="number" step="any" /><select id="diameter-unit" aria-label="Target diameter unit">${options(['in', 'cm', 'mm'])}</select></div><button id="calculate-pbr" data-task="pbr" class="button secondary">Optimize ${arrow}</button></div>
          <p class="field-hint" id="radius-hint"></p><p id="pbr-status" class="status-message" role="status"></p><div id="pbr-result" class="calculator-result"></div><button id="save-pbr" class="button subtle-button" hidden>+ Add optimized load to comparison</button>
        </article><article class="calculator-card"><div class="calculator-title"><span class="tool-icon">ϟ</span><div><h3>Distance to energy threshold</h3><p>See where retained energy meets your chosen floor.</p></div></div>
          <label for="threshold-energy">Minimum energy</label><div class="calculator-input"><div class="number-field"><input id="threshold-energy" type="number" step="any" /><select id="threshold-unit" aria-label="Energy threshold unit">${options(['ft·lbf', 'J'])}</select></div><button id="calculate-energy" data-task="energy" class="button secondary">Find distance ${arrow}</button></div>
          <p class="field-hint">First downward crossing, using unrounded flight data.</p><p id="energy-status" class="status-message" role="status"></p><div id="energy-result" class="calculator-result"></div>
        </article></div>
      </section>
      <section class="table-section" id="table-results"><div class="section-heading"><div><span class="eyebrow">04 / INSPECT</span><h2>The numbers behind the flight</h2></div><span id="table-count" class="subtle"></span></div>
        <div class="table-wrapper" tabindex="0" role="region" aria-label="Scrollable ballistic comparison table"><table id="solution-table"></table></div><p class="table-note">Corrections oppose displacement. Flight time is from muzzle to distance. — means undefined or outside calculated coverage.</p>
      </section>
    </div>
  </div>
  <footer class="site-footer"><span>${logo} VECTOR <span class="footer-divider">/</span> EXTERNAL BALLISTICS</span><span>GNU Ballistics Library · GPL-2.0 · <button class="text-button" id="footer-notes">Model &amp; license notes</button></span></footer>
</main>
<div id="task-bar" class="task-bar" hidden><span class="spinner"></span><span id="task-label">Calculating…</span><button id="cancel-task" class="text-button">Cancel</button></div>
<dialog id="notes-dialog"><button id="close-notes" class="dialog-close" aria-label="Close model notes">×</button><span class="eyebrow">UNDER THE MODEL</span><h2>A transparent calculation.</h2><p>Vector uses the GNU Ballistics drag laws G1, G2, G5, G6, G7 and G8 with bounded numerical integration. A ballistic coefficient belongs to its drag model; switching models does not convert the coefficient.</p><p>Zero range describes a level, calm sight-in. Shooting angle and wind apply to the subsequent shot. Distances follow the line-of-sight axis, rather than horizontal ground distance. Path is measured from that sight line.</p><p>Wind direction is where wind comes from: 0° headwind, 90° from the right, 180° tailwind and 270° from the left. Positive drift is leftward. Corrections point opposite displacement. Crosswind drift uses the original flight-time-lag approximation.</p><p>Atmospheric corrections, spin drift, Coriolis and a full vector-wind model are not included. Point-blank range optimizes the vertical corridor. If the muzzle starts below the corridor, the near entry is reported explicitly.</p><p>Solutions and calculated previews are stored locally on this device. Changing display units preserves physical values. Distance-window edits recalculate every saved trajectory at its resolved angle; model limits can still shorten coverage.</p><p>Bullet library: ${bulletDatabaseCredit}. The picker includes the full MIT notice, also preserved in <a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener">third-party notices</a>.</p><p>This project is distributed under the GNU GPL version 2, without warranty. Derek Yates authored the original GNU Ballistics C library. <a href="https://github.com/harriris/external-ballistics-js" target="_blank" rel="noopener">Harri Rissanen</a> created the JavaScript port; this project is <a href="https://github.com/pmaanen/external-ballistics-js" target="_blank" rel="noopener">Paul Maanen’s fork</a> of that port. <a href="./LICENSE.txt" target="_blank" rel="noopener">Read the license</a>.</p></dialog>`;

$('#open-bullet-database').addEventListener('click', () => chooseBullet(draft.dragModel, selection => {
  draft = { ...draft, ...selection }; renderInputs(); dirty();
  setStatus('form-status', Number.isFinite(selection.bc) ? 'Bullet loaded from WilsonKinetics. Check your muzzle velocity, then calculate.' : 'Bullet loaded from WilsonKinetics. Enter its BC and check your muzzle velocity before calculating.', !Number.isFinite(selection.bc));
}));
const plots = new Plots();
const maximumRangeMode = new MaximumRangeMode($('#maximum-range-mode'), {
  preferences: () => prefs, savedLoads: () => store.items, changed: () => persistWorkspace(),
  setPreferences: next => { prefs = { ...next }; renderInputs(); renderRangeInputs(); renderCalculatorInputs(); render(); },
});
function switchMode(mode: string): void {
  currentMode = mode === 'maximum-range' ? 'maximum-range' : 'trajectory';
  $<HTMLAnchorElement>('.skip-link').href = mode === 'maximum-range' ? '#max-range-form' : '#load-form';
  $('.workspace').hidden = mode !== 'trajectory';
  $('#maximum-range-mode').hidden = mode !== 'maximum-range';
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  maximumRangeMode.sync(); maximumRangeMode.resize(); persistWorkspace();
}
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode!)));
document.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => switchMode('trajectory')));
const inputNumber = (id: string) => {
  const input = $<HTMLInputElement>(`#${id}`);
  return input.value.trim() ? Number(input.value) : NaN;
};
const editable = (n: number) => Number.isFinite(n) ? String(Number(n.toPrecision(12))) : '';
function setStatus(id: string, message: string, error = false): void {
  const element = $(`#${id}`); element.textContent = message; element.classList.toggle('error', error);
}
function updateUnitsState(): void {
  const active = (['imperial', 'metric'] as const).find(preset => Object.entries(presets[preset]).every(([k, v]) => prefs[k as keyof UnitPreferences] === v));
  $('#unit-state').textContent = active ? `${active === 'metric' ? 'Metric' : 'Imperial'} units` : 'Mixed units';
  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === active)));
}
function renderAimMode(): void {
  $<HTMLSelectElement>('#aim-mode').value = draft.aimMode;
  for (const [id, mode] of [['zero-settings', 'zero'], ['angle-settings', 'angle']]) {
    const section = $(`#${id}`); section.hidden = draft.aimMode !== mode;
    section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(i => i.disabled = Boolean(section.hidden));
  }

}
function renderInputs(): void {
  $<HTMLInputElement>('#load-name').value = draft.name;
  $<HTMLSelectElement>('#drag-model').value = draft.dragModel;
  for (const f of fields) {
    const value = draft[f.key] as number;
    $<HTMLInputElement>(`#${f.id}`).value = editable(f.pref ? fromSI(value, prefs[f.pref]) : value);
    if (f.pref) $<HTMLSelectElement>(`[data-input-unit="${f.pref}"]`).value = prefs[f.pref];
  }
  renderAimMode(); updateUnitsState();
}
function renderRangeInputs(): void {
  for (const key of ['min', 'max', 'step'] as const) $<HTMLInputElement>(`#range-${key}`).value = editable(fromSI(view[key], prefs.range));
  document.querySelectorAll<HTMLSelectElement>('[data-output-unit]').forEach(select => select.value = prefs[select.dataset.outputUnit as keyof UnitPreferences]);
}
function renderCalculatorInputs(): void {
  $<HTMLInputElement>('#pbr-zero-range').value = editable(fromSI(pbrZeroRangeM, prefs.zero));
  $<HTMLSelectElement>('#pbr-zero-unit').value = prefs.zero;
  $<HTMLInputElement>('#threshold-energy').value = editable(fromSI(thresholdJ, thresholdUnit));
  $<HTMLSelectElement>('#threshold-unit').value = thresholdUnit;
  $<HTMLInputElement>('#target-diameter').value = editable(fromSI(diameterM, diameterUnit));
  $<HTMLSelectElement>('#diameter-unit').value = diameterUnit;
  $<HTMLInputElement>('#search-distance').value = editable(fromSI(searchM, searchUnit));
  $<HTMLSelectElement>('#search-unit').value = searchUnit;
  $('#radius-hint').textContent = `Corridor: ±${format(diameterM / 2, diameterUnit)} ${diameterUnit} about the sight line.`;
}
function series(): Series[] {
  const result: Series[] = store.visible().map(s => ({ ...s }));
  if (preview) result.push({ id: 'preview', name: `Preview · ${preview.inputs.name}`, result: preview, color: '#e4eee7', dash: [5, 4] });
  if (pbr && !pbrSavedId) result.push({ id: 'pbr', name: 'Optimized point-blank load', result: pbr.solution, color: '#f9bd6a', dash: [7, 4] });
  return result;
}
function renderSaved(): void {
  $('#solution-count').textContent = String(store.items.length);
  $('#saved-solutions').innerHTML = store.items.length ? store.items.map(item => `<div class="saved-solution${item.visible ? '' : ' is-hidden'}" data-card-id="${item.id}" style="--series-color:${item.color}">${dragGrip(item.id, item.name)}
    <label class="visibility-toggle"><input type="checkbox" data-visible="${item.id}" ${item.visible ? 'checked' : ''} aria-label="Show ${escapeHtml(item.name)}" /><span></span></label>
    <div class="saved-body"><input class="solution-name" data-rename="${item.id}" value="${escapeHtml(item.name)}" maxlength="100" aria-label="Name for ${escapeHtml(item.name)}" />
      <span class="solution-meta">${item.result.inputs.dragModel} · BC ${item.result.inputs.bc} · ${format(item.result.inputs.massKg, prefs.mass, 1)} ${prefs.mass} · ${format(item.result.maxDistanceM, prefs.range, 0)} ${prefs.range}${item.result.trajectory.termination !== 'requested-range' ? ' · model limit' : ''}</span></div>
    <div class="solution-actions"><button data-action="edit" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}" title="Load into editor">↗</button><button ${busyKind === 'recalculate' ? 'disabled' : ''} data-action="duplicate" data-id="${item.id}" aria-label="Duplicate ${escapeHtml(item.name)}" title="Duplicate">⧉</button><button data-action="remove" data-id="${item.id}" aria-label="Remove ${escapeHtml(item.name)}" title="Remove">×</button></div></div>`).join('') : '<div class="empty-library">Your comparison starts here. Calculate a trajectory, then save it.</div>';
  const banner = $('#preview-banner'); banner.hidden = !preview;
  if (preview) banner.textContent = `Unsaved preview · ${preview.inputs.name} · ${format(preview.zeroAngleDeg, undefined, 4)}° bore elevation — save it to keep this calculation.`;
  const select = $<HTMLSelectElement>('#calculator-solution');
  select.innerHTML = store.items.length ? store.items.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">Save a solution first</option>';
  select.value = activeId;
  const item = store.items.find(s => s.id === activeId);
  $('#source-summary').textContent = item ? `${item.result.inputs.dragModel} / BC ${item.result.inputs.bc} · ${format(item.result.inputs.muzzleMps, prefs.speed, 0)} ${prefs.speed} · ${item.result.inputs.aimMode === 'zero' ? `${format(item.result.inputs.zeroRangeM, prefs.range, 1)} ${prefs.range} zero · ` : ''}${item.result.inputs.inclinationDeg}° shot · ${item.result.inputs.aimMode === 'zero' ? `${format(item.result.inputs.zeroHeightM, prefs.zeroHeight)} ${prefs.zeroHeight} zero height` : `${format(item.result.zeroAngleDeg, undefined, 4)}° bore / ${item.result.inputs.aimMode === 'angle' ? 'manual angle' : 'optimum ground-range angle'}`}` : 'Save a solution to use the calculators.';
}
function resultMetric(label: string, value: string): string { return `<div><span>${label}</span><strong>${value}</strong></div>`; }
function renderCalculatorResults(): void {
  $('#save-pbr').hidden = !pbr; $<HTMLButtonElement>('#save-pbr').disabled = !!pbrSavedId || !!busyKind;
  $('#save-pbr').textContent = pbrSavedId ? '✓ Optimized load saved' : '+ Add optimized load to comparison';
  if (pbr) {
    $('#pbr-result').innerHTML = `<div class="result-lead">${format(pbr.farExit.distanceM, prefs.range, 1)}<span>${prefs.range}</span></div><p class="result-label">Maximum point-blank range</p><div class="result-grid">
      ${resultMetric(`Zero height at ${format(pbr.zeroRangeM, prefs.zero, 1)} ${prefs.zero}`, pbr.zeroAtRange ? `${format(pbr.zeroAtRange.pathM, prefs.zeroHeight)} ${prefs.zeroHeight}` : 'Outside verified coverage')}
      ${resultMetric('Near entry', `${format(pbr.nearEntry.distanceM, prefs.range, 1)} ${prefs.range}`)}${resultMetric('Far zero', `${format(pbr.farZero?.distanceM ?? null, prefs.range, 1)} ${prefs.range}`)}
      ${resultMetric('Near zero', `${format(pbr.nearZero?.distanceM ?? null, prefs.range, 1)} ${prefs.range}`)}${resultMetric('Peak height', `${format(pbr.apex.pathM, prefs.path)} ${prefs.path}`)}
      ${resultMetric('Peak distance', `${format(pbr.apex.distanceM, prefs.range, 1)} ${prefs.range}`)}${resultMetric('Bore elevation', `${format(pbr.solution.zeroAngleDeg, undefined, 4)}°`)}
      ${resultMetric('Time at exit', `${format(pbr.farExit.timeS, undefined, 3)} s`)}${resultMetric('Energy at exit', `${format(pbr.farExit.energyJ, prefs.energy, 0)} ${prefs.energy}`)}</div>
      <p class="result-note">Zero height is relative to the sight line under the selected shot conditions. ${pbr.muzzleCovered ? 'Within the vertical corridor from muzzle to far exit.' : 'Muzzle starts below the corridor. Coverage begins at the reported near entry.'}</p>`;
  } else $('#pbr-result').innerHTML = '<div class="result-empty"><span>—</span>Your optimized range will appear here.</div>';
  if (energy?.status === 'crossing') {
    $('#energy-result').innerHTML = `<div class="result-lead energy-value">${format(energy.point.distanceM, prefs.range, 1)}<span>${prefs.range}</span></div><p class="result-label">Distance to ${format(energy.thresholdJ, prefs.energy, 0)} ${prefs.energy}</p><div class="result-grid">${resultMetric('Flight time', `${format(energy.point.timeS, undefined, 3)} s`)}${resultMetric('Velocity', `${format(energy.point.speedMps, prefs.speed, 1)} ${prefs.speed}`)}${resultMetric('Energy', `${format(energy.point.energyJ, prefs.energy, 1)} ${prefs.energy}`)}</div>`;
  } else if (energy) {
    $('#energy-result').innerHTML = `<p class="result-outcome">${energy.status === 'already-below' ? 'Already below this threshold at the muzzle.' : `No downward crossing within ${format(energy.searchedM, prefs.range, 0)} ${prefs.range} of verified flight.`}</p>`;
  } else $('#energy-result').innerHTML = '<div class="result-empty"><span>—</span>Your threshold distance will appear here.</div>';
}
function render(): void {
  renderSaved(); renderCalculatorResults(); updateUnitsState(); maximumRangeMode.sync(); updateOverwrite();
  const visible = series();
  $('#chart-legend').innerHTML = visible.map(s => `<span><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('') || '<span>Show or calculate a solution to plot it.</span>';
  $('#plot-window').textContent = `${format(view.min, prefs.range, 0)}–${format(view.max, prefs.range, 0)} ${prefs.range}`;
  plots.render(visible, view, prefs, { pbr, energy }); renderTable(visible, view, prefs);
  $<HTMLButtonElement>('#save-solution').disabled = !preview || !!busyKind;
  persistWorkspace();
}
function setBusy(kind: Task['kind'] | null): void {
  busyKind = kind;
  document.querySelectorAll<HTMLButtonElement>('[data-task]').forEach(b => b.disabled = !!kind);
  $('#task-bar').hidden = !kind;
  $('#activity').textContent = kind ? 'CALCULATING LOCALLY' : 'COMPUTED ON YOUR DEVICE';
  $('#task-label').textContent = kind === 'recalculate' ? 'Recalculating saved trajectories…' : kind === 'pbr' ? 'Optimizing point-blank range…' : kind === 'energy' ? 'Finding energy crossing…' : 'Calculating trajectory…';
  $<HTMLButtonElement>('#save-solution').disabled = !preview || !!kind;
  $<HTMLButtonElement>('#save-pbr').disabled = !!pbrSavedId || !!kind; updateOverwrite();
  document.querySelectorAll<HTMLButtonElement>('[data-action="duplicate"]').forEach(b => b.disabled = kind === 'recalculate');
}
async function run(task: Task, statusId: string, done: (result: TaskResult) => void, failed?: (message: string) => void): Promise<void> {
  if (busyKind === 'recalculate' && task.kind !== 'recalculate') { setStatus('range-status', 'Distance recalculation replaced by another calculation. Previous window retained.', true); renderRangeInputs(); }
  const id = ++operation;
  setBusy(task.kind); setStatus(statusId, 'Calculating…');
  try {
    const result = await worker.run(task);
    if (id !== operation) return;
    done(result);
  } catch (error) {
    if (id === operation) { const message = error instanceof Error ? error.message : 'Calculation failed.'; setStatus(statusId, message, true); failed?.(message); }
  } finally { if (id === operation) { setBusy(null); render(); } }
}
function dirty(): void {
  if (busyKind === 'solve') worker.cancel();
  const hadPreview = !!preview; preview = null;
  $<HTMLButtonElement>('#save-solution').disabled = true;
  setStatus('form-status', 'Draft changed. Calculate to create a new preview.');
  updateOverwrite(); if (hadPreview) render();
}
function clearCalculators(): void {
  if (busyKind === 'pbr' || busyKind === 'energy') worker.cancel();
  energy = null; pbr = null; pbrSavedId = null;
  setStatus('pbr-status', ''); setStatus('energy-status', '');
}
function savePreview(): void {
  if (!preview) return;
  const item = store.add(preview); preview = null; editingId = '';
  if (!activeId) { activeId = item.id; pbrZeroRangeM = item.result.inputs.zeroRangeM; clearCalculators(); }
  setStatus('form-status', 'Saved to comparison. Edit this draft to explore another load.'); render();
}

$('#aim-mode').addEventListener('change', () => {
  draft.aimMode = $<HTMLSelectElement>('#aim-mode').value as Scenario['aimMode'];
  renderInputs(); dirty();
});
$('#load-form').addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  const key = target.dataset.field as keyof Scenario | undefined;
  if (!key) return;
  target.removeAttribute('aria-invalid');
  if (key === 'name') draft.name = target.value;
  else if (key === 'dragModel') draft.dragModel = target.value as Scenario['dragModel'];
  else {
    const f = fields.find(f => f.key === key)!;
    const value = target.value.trim() ? Number(target.value) : NaN;
    (draft[key] as number) = f.pref ? toSI(value, prefs[f.pref]) : value;
  }
  dirty();
});
$('#load-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!$<HTMLFormElement>('#load-form').reportValidity()) throw new Error('Complete all required fields.');
    validateScenario(draft); distanceGrid(view.min, view.max, view.step);
    if (!$('#range-error').hidden) throw new Error('Correct the display range before calculating.');
    preview = null;
    void run({ kind: 'solve', scenario: { ...draft }, distanceM: view.max }, 'form-status', result => {
      if (result.kind !== 'solve') return;
      preview = result.solution;
      const limited = preview.trajectory.termination !== 'requested-range';
      setStatus('form-status', limited ? `Preview stops at ${format(preview.maxDistanceM, prefs.range, 1)} ${prefs.range} (${preview.trajectory.termination}).` : 'Trajectory ready. Save this preview to compare it.', limited);
    });
  } catch (error) {
    setStatus('form-status', (error as Error).message, true);
    if (error instanceof ScenarioValidationError) {
      const field = $<HTMLInputElement>(error.field === 'aimMode' ? '#aim-mode' : `[data-field="${error.field}"]`);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'form-status');
      field.focus();
    }
  }
});
$('#save-solution').addEventListener('click', savePreview);
$('#overwrite-solution').addEventListener('click', () => {
  if (!preview || !editingId || busyKind || !store.items.some(item => item.id === editingId)) return;
  store.replace(editingId, preview); preview = null;
  if (activeId === editingId) clearCalculators();
  if (pbrSavedId === editingId) { pbr = null; pbrSavedId = null; }
  setStatus('form-status', 'Solution overwritten. Its position, color and visibility were preserved.'); render();
});
document.querySelectorAll<HTMLSelectElement>('[data-input-unit]').forEach(select => select.addEventListener('change', () => {
  const key = select.dataset.inputUnit as keyof UnitPreferences;
  const f = fields.find(f => f.pref === key)!;
  if (!Number.isFinite(draft[f.key])) { select.value = prefs[key]; setStatus('form-status', 'Enter a valid value before changing its unit.', true); return; }
  prefs[key] = select.value as Unit; renderInputs(); renderCalculatorInputs(); render();
}));
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(button => button.addEventListener('click', () => {
  prefs = { ...presets[button.dataset.preset as 'metric' | 'imperial'] };
  thresholdUnit = prefs.energy; diameterUnit = prefs.path; searchUnit = prefs.range;
  renderInputs(); renderRangeInputs(); renderCalculatorInputs(); render();
}));
document.querySelectorAll<HTMLSelectElement>('[data-output-unit]').forEach(select => select.addEventListener('change', () => {
  prefs[select.dataset.outputUnit as keyof UnitPreferences] = select.value as Unit;
  renderRangeInputs(); render();
}));
async function recalculateView(next: ViewRange): Promise<void> {
  const oldPreview = preview;
  clearCalculators();
  const entries = store.items.map(item => ({ id: `saved:${item.id}`, inputs: { ...item.result.inputs, name: item.name }, angleDeg: item.result.zeroAngleDeg }));
  if (oldPreview) entries.push({ id: 'preview', inputs: { ...oldPreview.inputs }, angleDeg: oldPreview.zeroAngleDeg });
  await run({ kind: 'recalculate', entries, distanceM: next.max }, 'range-status', result => {
    if (result.kind !== 'recalculate') return;
    store.replaceBatch(result.results.filter(r => r.id.startsWith('saved:')).map(r => ({ ...r, id: r.id.slice(6) })));
    if (preview === oldPreview) preview = result.results.find(r => r.id === 'preview')?.result ?? null;
    view = next; if (!document.activeElement?.matches('#range-min, #range-max, #range-step')) renderRangeInputs();
    const limited = result.results.filter(r => r.result.trajectory.termination !== 'requested-range').length;
    setStatus('range-status', limited ? `Recalculated. ${limited} trajectory(s) stop at a model limit; missing coverage is shown explicitly.` : 'Saved trajectories recalculated for the distance window.');
  }, message => { if (!document.activeElement?.matches('#range-min, #range-max, #range-step')) renderRangeInputs(); setStatus('range-status', `${message} Previous distance window and calculations retained.`, true); });
}
for (const key of ['min', 'max', 'step']) $(`#range-${key}`).addEventListener('change', () => {
  try {
    const next = { min: toSI(inputNumber('range-min'), prefs.range), max: toSI(inputNumber('range-max'), prefs.range), step: toSI(inputNumber('range-step'), prefs.range) };
    distanceGrid(next.min, next.max, next.step);
    $('#range-error').hidden = true;
    if (next.min !== view.min || next.max !== view.max || next.step !== view.step || busyKind === 'recalculate') void recalculateView(next);
  } catch (error) { $('#range-error').hidden = false; $('#range-error').textContent = (error as Error).message; if (busyKind === 'recalculate') worker.cancel('Invalid distance edit; previous calculations retained.'); }
});
bindCardOrder($('#saved-solutions'), (id, target, after) => { store.move(id, target, after); render(); });
$('#saved-solutions').addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  try {
    if (target.dataset.visible) store.get(target.dataset.visible).visible = target.checked;
    if (target.dataset.rename) store.rename(target.dataset.rename, target.value);
    render();
  } catch (error) { setStatus('form-status', (error as Error).message, true); render(); }
});
$('#saved-solutions').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const id = button.dataset.id!, item = store.get(id);
  if (button.dataset.action === 'edit') {
    editingId = item.id; draft = editableInputs(item.result, item.name); renderInputs(); dirty();
    setStatus('form-status', 'Editing saved solution. Calculate, then overwrite it or save a new solution.');
    $<HTMLInputElement>('#load-name').focus();
  } else if (button.dataset.action === 'duplicate') store.duplicate(id);
  else {
    store.remove(id);
    if (editingId === id) editingId = '';
    if (activeId === id) { activeId = store.items[0]?.id ?? ''; pbrZeroRangeM = store.items[0]?.result.inputs.zeroRangeM ?? defaultScenario.zeroRangeM; clearCalculators(); renderCalculatorInputs(); }
    if (pbrSavedId === id) { pbr = null; pbrSavedId = null; }
  }
  render();
});
$('#calculator-solution').addEventListener('change', event => {
  activeId = (event.target as HTMLSelectElement).value; pbrZeroRangeM = store.get(activeId).result.inputs.zeroRangeM; clearCalculators(); renderCalculatorInputs(); render();
});
for (const id of ['threshold-energy', 'target-diameter', 'search-distance', 'pbr-zero-range']) $(`#${id}`).addEventListener('input', () => {
  if (id === 'pbr-zero-range') { pbrZeroRangeM = toSI(inputNumber(id), prefs.zero); pbr = null; pbrSavedId = null; if (busyKind === 'pbr') worker.cancel(); }
  if (id === 'threshold-energy') { thresholdJ = toSI(inputNumber(id), thresholdUnit); energy = null; if (busyKind === 'energy') worker.cancel(); }
  if (id === 'target-diameter') { diameterM = toSI(inputNumber(id), diameterUnit); pbr = null; pbrSavedId = null; if (busyKind === 'pbr') worker.cancel(); }
  if (id === 'search-distance') { searchM = toSI(inputNumber(id), searchUnit); clearCalculators(); }
  $('#radius-hint').textContent = `Corridor: ±${format(diameterM / 2, diameterUnit)} ${diameterUnit} about the sight line.`;
  render();
});
for (const id of ['threshold-unit', 'diameter-unit', 'search-unit', 'pbr-zero-unit']) $(`#${id}`).addEventListener('change', event => {
  const unit = (event.target as HTMLSelectElement).value as Unit;
  if (id === 'pbr-zero-unit') { prefs.zero = unit; renderInputs(); render(); }
  if (id === 'threshold-unit') thresholdUnit = unit;
  if (id === 'diameter-unit') diameterUnit = unit;
  if (id === 'search-unit') searchUnit = unit;
  renderCalculatorInputs();
});
function calculationSource() {
  if (!activeId) throw new Error('Save a solution before using the calculators.');
  if (!Number.isFinite(searchM) || searchM < 1 || searchM > 10000) throw new Error('Calculator search distance must be between 1 and 10,000 m.');
  return store.get(activeId);
}
$('#calculate-energy').addEventListener('click', () => {
  try {
    const item = calculationSource();
    if (!Number.isFinite(thresholdJ) || thresholdJ <= 0) throw new Error('Enter a positive energy threshold.');
    energy = null;
    void run({ kind: 'energy', solution: item.result, thresholdJ, distanceM: searchM }, 'energy-status', result => {
      if (result.kind === 'energy') { energy = result.result; setStatus('energy-status', `Calculated from ${item.name}.`); }
    });
  } catch (error) { setStatus('energy-status', (error as Error).message, true); }
});
$('#calculate-pbr').addEventListener('click', () => {
  try {
    const item = calculationSource();
    if (!Number.isFinite(diameterM) || diameterM <= 0) throw new Error('Enter a positive target diameter.');
    pbr = null; pbrSavedId = null;
    void run({ kind: 'pbr', scenario: { ...item.result.inputs, name: item.name, zeroRangeM: pbrZeroRangeM }, diameterM, distanceM: searchM }, 'pbr-status', result => {
      if (result.kind === 'pbr') { pbr = result.result; setStatus('pbr-status', 'Optimum verified within the vertical corridor.'); }
    });
  } catch (error) { setStatus('pbr-status', (error as Error).message, true); }
});
$('#save-pbr').addEventListener('click', () => { if (pbr && !pbrSavedId) { pbrSavedId = store.add(pbr.solution).id; render(); } });
$('#cancel-task').addEventListener('click', () => worker.cancel());
const dialog = $<HTMLDialogElement>('#notes-dialog');
$('#notes-button').addEventListener('click', () => dialog.showModal());
$('#footer-notes').addEventListener('click', () => dialog.showModal());
$('#close-notes').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
window.addEventListener('pagehide', () => { worker.cancel(); plots.destroy(); maximumRangeMode.destroy(); });

function editableInputs(result: Solution, name = result.inputs.name): Scenario {
  return { ...result.inputs, name, ...(result.inputs.aimMode === 'maximum-range' ? { aimMode: 'angle' as const, boreAngleDeg: result.zeroAngleDeg } : {}) };
}
function updateOverwrite(): void {
  const item = store.items.find(s => s.id === editingId);
  $<HTMLButtonElement>('#overwrite-solution').disabled = !item || !preview || !!busyKind;
  $('#overwrite-solution').textContent = item ? `Overwrite ${item.name}` : 'Overwrite edited solution';
}
function persistWorkspace(): void {
  if (!hydrated || !persistenceEnabled) return;
  const state: WorkspaceState = { schema: 1, solutions: store.snapshot(), preview, editingId,
    activeId, preferences: { ...prefs }, view: { ...view }, mode: currentMode, maximum: maximumRangeMode.snapshot() };
  persistence.save(state);
}
$('#workspace-retry').addEventListener('click', () => { persistenceEnabled = true; $('#workspace-retry').hidden = true; persistWorkspace(); });
async function initializeWorkspace(): Promise<void> {
  let saved: WorkspaceState | null = null;
  try { saved = await persistence.load(); }
  catch (error) {
    persistenceEnabled = false;
    setStatus('workspace-status', `Could not restore local data: ${(error as Error).message} Local saving is paused to preserve that data.`, true);
    $('#workspace-status').dataset.state = 'error'; $('#workspace-retry').hidden = false;
  }
  if (saved) {
    store.restore(saved.solutions); prefs = { ...saved.preferences }; view = { ...saved.view };
    activeId = saved.activeId; editingId = saved.editingId; preview = saved.preview;
    const selected = preview ?? store.items.find(s => s.id === editingId)?.result ?? store.items.find(s => s.id === activeId)?.result;
    if (selected) draft = editableInputs(selected);
    pbrZeroRangeM = store.items.find(s => s.id === activeId)?.result.inputs.zeroRangeM ?? defaultScenario.zeroRangeM;
    thresholdUnit = prefs.energy; diameterUnit = prefs.path; searchUnit = prefs.range;
    renderInputs(); maximumRangeMode.sync(); maximumRangeMode.restore(saved.maximum); switchMode(saved.mode);
    setStatus('form-status', 'Local workspace restored.');
  }
  hydrated = true;
  renderInputs(); renderRangeInputs(); renderCalculatorInputs(); render();
  if (!saved) void run({ kind: 'solve', scenario: { ...draft }, distanceM: view.max }, 'form-status', result => {
    if (result.kind !== 'solve') return;
    activeId = store.add(result.solution).id;
    setStatus('form-status', 'Reference load ready. Change a parameter to explore another flight.');
  });
}
renderInputs(); renderRangeInputs(); renderCalculatorInputs(); render();
void initializeWorkspace();
