import type { APIRoute } from 'astro';
import { readCartConfig } from '../../../features/add-to-cart/add-to-cart.server.api';
import { isRecord } from '../../../features/add-to-cart/add-to-cart.api';
import { loadOrderNote, persistOrderNote } from '../../../features/order-note/order-note.server.api';
import { validateOrderNote } from '../../../features/order-note/order-note.service';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Cookie' };
export const GET: APIRoute = async ({ request }) => {
  try {
    const config = readCartConfig(process.env);
    if (config.mode !== 'live') return new Response(JSON.stringify({ ok: false, reason: 'live_not_enabled', uncertain: false }), { status: 503, headers });
    const result = await loadOrderNote(config, request);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 503, headers });
  } catch { return new Response(JSON.stringify({ ok: false, reason: 'unavailable', uncertain: false }), { status: 503, headers }); }
};

export const POST: APIRoute = async ({ request }) => {
  const origin = `${new URL(request.url).protocol}//${request.headers.get('host')}`;
  if (request.headers.get('origin') !== origin) return new Response(JSON.stringify({ ok: false, reason: 'refused', uncertain: false }), { status: 403, headers });
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !Object.hasOwn(body, 'order_note')) throw new TypeError('Expected an explicit note.');
    const parsed = validateOrderNote(body.order_note);
    if (!parsed.ok) return new Response(JSON.stringify({ ok: false, reason: parsed.reason, uncertain: false }), { status: 400, headers });
    const result = await persistOrderNote(parsed.note, readCartConfig(process.env), request);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, reason: 'unavailable', uncertain: false }), { status: error instanceof TypeError || error instanceof SyntaxError ? 400 : 503, headers });
  }
};
