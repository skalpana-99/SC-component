import fixture from './add-to-cart.demo.json';
import { isRecord, parseCartReply, UUID } from './add-to-cart.api';
import type { CartCatalogProduct, CartConfig, CartLine, CartRouteResult } from './add-to-cart.types';

export function readCartConfig(env: NodeJS.ProcessEnv): CartConfig {
  const mode = env.CART_DATA_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new Error('CART_DATA_MODE must be demo or live.');
  return { mode, baseUrl: env.COMMERCE_API_BASE_URL };
}

export function commerceBaseUrl(config: CartConfig): string {
  if (!config.baseUrl) throw new Error('Live cart mode requires COMMERCE_API_BASE_URL.');
  const url = new URL(config.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid commerce base URL.');
  }
  return url.href.replace(/\/+$/, '');
}

export async function loadCartCatalog(config: CartConfig, fetcher: typeof fetch = fetch): Promise<CartCatalogProduct[]> {
  let body: unknown = fixture;
  if (config.mode === 'live') {
    const response = await fetcher(`${commerceBaseUrl(config)}/catalog`, { signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('Cart catalogue request failed.');
    body = await response.json();
  }
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.products) || !Array.isArray(body.packs)) {
    throw new Error('Invalid cart catalogue response.');
  }
  return body.products.map((p: unknown): CartCatalogProduct => {
    if (!isRecord(p) || typeof p.storefront_uid !== 'string' || !UUID.test(p.storefront_uid)
      || typeof p.title !== 'string' || !p.title.trim() || typeof p.listed !== 'boolean'
      || typeof p.purchasable !== 'boolean' || typeof p.is_pack !== 'boolean'
      || (p.options !== undefined && !Array.isArray(p.options))
      || (p.variants !== undefined && (!Array.isArray(p.variants) || p.variants.some(v => !isRecord(v) || typeof v.item_code !== 'string' || !v.item_code.trim())))) {
      throw new Error('Invalid product selection data.');
    }
    return {
      storefront_uid: p.storefront_uid, title: p.title, listed: p.listed,
      purchasable: p.purchasable, is_pack: p.is_pack,
      options: p.options as unknown[] | undefined,
      variants: p.variants as Array<{ item_code: string }> | undefined,
    };
  });
}

// Dose's signed cookie payload provides a routing hint only. The commerce API verifies the
// credential and its ownership of the cart. No signing keys or tokens reach browser modules.
export function cartIdFromToken(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return isRecord(payload) && typeof payload.cart_id === 'string' && UUID.test(payload.cart_id) ? payload.cart_id : null;
  } catch { return null; }
}

export async function submitLiveCartLine(
  line: CartLine, request: Request, config: CartConfig, fetcher: typeof fetch = fetch,
): Promise<CartRouteResult> {
  const cookies: string[] = [];
  const failure = (status: number, reason: string, uncertain = false): CartRouteResult => ({
    status, body: { ok: false, reason, uncertain }, cookies,
  });
  if (config.mode !== 'live') return failure(503, 'live_not_enabled');
  let adding = false;
  try {
    const base = commerceBaseUrl(config);
    const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('dose_cart='));
    let token = cookie?.slice('dose_cart='.length);
    let cartId = token ? cartIdFromToken(token) : null;
    if (token && !cartId) return failure(401, 'cart_session_invalid');
    if (!token) {
      const session = await fetcher(`${base}/sessions`, {
        method: 'POST', headers: { Accept: 'application/json', 'x-dose-public-caller': 'storefront' },
        signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store',
      });
      const body: unknown = await session.json();
      if (!session.ok || !isRecord(body) || body.ok !== true || typeof body.cart_id !== 'string'
        || !UUID.test(body.cart_id) || typeof body.cart_token !== 'string' || !body.cart_token) {
        return failure(502, 'unavailable');
      }
      cartId = body.cart_id;
      token = body.cart_token;
      cookies.push(...session.headers.getSetCookie().filter(cookie => /^dose_(cart|sid)=/.test(cookie)));
      if (!cookies.some(cookie => cookie.startsWith('dose_cart='))) return failure(502, 'unavailable');
    }
    adding = true;
    const response = await fetcher(`${base}/carts/${cartId}/lines`, {
      method: 'POST', headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'x-storefront-credential': token!, 'x-dose-public-caller': 'storefront',
      },
      body: JSON.stringify({ lines: [line] }), signal: AbortSignal.timeout(8000),
      redirect: 'error', cache: 'no-store',
    });
    const body: unknown = await response.json();
    if (response.status >= 500) return failure(502, 'unconfirmed', true);
    if (response.status === 401 || response.status === 403) return failure(response.status, 'cart_session_invalid');
    const parsed = parseCartReply(body, response.status, line);
    return { status: parsed.ok ? 200 : parsed.uncertain ? 502 : response.status >= 400 ? response.status : 409, body: parsed, cookies };
  } catch {
    return failure(502, adding ? 'unconfirmed' : 'unavailable', adding);
  }
}
