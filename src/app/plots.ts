import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip } from 'chart.js';
import type { ChartDataset, ScatterDataPoint } from 'chart.js';
import { sampleAt } from '../ballistics/model';
import type { Solution } from '../ballistics/model';
import { format, fromSI, toSI } from '../ballistics/units';
import type { Unit, UnitPreferences } from '../ballistics/units';
import type { EnergyResult } from '../calculators/energy';
import type { PointBlankResult } from '../calculators/point-blank';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);
export interface Series { id: string; name: string; color: string; dash: number[]; result: Solution }
export interface ViewRange { min: number; max: number; step: number }
export interface Markers { pbr: PointBlankResult | null; energy: EnergyResult | null }
type Kind = 'trajectory' | 'speed' | 'energy';
const titles: Record<Kind, string> = { trajectory: 'Path relative to line of sight', speed: 'Velocity', energy: 'Kinetic energy' };

export class Plots {
  private charts: Record<Kind, Chart<'line', ScatterDataPoint[]>>;
  private markers: Markers = { pbr: null, energy: null };
  private prefs!: UnitPreferences;
  constructor() {
    this.charts = Object.fromEntries((['trajectory', 'speed', 'energy'] as Kind[]).map(kind => {
      const canvas = document.querySelector<HTMLCanvasElement>(`#${kind}-chart`)!;
      const chart = new Chart<'line', ScatterDataPoint[]>(canvas, {
        type: 'line', data: { datasets: [] },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          parsing: false, elements: { point: { radius: 0, hitRadius: 8 }, line: { borderWidth: 2, tension: 0 } },
          interaction: { mode: 'nearest', intersect: false },
          layout: { padding: { top: 8, right: 10 } },
          scales: {
            x: { type: 'linear', grid: { color: '#ffffff06' }, border: { display: false },
              ticks: { color: '#809287', maxTicksLimit: 7, font: { family: 'monospace', size: 10 } },
              title: { display: true, color: '#85978b', text: 'Distance' } },
            y: { type: 'linear', grid: { color: context => context.tick.value === 0 ? '#b5f78930' : '#ffffff09' },
              border: { display: false }, ticks: { color: '#809287', maxTicksLimit: 6,
                font: { family: 'monospace', size: 10 } },
              title: { display: true, color: '#85978b', text: titles[kind] } },
          },
          plugins: { tooltip: { backgroundColor: '#0c130f', borderColor: '#3f5144', borderWidth: 1,
            titleColor: '#d9e4db', bodyColor: '#b2c3b6', padding: 12 } },
        },
        plugins: [{ id: 'calculator-guides', beforeDatasetsDraw: chart => this.drawGuides(chart, kind) }],
      });
      return [kind, chart];
    })) as Record<Kind, Chart<'line', ScatterDataPoint[]>>;
  }
  render(series: Series[], range: ViewRange, prefs: UnitPreferences, markers: Markers): void {
    this.markers = markers; this.prefs = prefs;
    for (const kind of ['trajectory', 'speed', 'energy'] as Kind[]) {
      const chart = this.charts[kind];
      const unit: Unit = kind === 'trajectory' ? prefs.path : kind === 'speed' ? prefs.speed : prefs.energy;
      const datasets: ChartDataset<'line', ScatterDataPoint[]>[] = series.map(item => {
        const end = Math.min(range.max, item.result.maxDistanceM);
        const xs: number[] = [];
        if (end >= range.min) {
          // This is display-only sampling. Calculators and tables retain all data.
          const count = Math.max(1, Math.min(700, Math.ceil((end - range.min) / .9144)));
          for (let i = 0; i <= count; i++) xs.push(range.min + (end - range.min) * i / count);
        }
        return { label: item.name, borderColor: item.color, backgroundColor: item.color,
          borderDash: item.dash, data: xs.map(x => {
            const p = sampleAt(item.result, x)!;
            return { x: fromSI(x, prefs.range), y: fromSI(kind === 'trajectory' ? p.pathM : kind === 'speed' ? p.speedMps : p.energyJ, unit) };
          }) };
      });
      chart.data.datasets = datasets;
      chart.options.scales!.x!.min = fromSI(range.min, prefs.range);
      chart.options.scales!.x!.max = fromSI(range.max, prefs.range);
      chart.options.scales!.x!.title = { display: true, text: `Distance (${prefs.range})`, color: '#85978b' };
      chart.options.scales!.y!.title = { display: true, text: `${titles[kind]} (${unit})`, color: '#85978b' };
      chart.options.plugins!.tooltip!.callbacks = {
        title: items => items.length ? `${items[0].parsed.x?.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${prefs.range}` : '',
        label: item => `${item.dataset.label}: ${item.parsed.y?.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
        afterLabel: item => {
          const distance = toSI(item.parsed.x!, prefs.range);
          const p = sampleAt(series[item.datasetIndex].result, distance);
          return p ? `Flight time: ${format(p.timeS, undefined, 3)} s` : '';
        },
      };
      chart.update('none');
    }
  }
  private drawGuides(chart: Pick<Chart, 'ctx' | 'chartArea' | 'scales'>, kind: Kind): void {
    if (!this.prefs) return;
    const { ctx, chartArea: area, scales } = chart;
    ctx.save(); ctx.beginPath(); ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top); ctx.clip();
    const horizontal = (value: number, unit: Unit, color: string) => {
      const y = scales.y.getPixelForValue(fromSI(value, unit));
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(area.left, y); ctx.lineTo(area.right, y); ctx.stroke();
    };
    const vertical = (distanceM: number, color: string) => {
      const x = scales.x.getPixelForValue(fromSI(distanceM, this.prefs.range));
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
    };
    const { pbr, energy } = this.markers;
    if (pbr && kind === 'trajectory') {
      horizontal(pbr.radiusM, this.prefs.path, '#f9bd6a99'); horizontal(-pbr.radiusM, this.prefs.path, '#f9bd6a99');
      vertical(pbr.nearEntry.distanceM, '#f9bd6a55'); vertical(pbr.farExit.distanceM, '#f9bd6abb');
      if (pbr.nearZero) vertical(pbr.nearZero.distanceM, '#f9bd6a40');
      if (pbr.farZero) vertical(pbr.farZero.distanceM, '#f9bd6a66');
    }
    if (energy && kind === 'energy') {
      horizontal(energy.thresholdJ, this.prefs.energy, '#79c7ff99');
      if (energy.status === 'crossing') vertical(energy.point.distanceM, '#79c7ffbb');
    }
    ctx.restore();
  }
  destroy(): void { Object.values(this.charts).forEach(chart => chart.destroy()); }
}
