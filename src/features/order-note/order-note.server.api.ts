import fixture from './order-note.demo.json';
import { commerceBaseUrl, cartIdFromToken } from '../add-to-cart/add-to-cart.server.api';
import { isRecord } from '../add-to-cart/add-to-cart.api';
import type { CartConfig } from '../add-to-cart/add-to-cart.types';
import { parseNoteReply } from './order-note.api';
import { validateOrderNote } from './order-note.service';
import type { OrderNoteReadResult, OrderNoteRouteResult } from './order-note.types';

function credential(request: Request): string | undefined {
  return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('dose_cart='))?.slice('dose_cart='.length);
}

export async function loadOrderNote(config: CartConfig, request: Request, fetcher: typeof fetch = fetch): Promise<OrderNoteReadResult> {
  if (config.mode === 'demo') return parseNoteReply(fixture, 200);
  try {
    const base = commerceBaseUrl(config);
    const token = credential(request);
    if (!token) return { ok: false, reason: 'cart_missing', uncertain: false };
    const cartId = cartIdFromToken(token);
    if (!cartId) return { ok: false, reason: 'cart_session_invalid', uncertain: false };
    const response = await fetcher(`${base}/carts/${cartId}/contact`, {
      // This documented server-only read rejects the public-proxy stamp. The signed cart
      // credential still authorises it. Return only order_note, never contact/address fields.
      headers: { Accept: 'application/json', 'x-storefront-credential': token },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body) || body.cart_id !== cartId) return { ok: false, reason: 'unavailable', uncertain: false };
    const parsed = parseNoteReply(body, response.status);
    if (parsed.ok && !validateOrderNote(parsed.order_note).ok) return { ok: false, reason: 'unavailable', uncertain: false };
    return parsed;
  } catch { return { ok: false, reason: 'unavailable', uncertain: false }; }
}

export async function persistOrderNote(
  note: string | null, config: CartConfig, request: Request, fetcher: typeof fetch = fetch,
): Promise<OrderNoteRouteResult> {
  const failure = (status: number, reason: string, uncertain = false): OrderNoteRouteResult => ({ status, body: { ok: false, reason, uncertain } });
  if (config.mode !== 'live') return failure(503, 'live_not_enabled');
  let writing = false;
  try {
    const base = commerceBaseUrl(config);
    const parsed = validateOrderNote(note);
    if (!parsed.ok) return failure(400, parsed.reason);
    const token = credential(request);
    if (!token) return failure(409, 'cart_missing');
    const cartId = cartIdFromToken(token);
    if (!cartId) return failure(401, 'cart_session_invalid');
    writing = true;
    const response = await fetcher(`${base}/carts/${cartId}/contact`, {
      method: 'POST', headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'x-storefront-credential': token, 'x-dose-public-caller': 'storefront',
      },
      // Note-only path: do not send email, contact, address, opt-in or other cart data.
      body: JSON.stringify({ order_note: parsed.note }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    const body: unknown = await response.json();
    if (response.status === 401 || response.status === 403) return failure(response.status, 'cart_session_invalid');
    if (response.status >= 500) return failure(502, 'unconfirmed', true);
    if (!isRecord(body) || (body.ok === true && body.cart_id !== cartId)
      || (body.cart_id !== undefined && body.cart_id !== cartId)) return failure(502, 'unconfirmed', true);
    const reply = parseNoteReply(body, response.status);
    if (reply.ok && reply.order_note !== parsed.note) return failure(502, 'unconfirmed', true);
    return { status: reply.ok ? 200 : reply.uncertain ? 502 : response.status >= 400 ? response.status : 409, body: reply };
  } catch { return failure(502, writing ? 'unconfirmed' : 'unavailable', writing); }
}
