import { distanceGrid, sampleAt } from '../ballistics/model';
import { format } from '../ballistics/units';
import type { UnitPreferences } from '../ballistics/units';
import type { Series, ViewRange } from './plots';

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderTable(series: Series[], range: ViewRange, prefs: UnitPreferences): void {
  const table = document.querySelector<HTMLTableElement>('#solution-table')!;
  if (!series.length) {
    table.innerHTML = '<caption>Show a solution to see its results.</caption>';
    document.querySelector('#table-count')!.textContent = 'No visible solutions';
    return;
  }
  const grid = distanceGrid(range.min, range.max, range.step);
  const header = [
    ['Path', prefs.path], ['Elevation', prefs.angle], ['Speed', prefs.speed], ['Energy', prefs.energy],
    ['Wind drift', prefs.path], ['Wind correction', prefs.angle], ['Flight time', 's'],
  ];
  table.innerHTML = `<caption class="sr-only">Ballistic comparison at exact distances. Path is relative to the line of sight. Corrections oppose displacement. Flight time is cumulative from muzzle to distance. An em dash means unavailable.</caption>
    <thead><tr><th rowspan="2" scope="col" class="distance-head">Distance<span>${prefs.range}</span></th>
    ${series.map(s => `<th colspan="7" scope="colgroup" class="solution-head" style="--series-color:${s.color}">${escapeHtml(s.name)}</th>`).join('')}</tr>
    <tr>${series.map(() => header.map(([name, unit]) => `<th scope="col">${name}<span>${unit}</span></th>`).join('')).join('')}</tr></thead>
    <tbody>${grid.map(distance => `<tr><th scope="row">${format(distance, prefs.range, 2)}</th>${series.map(s => {
      const p = sampleAt(s.result, distance);
      if (!p) return '<td class="missing" colspan="7">— outside calculated coverage —</td>';
      return `<td class="path-cell">${format(p.pathM, prefs.path)}</td><td>${format(p.elevationRad, prefs.angle)}</td>
        <td>${format(p.speedMps, prefs.speed)}</td><td>${format(p.energyJ, prefs.energy)}</td>
        <td>${format(p.driftM, prefs.path)}</td><td>${format(p.windCorrectionRad, prefs.angle)}</td>
        <td>${format(p.timeS, undefined, 3)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
  document.querySelector('#table-count')!.textContent = `${grid.length} distances · ${series.length} solution${series.length === 1 ? '' : 's'}`;
}
