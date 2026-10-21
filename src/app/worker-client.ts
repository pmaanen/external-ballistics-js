import type { Request, Response, Task, TaskResult } from '../workers/protocol';

export class WorkerClient {
  private worker: Worker | null = null;
  private id = 0;
  private pending: { reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  cancel(message = 'Calculation cancelled.'): void {
    this.id++;
    this.worker?.terminate(); this.worker = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(message));
      this.pending = null;
    }
  }
  run(task: Task): Promise<TaskResult> {
    this.cancel();
    const id = ++this.id;
    const worker = this.worker = new Worker(new URL('../workers/solver.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.cancel('Calculation exceeded the 20-second work limit. Try a shorter distance.'), 20000);
      this.pending = { reject, timer };
      const finish = () => { clearTimeout(timer); this.pending = null; worker.terminate(); this.worker = null; };
      worker.onmessage = (event: MessageEvent<Response>) => {
        if (event.data.id !== id || id !== this.id) return;
        finish();
        if (event.data.ok) resolve(event.data.value); else reject(new Error(event.data.error));
      };
      worker.onerror = event => { if (id !== this.id) return; finish(); reject(new Error(event.message || 'Unable to start calculation worker.')); };
      worker.postMessage({ id, task } satisfies Request);
    });
  }
}
