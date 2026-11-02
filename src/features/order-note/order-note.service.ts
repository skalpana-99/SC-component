import { requestSaveNote } from './order-note.api';
import type { CartMode } from '../add-to-cart/add-to-cart.types';
import type { NoteDemoOutcome, OrderNoteFieldData, OrderNoteReadResult, OrderNoteSaveResult, OrderNoteValidation } from './order-note.types';

// Confirmed in Dose's order-note.ts. Change these rules when adopting another contract.
export const ORDER_NOTE_MAX_LENGTH = 500;
const UNWANTED = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function normalizeOrderNote(value: string): string | null {
  const note = value.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\t/g, ' ').replace(UNWANTED, '')
    .split('\n').map(line => line.replace(/\s+$/u, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return note || null;
}

export function noteCharacterCount(value: string): number {
  return [...(normalizeOrderNote(value) ?? '')].length;
}

export function validateOrderNote(value: unknown, maxLength = ORDER_NOTE_MAX_LENGTH): OrderNoteValidation {
  if (value !== null && typeof value !== 'string') return { ok: false, reason: 'order_note_not_text', message: 'Enter the note as plain text.' };
  const note = value === null ? null : normalizeOrderNote(value);
  if (note && [...note].length > maxLength) return { ok: false, reason: 'order_note_too_long', message: `Keep your note within ${maxLength} characters. Your text has not been shortened.` };
  if (note && /coupon/i.test(note)) return { ok: false, reason: 'order_note_not_sendable', message: 'Please reword the note without “coupon”; the order system cannot accept that term.' };
  return { ok: true, note };
}

export async function getOrderNoteField(load: () => Promise<OrderNoteReadResult>): Promise<OrderNoteFieldData> {
  const result = await load();
  return {
    note: result.ok ? result.order_note ?? '' : '', available: result.ok,
    maxLength: ORDER_NOTE_MAX_LENGTH,
    message: result.ok ? '' : result.reason === 'cart_missing'
      ? 'Add an item to your basket before saving an order note.'
      : 'We couldn’t load your saved note. Reload the page to try again.',
  };
}

export async function saveOrderNote(
  draft: string, maxLength: number, mode: CartMode, outcome: NoteDemoOutcome = 'success', submit = requestSaveNote,
): Promise<OrderNoteSaveResult> {
  const parsed = validateOrderNote(draft, maxLength);
  if (!parsed.ok) return { state: 'error', message: parsed.message, invalid: true };
  const reply = await submit(parsed.note, mode, outcome);
  if (reply.ok && reply.order_note === parsed.note) return { state: 'saved', note: reply.order_note };
  if (reply.ok || reply.uncertain) return {
    state: 'uncertain', invalid: false,
    message: 'We couldn’t confirm the save. Your text is still here; you can retry saving it.',
  };
  const messages: Record<string, string> = {
    order_note_too_long: `Keep your note within ${maxLength} characters.`,
    order_note_not_sendable: 'The order system refused this note. Please reword it.',
    order_note_not_text: 'Enter the note as plain text.',
    cart_already_ordered: 'This basket has already been checked out. The note was not saved.',
    cart_missing: 'Add an item to your basket before saving an order note.',
    cart_session_invalid: 'Your basket session is unavailable. Reload the page before trying again.',
    live_not_enabled: 'Live note saving is not enabled for this site.',
  };
  return {
    state: 'error', invalid: reply.reason.startsWith('order_note_'),
    message: Object.hasOwn(messages, reply.reason) ? messages[reply.reason] : 'We couldn’t save your note. Your text is still here; please try again.',
  };
}
