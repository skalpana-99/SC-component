import type { APIRoute } from 'astro';
import { isRecord } from '../../../features/add-to-cart/add-to-cart.api';
import { validateOrderNote } from '../../../features/order-note/order-note.service';

export const POST: APIRoute = async ({ request, url }) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !Object.hasOwn(body, 'order_note')) throw new TypeError('Missing note.');
    const parsed = validateOrderNote(body.order_note);
    if (!parsed.ok) return new Response(JSON.stringify({ ok: false, reason: parsed.reason, uncertain: false }), { status: 400, headers });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (url.searchParams.get('outcome') === 'error') return new Response(JSON.stringify({ ok: false, reason: 'order_note_not_sendable', uncertain: false }), { status: 400, headers });
    if (url.searchParams.get('outcome') === 'uncertain') return new Response(JSON.stringify({ ok: false, reason: 'unconfirmed', uncertain: true }), { status: 502, headers });
    return new Response(JSON.stringify({ ok: true, order_note: parsed.note }), { headers });
  } catch { return new Response(JSON.stringify({ ok: false, reason: 'order_note_not_text', uncertain: false }), { status: 400, headers }); }
};
