import { escapeHtml } from './table';

export function dragGrip(id: string, name: string): string {
  return `<button type="button" class="drag-grip" draggable="true" data-drag-id="${escapeHtml(id)}" aria-label="Reorder ${escapeHtml(name)}; use arrow keys" title="Drag to reorder; arrow keys also work">⠿</button>`;
}
export function moveCard<T extends { id: string }>(items: T[], id: string, targetId: string, after = false): void {
  if (id === targetId) return;
  const from = items.findIndex(item => item.id === id);
  if (from < 0 || !items.some(item => item.id === targetId)) return;
  const [item] = items.splice(from, 1);
  items.splice(items.findIndex(item => item.id === targetId) + Number(after), 0, item);
}
export function bindCardOrder(container: HTMLElement, move: (id: string, target: string, after: boolean) => void): void {
  let dragging = '', touchDragging = false;
  const card = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-card-id]') : null;
  const clear = () => { dragging = ''; touchDragging = false; container.querySelectorAll('.is-dragging, .drop-before, .drop-after').forEach(e => e.classList.remove('is-dragging', 'drop-before', 'drop-after')); };
  const destination = (target: HTMLElement | null, y: number) => {
    container.querySelectorAll('.drop-before, .drop-after').forEach(e => e.classList.remove('drop-before', 'drop-after'));
    if (!target || target.dataset.cardId === dragging) return null;
    const rect = target.getBoundingClientRect(), after = y > rect.top + rect.height / 2;
    target.classList.add(after ? 'drop-after' : 'drop-before');
    return { id: target.dataset.cardId!, after };
  };
  const finish = (target: HTMLElement | null, y: number) => {
    const dest = destination(target, y), id = dragging; clear();
    if (dest && id) move(id, dest.id, dest.after);
  };
  container.addEventListener('dragstart', event => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-drag-id]');
    if (!handle) { event.preventDefault(); return; }
    dragging = handle.dataset.dragId!; card(handle)?.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', dragging);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  container.addEventListener('dragover', event => { if (dragging) { event.preventDefault(); destination(card(event.target), event.clientY); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; } });
  container.addEventListener('drop', event => { if (dragging) { event.preventDefault(); finish(card(event.target), event.clientY); } });
  container.addEventListener('dragend', clear);
  container.addEventListener('keydown', event => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-drag-id]');
    if (!handle || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const cards = [...container.querySelectorAll<HTMLElement>('[data-card-id]')], id = handle.dataset.dragId!;
    const index = cards.findIndex(c => c.dataset.cardId === id);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1);
    if (!cards[next] || next === index) return;
    move(id, cards[next].dataset.cardId!, next > index);
    container.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(id)}"]`)?.focus();
  });
  container.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    const handle = (event.target as Element).closest<HTMLElement>('[data-drag-id]');
    if (!handle) return;
    touchDragging = true; dragging = handle.dataset.dragId!; handle.setPointerCapture(event.pointerId); card(handle)?.classList.add('is-dragging');
  });
  container.addEventListener('pointermove', event => { if (dragging && event.pointerType !== 'mouse') destination(card(document.elementFromPoint(event.clientX, event.clientY)), event.clientY); });
  container.addEventListener('pointerup', event => { if (dragging && event.pointerType !== 'mouse') finish(card(document.elementFromPoint(event.clientX, event.clientY)), event.clientY); });
  // Native mouse drag begins by cancelling its pointer stream. That must
  // not erase the HTML drag state before the drop event arrives.
  container.addEventListener('pointercancel', () => { if (touchDragging) clear(); });
}
