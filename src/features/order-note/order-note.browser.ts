import { normalizeOrderNote, noteCharacterCount, saveOrderNote } from './order-note.service';
import type { CartMode } from '../add-to-cart/add-to-cart.types';
import type { NoteDemoOutcome, OrderNoteSavedDetail } from './order-note.types';

export function initOrderNoteFields(): void {
  document.querySelectorAll<HTMLFormElement>('[data-order-note]').forEach(form => {
    if (form.dataset.enhanced === 'true') return;
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
    const button = form.querySelector<HTMLButtonElement>('button')!;
    const counter = form.querySelector<HTMLElement>('[data-note-count]')!;
    const status = form.querySelector<HTMLElement>('[role="status"]')!;
    const available = form.dataset.available === 'true';
    const maxLength = Number(form.dataset.maxLength);
    let saved = normalizeOrderNote(textarea.value);
    let pending = false;

    function updateControls(): void {
      counter.textContent = `${noteCharacterCount(textarea.value)} / ${maxLength}`;
      button.disabled = !available || pending || normalizeOrderNote(textarea.value) === saved;
      button.setAttribute('aria-busy', String(pending));
    }
    textarea.disabled = !available;
    form.dataset.enhanced = 'true';
    updateControls();
    textarea.addEventListener('input', () => {
      textarea.setAttribute('aria-invalid', 'false');
      if (!pending && available) {
        form.dataset.state = 'idle';
        button.textContent = 'Save note';
        status.textContent = normalizeOrderNote(textarea.value) === saved ? 'No unsaved changes.' : 'Unsaved changes.';
      }
      updateControls();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending || !available || normalizeOrderNote(textarea.value) === saved) return;
      const draft = textarea.value;
      const submitted = normalizeOrderNote(draft);
      pending = true;
      form.dataset.state = 'saving';
      button.textContent = 'Saving…';
      status.textContent = 'Saving your note…';
      updateControls();
      const result = await saveOrderNote(draft, maxLength, form.dataset.mode as CartMode, (form.dataset.demoOutcome ?? 'success') as NoteDemoOutcome);
      pending = false;
      form.dataset.state = result.state;
      button.textContent = result.state === 'saved' ? 'Save note' : 'Try again';
      if (result.state === 'saved') {
        saved = result.note;
        // Never overwrite text entered while the request was in flight.
        if (normalizeOrderNote(textarea.value) === submitted) textarea.value = result.note ?? '';
        const dirty = normalizeOrderNote(textarea.value) !== saved;
        status.textContent = dirty ? 'Previous version saved. You have unsaved changes.' : saved === null ? 'Order note cleared.' : 'Order note saved.';
        textarea.setAttribute('aria-invalid', 'false');
        form.dispatchEvent(new CustomEvent<OrderNoteSavedDetail>('ordernotesaved', { bubbles: true, detail: { orderNote: saved } }));
      } else {
        status.textContent = result.message;
        textarea.setAttribute('aria-invalid', String(result.invalid));
      }
      updateControls();
    });
  });
}
