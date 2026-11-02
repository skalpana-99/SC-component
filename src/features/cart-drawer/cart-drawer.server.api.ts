import { cartIdFromToken, commerceBaseUrl, readCartConfig } from '../add-to-cart/add-to-cart.server.api';
import { isRecord } from '../add-to-cart/add-to-cart.api';
import { validateCartLine } from '../add-to-cart/add-to-cart.service';
import { loadDemoCartItems } from '../cart-item/cart-item.api';
import { checkoutLink, demoSnapshot, snapshotFromQuote } from './cart-drawer.service';
import type { CartDrawerConfig, CartDrawerRequest, CartDrawerSnapshot, DrawerCatalogProduct, DrawerQuote } from './cart-drawer.types';

export function readDrawerConfig(env: NodeJS.ProcessEnv): CartDrawerConfig {
  const config = readCartConfig(env);
  return { ...config, checkoutHref: checkoutLink(env.CART_CHECKOUT_URL || (config.mode === 'demo' ? '/cart-drawer/checkout' : undefined)) };
}

export function parseDrawerRequest(body: unknown): CartDrawerRequest {
  if (!isRecord(body) || !['populated', 'empty', 'error'].includes(String(body.scenario))
    || !Array.isArray(body.removedIds) || body.removedIds.some(id => typeof id !== 'string' || !id)
    || !Array.isArray(body.additions)) throw new TypeError('Invalid drawer request.');
  return { scenario: body.scenario as CartDrawerRequest['scenario'], removedIds: body.removedIds as string[], additions: body.additions.map(validateCartLine) };
}

function minor(value: unknown): value is number | string {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export function parseDrawerQuote(body: unknown): DrawerQuote {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.quote) || body.quote.ok !== true) throw new TypeError('Invalid quote response.');
  const quote = body.quote;
  if (typeof quote.currency !== 'string' || !Intl.supportedValuesOf('currency').includes(quote.currency)
    || !Array.isArray(quote.lines) || !minor(quote.net_total_minor) || !minor(quote.tax_total_minor) || !minor(quote.grand_total_minor)) throw new TypeError('Invalid quote totals.');
  const lines = quote.lines.map((line: unknown) => {
    if (!isRecord(line) || !Number.isSafeInteger(line.idx) || typeof line.idx !== 'number'
      || (line.line_id !== null && (typeof line.line_id !== 'string' || !line.line_id))
      || typeof line.storefront_uid !== 'string' || !line.storefront_uid
      || typeof line.item_code !== 'string' || !line.item_code
      || typeof line.qty !== 'number' || !Number.isSafeInteger(line.qty) || line.qty < 1
      || !minor(line.rate_minor) || (line.variant !== undefined && typeof line.variant !== 'string')
      || (line.options !== undefined && (!Array.isArray(line.options) || line.options.some(option => !isRecord(option)
        || typeof option.name !== 'string' || !option.name.trim() || typeof option.value !== 'string' || !option.value.trim())))) throw new TypeError('Invalid quoted cart line.');
    return line as unknown as DrawerQuote['lines'][number];
  });
  return { currency: quote.currency, lines, net_total_minor: quote.net_total_minor, tax_total_minor: quote.tax_total_minor, grand_total_minor: quote.grand_total_minor };
}

function parseCatalog(body: unknown): DrawerCatalogProduct[] {
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.products) || !Array.isArray(body.packs)) throw new TypeError('Invalid cart catalogue.');
  return body.products.map((product: unknown) => {
    if (!isRecord(product) || typeof product.storefront_uid !== 'string' || typeof product.title !== 'string' || !product.title
      || (product.options !== undefined && (!Array.isArray(product.options) || product.options.some(option => !isRecord(option) || typeof option.name !== 'string' || !option.name)))
      || (product.variants !== undefined && (!Array.isArray(product.variants) || product.variants.some(variant => !isRecord(variant)
        || typeof variant.item_code !== 'string' || !Array.isArray(variant.values) || variant.values.some(value => typeof value !== 'string' || !value))))) throw new TypeError('Invalid cart product metadata.');
    return product as unknown as DrawerCatalogProduct;
  });
}

export async function loadDrawerSnapshot(
  config: CartDrawerConfig, input: CartDrawerRequest, request: Request, fetcher: typeof fetch = fetch,
): Promise<CartDrawerSnapshot> {
  if (config.mode === 'demo') {
    await new Promise(resolve => setTimeout(resolve, 300));
    return demoSnapshot(await loadDemoCartItems(), input);
  }
  const base = commerceBaseUrl(config);
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('dose_cart='));
  if (!cookie) return { items: [], totals: null };
  const token = cookie.slice('dose_cart='.length);
  const cartId = cartIdFromToken(token);
  if (!cartId) throw new Error('Cart session is unavailable.');
  // One quote and one catalogue per refresh, never per row. No sessions or stock claims are created.
  const [quoted, catalog] = await Promise.all([
    fetcher(`${base}/carts/${cartId}/quote`, {
      method: 'POST', headers: { Accept: 'application/json', 'x-storefront-credential': token, 'x-dose-public-caller': 'storefront' },
      signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store',
    }),
    fetcher(`${base}/catalog`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' }),
  ]);
  if (!quoted.ok || !catalog.ok) throw new Error('Cart read failed.');
  return snapshotFromQuote(parseDrawerQuote(await quoted.json()), parseCatalog(await catalog.json()));
}
