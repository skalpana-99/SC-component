import { parseCartItems } from '../cart-item/cart-item.api';
import { toCartItem } from '../cart-item/cart-item.service';
import type { CartItemInput } from '../cart-item/cart-item.types';
import type { CartDrawerData, CartDrawerRequest, CartDrawerSnapshot, DrawerCatalogProduct, DrawerQuote } from './cart-drawer.types';

export function checkoutLink(value?: string): string | undefined {
  if (!value) return undefined;
  if (/[\s\\\u0000-\u001f]/.test(value)) throw new TypeError('Invalid checkout URL.');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  const url = new URL(value);
  if (url.protocol === 'https:' && !url.username && !url.password) return value;
  throw new TypeError('Checkout URL must be a site-relative path or HTTPS URL.');
}

export function prepareDrawer(snapshot: CartDrawerSnapshot, checkoutHref?: string): CartDrawerData {
  const items = snapshot.items.map(toCartItem);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(count)) throw new TypeError('Invalid cart quantity total.');
  const format = (minor: number | string) => {
    const currency = snapshot.totals!.currency;
    const digits = new Intl.NumberFormat('en-LK', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits!;
    const factor = 10 ** digits;
    return new Intl.NumberFormat('en-LK', {
      style: 'currency', currency, currencyDisplay: 'code',
      minimumFractionDigits: Number(minor) % factor === 0 ? 0 : digits, maximumFractionDigits: digits,
    }).format(Number(minor) / factor);
  };
  return {
    items, itemCount: count,
    totals: snapshot.totals ? { net: format(snapshot.totals.netMinor), tax: format(snapshot.totals.taxMinor), total: format(snapshot.totals.totalMinor) } : null,
    checkoutHref: items.length > 0 ? checkoutLink(checkoutHref) : undefined,
  };
}

export function demoSnapshot(baseItems: CartItemInput[], request: CartDrawerRequest): CartDrawerSnapshot {
  if (request.scenario === 'error') throw new Error('Simulated unavailable basket.');
  const currency = baseItems[0]?.currency;
  if (!currency || baseItems.some(item => item.currency !== currency)) throw new TypeError('Demo items must share a supplied currency.');
  let items = request.scenario === 'empty' ? [] : structuredClone(baseItems);
  request.additions.forEach((line, index) => {
    const product = baseItems.find(item => item.storefrontUid === line.storefront_uid);
    if (!product) throw new TypeError('Unknown demo product.');
    items.push({ ...product, id: `demo-added-${index}`, quantity: line.qty,
      selectedOptions: line.variant ? [{ name: 'Variant', value: line.variant }] : [] });
  });
  items = items.filter(item => !request.removedIds.includes(item.id));
  const total = items.reduce((sum, item) => sum + Number(item.unitPriceMinor) * item.quantity, 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new TypeError('Invalid demo total.');
  return { items, totals: { currency, netMinor: total, taxMinor: 0, totalMinor: total } };
}

export function snapshotFromQuote(quote: DrawerQuote, catalog: DrawerCatalogProduct[]): CartDrawerSnapshot {
  const items = quote.lines.map(line => {
    const product = catalog.find(product => product.storefront_uid === line.storefront_uid);
    let selectedOptions = line.options ?? [];
    if (selectedOptions.length === 0 && line.variant) {
      const variant = product?.variants?.find(variant => variant.item_code === line.variant);
      selectedOptions = variant && product?.options?.length === variant.values.length
        ? product.options.map((option, index) => ({ name: option.name, value: variant.values[index] }))
        : [{ name: 'Variant', value: line.variant }];
    }
    return {
      id: line.line_id ?? `quote-line-${line.idx}`,
      storefrontUid: line.storefront_uid, title: product?.title ?? line.item_code,
      selectedOptions, quantity: line.qty, unitPriceMinor: line.rate_minor, currency: quote.currency,
    };
  });
  return {
    items: parseCartItems({ items }),
    // Authoritative quote totals, never summed from catalogue prices or pack offers.
    totals: { currency: quote.currency, netMinor: quote.net_total_minor, taxMinor: quote.tax_total_minor, totalMinor: quote.grand_total_minor },
  };
}
