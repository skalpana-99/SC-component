import type { CartLine, CartMode, CartReply, DemoCartOutcome } from './add-to-cart.types';

export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

let requestInProgress = false;

export function parseCartReply(body: unknown, status: number, line: CartLine): CartReply {
  if (isRecord(body) && body.ok === false && (status < 500 || typeof body.uncertain === 'boolean')) {
    return {
      ok: false,
      reason: typeof body.reason === 'string' ? body.reason : 'refused',
      uncertain: body.uncertain === true,
    };
  }
  if (status >= 200 && status < 300 && isRecord(body) && body.ok === true
    && typeof body.cart_id === 'string' && UUID.test(body.cart_id)
    && Array.isArray(body.lines) && body.lines.length === 1) {
    const added = body.lines[0];
    if (isRecord(added) && typeof added.line_id === 'string' && UUID.test(added.line_id)
      && added.storefront_uid === line.storefront_uid && added.qty === line.qty
      && added.variant === line.variant) {
      return {
        ok: true, cart_id: body.cart_id,
        lines: [{ ...line, line_id: added.line_id }],
      };
    }
  }
  return { ok: false, reason: 'unconfirmed', uncertain: true };
}

// Browser-safe: only same-origin, feature-specific routes. No upstream configuration or credentials.
export async function requestAddToCart(
  line: CartLine, mode: CartMode, demoOutcome: DemoCartOutcome = 'success', fetcher: typeof fetch = fetch,
): Promise<CartReply> {
  // Different buttons on one page must not create competing first-cart sessions.
  if (requestInProgress) return { ok: false, reason: 'cart_busy', uncertain: false };
  requestInProgress = true;
  const endpoint = mode === 'demo' ? `/api/cart/demo-lines?outcome=${demoOutcome}` : '/api/cart/lines';
  try {
    const response = await fetcher(endpoint, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ lines: [line] }),
    });
    return parseCartReply(await response.json(), response.status, line);
  } catch {
    // A lost response does not prove the non-idempotent add failed. Never retry automatically.
    return { ok: false, reason: 'unconfirmed', uncertain: true };
  } finally {
    requestInProgress = false;
  }
}
