import { isRecord } from '../add-to-cart/add-to-cart.api';
import type { CartMode } from '../add-to-cart/add-to-cart.types';
import type { NoteDemoOutcome, OrderNoteReply } from './order-note.types';

export function parseNoteReply(body: unknown, status: number): OrderNoteReply {
  if (status >= 200 && status < 300 && isRecord(body) && body.ok === true
    && (body.order_note === null || typeof body.order_note === 'string')) {
    return { ok: true, order_note: body.order_note };
  }
  if (isRecord(body) && body.ok === false) return {
    ok: false,
    reason: typeof body.reason === 'string' ? body.reason : 'unavailable',
    uncertain: typeof body.uncertain === 'boolean' ? body.uncertain : status >= 500,
  };
  return { ok: false, reason: 'unconfirmed', uncertain: true };
}

// Browser-safe transport. The upstream URL and cart credentials stay on the server.
export async function requestSaveNote(
  note: string | null, mode: CartMode, outcome: NoteDemoOutcome = 'success', fetcher: typeof fetch = fetch,
): Promise<OrderNoteReply> {
  const endpoint = mode === 'demo' ? `/api/cart/demo-order-note?outcome=${outcome}` : '/api/cart/order-note';
  try {
    const response = await fetcher(endpoint, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ order_note: note }),
    });
    return parseNoteReply(await response.json(), response.status);
  } catch {
    return { ok: false, reason: 'unconfirmed', uncertain: true };
  }
}
