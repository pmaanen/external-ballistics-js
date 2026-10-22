import { moveCard } from './card-order';
import type { Solution } from '../ballistics/model';

const colors = ['#a5f27a', '#79c7ff', '#f9b56b', '#e1a0ed', '#69e0cd', '#f98599'];
export interface SavedSolution { id: string; name: string; color: string; dash: number[]; visible: boolean; result: Solution }
function freezeResult(result: Solution): Solution {
  const copy = structuredClone(result);
  Object.freeze(copy.inputs);
  for (const point of copy.trajectory.points) Object.freeze(point);
  Object.freeze(copy.trajectory.points);
  Object.freeze(copy.trajectory);
  return Object.freeze(copy);
}
export class SolutionStore {
  items: SavedSolution[] = [];
  private sequence = 0;
  add(result: Solution): SavedSolution {
    const index = this.sequence++;
    const item = { id: crypto.randomUUID(), name: result.inputs.name,
      color: colors[index % colors.length], dash: index < colors.length ? [] : [6, 4],
      visible: true, result: freezeResult(result) };
    this.items.push(item);
    return item;
  }
  restore(items: SavedSolution[]): void {
    this.items = items.map(item => ({ ...item, dash: [...item.dash], result: freezeResult(item.result) }));
    this.sequence = this.items.length;
  }
  snapshot(): SavedSolution[] { return this.items.map(item => ({ ...item, dash: [...item.dash] })); }
  replace(id: string, result: Solution): void {
    const item = this.get(id); item.result = freezeResult(result); item.name = result.inputs.name;
  }
  replaceBatch(results: { id: string; result: Solution }[]): void {
    const updates = results.filter(update => this.items.some(item => item.id === update.id))
      .map(update => ({ id: update.id, result: freezeResult({ ...update.result, inputs: { ...update.result.inputs, name: this.get(update.id).name } }) }));
    for (const update of updates) this.get(update.id).result = update.result;
  }
  move(id: string, target: string, after = false): void { moveCard(this.items, id, target, after); }
  rename(id: string, name: string): void {
    if (!name.trim() || name.length > 100) throw new Error('Use a name of 1–100 characters.');
    this.get(id).name = name.trim();
  }
  get(id: string): SavedSolution {
    const item = this.items.find(s => s.id === id);
    if (!item) throw new Error('Select a saved solution.');
    return item;
  }
  duplicate(id: string): SavedSolution {
    const item = this.get(id);
    return this.add({ ...item.result, inputs: { ...item.result.inputs, name: `${item.name} · copy`.slice(0, 100) } });
  }
  remove(id: string): void { this.items = this.items.filter(s => s.id !== id); }
  visible(): SavedSolution[] { return this.items.filter(s => s.visible); }
}
