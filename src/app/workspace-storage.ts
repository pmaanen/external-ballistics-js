import { decodeWorkspace } from './workspace-state';
import type { WorkspaceState } from './workspace-state';

function preserveNumbers(_key: string, value: unknown): unknown { return typeof value === 'number' && Number.isNaN(value) ? { $vectorNumber: 'NaN' } : value; }
function reviveNumbers(_key: string, value: unknown): unknown { return value && typeof value === 'object' && Object.keys(value).length === 1 && (value as { $vectorNumber?: string }).$vectorNumber === 'NaN' ? NaN : value; }

export const workspaceDatabase = 'vector-ballistics';
export const workspaceFallbackKey = 'vector-ballistics.workspace.v1';
export class WorkspaceStorage {
  private db: IDBDatabase | null = null;
  private fallback = false;
  private pending: WorkspaceState | null = null;
  private writing = false;
  constructor(private status: (state: 'saving' | 'saved' | 'error', message: string) => void) {}
  async load(): Promise<WorkspaceState | null> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(workspaceDatabase, 1);
        const timer = setTimeout(() => reject(new Error('Local database did not open.')), 3000);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
        request.onerror = () => { clearTimeout(timer); reject(request.error); };
        request.onblocked = () => { clearTimeout(timer); reject(new Error('Local database is blocked by another tab.')); };
        request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
      });
    } catch { this.fallback = true; }
    let value: unknown;
    if (this.fallback) {
      const raw = localStorage.getItem(workspaceFallbackKey);
      if (!raw) return null;
      value = JSON.parse(raw, reviveNumbers);
    } else {
      value = await new Promise<unknown>((resolve, reject) => {
        const tx = this.db!.transaction('workspace', 'readonly'), request = tx.objectStore('workspace').get('current');
        tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    }
    if (value == null && !this.fallback) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(workspaceFallbackKey); } catch { /* IndexedDB remains available. */ }
      if (raw) value = JSON.parse(raw, reviveNumbers);
    }
    return value == null ? null : decodeWorkspace(value);
  }
  save(value: WorkspaceState): void {
    this.pending = value;
    this.status('saving', 'Saving workspace on this device…');
    if (!this.writing) void this.drain();
  }
  private async drain(): Promise<void> {
    this.writing = true;
    while (this.pending) {
      const value = this.pending; this.pending = null;
      try {
        if (this.fallback) localStorage.setItem(workspaceFallbackKey, JSON.stringify(value, preserveNumbers));
        else {
          if (!this.db) throw new Error('Local storage is unavailable.');
          await new Promise<void>((resolve, reject) => {
            const tx = this.db!.transaction('workspace', 'readwrite'); tx.objectStore('workspace').put(value, 'current');
            tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
          });
        }
        if (!this.pending) this.status('saved', 'Workspace saved on this device.');
      } catch (error) {
        this.pending = null;
        this.status('error', `Could not save locally: ${(error as Error)?.message || 'storage unavailable'}. Keep this tab open to retain your current workspace.`);
      }
    }
    this.writing = false;
  }
}
