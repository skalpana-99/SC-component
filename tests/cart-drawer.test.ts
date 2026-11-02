import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDemoCartItems } from '../src/features/cart-item/cart-item.api';
import { checkoutLink, demoSnapshot, prepareDrawer, snapshotFromQuote } from '../src/features/cart-drawer/cart-drawer.service';
import { loadDrawerSnapshot, parseDrawerQuote, parseDrawerRequest, readDrawerConfig } from '../src/features/cart-drawer/cart-drawer.server.api';
import type { CartDrawerConfig, CartDrawerRequest } from '../src/features/cart-drawer/cart-drawer.types';

const uid = '11111111-1111-4111-8111-111111111111';
const cartId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `test.${Buffer.from(JSON.stringify({ cart_id: cartId })).toString('base64url')}.test`;
const input: CartDrawerRequest = { scenario: 'populated', removedIds: [], additions: [] };
const config: CartDrawerConfig = { mode: 'live', baseUrl: 'https://commerce.example.test/merchant/' };
const request = (cookie?: string) => new Request('https://shop.example.test/api/cart/drawer-view', { method: 'POST', headers: cookie ? { cookie } : {} });
const quote = () => ({ ok: true, quote: {
  ok: true, currency: 'LKR', net_total_minor: '700000', tax_total_minor: 98000, grand_total_minor: '798000',
  lines: [{ idx: 1, line_id: null, storefront_uid: uid, item_code: 'JACKET', qty: 2, rate_minor: '399000', variant: 'JACKET-M' }],
  packs: [{ pack_price_minor: 99999999 }],
} });
const catalog = { ok: true, products: [{ storefront_uid: uid, title: 'Track Jacket', options: [{ name: 'Size' }], variants: [{ item_code: 'JACKET-M', values: ['M'] }], price_minor: 1 }], packs: [] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const clean = (value: string) => value.replace(/\s/g, ' ');

test('demo cart owns coherent item/count/totals state after adds and removals', async () => {
  const items = await loadDemoCartItems();
  const initial = prepareDrawer(demoSnapshot(items, input), '/cart-drawer/checkout');
  assert.equal(initial.itemCount, 4);
  assert.equal(clean(initial.totals!.total), 'LKR 13,460');
  const removed = prepareDrawer(demoSnapshot(items, { ...input, removedIds: ['demo-jacket-line'] }));
  assert.equal(removed.items.length, 2); assert.equal(removed.itemCount, 2);
  assert.equal(clean(removed.totals!.total), 'LKR 5,480');
  const added = prepareDrawer(demoSnapshot(items, { ...input, additions: [{ storefront_uid: items[2].storefrontUid, qty: 2 }] }));
  assert.equal(added.itemCount, 6); assert.equal(clean(added.totals!.total), 'LKR 17,440');
  assert.equal(added.items[3].id, 'demo-added-0');
});

test('empty carts have no checkout and demo failures never produce a fake empty snapshot', async () => {
  const items = await loadDemoCartItems();
  const empty = prepareDrawer(demoSnapshot(items, { ...input, scenario: 'empty' }), '/checkout');
  assert.equal(empty.itemCount, 0); assert.equal(empty.checkoutHref, undefined);
  assert.throws(() => demoSnapshot(items, { ...input, scenario: 'error' }));
  assert.throws(() => demoSnapshot(items, { ...input, additions: [{ storefront_uid: 'unknown', qty: 1 }] }));
  assert.throws(() => demoSnapshot(items, { ...input, additions: [{ storefront_uid: items[0].storefrontUid, qty: Number.MAX_SAFE_INTEGER }] }));
});

test('live drawer uses quoted prices/totals once, resolves option labels, and never adds pack prices twice', () => {
  const snapshot = snapshotFromQuote(parseDrawerQuote(quote()), catalog.products);
  const view = prepareDrawer(snapshot, '/checkout');
  assert.equal(clean(view.items[0].unitPrice), 'LKR 3,990');
  assert.equal(clean(view.totals!.net), 'LKR 7,000');
  assert.equal(clean(view.totals!.tax), 'LKR 980');
  assert.equal(clean(view.totals!.total), 'LKR 7,980');
  assert.deepEqual(view.items[0].options, [{ name: 'Size', value: 'M' }]);
  assert.equal(view.items[0].id, 'quote-line-1');
  assert.equal(view.checkoutHref, '/checkout');
  assert.equal(prepareDrawer(snapshot).checkoutHref, undefined);
});

test('missing catalogue metadata uses supplied item/variant codes rather than invented options', () => {
  const snapshot = snapshotFromQuote(parseDrawerQuote(quote()), []);
  assert.equal(snapshot.items[0].title, 'JACKET');
  assert.deepEqual(snapshot.items[0].selectedOptions, [{ name: 'Variant', value: 'JACKET-M' }]);
});

test('quote validator rejects missing/invalid money, quantities and envelopes', () => {
  for (const body of [null, { ok: false }, { ...quote(), ok: false }, { ok: true, quote: { ...quote().quote, ok: false } }]) assert.throws(() => parseDrawerQuote(body));
  for (const field of ['net_total_minor', 'tax_total_minor', 'grand_total_minor']) {
    for (const invalid of [undefined, null, '', 'bad', -1, 1.2]) assert.throws(() => parseDrawerQuote({ ok: true, quote: { ...quote().quote, [field]: invalid } }));
  }
  for (const changes of [{ qty: 0 }, { qty: '2' }, { rate_minor: null }, { options: [{ name: 'Size' }] }]) {
    assert.throws(() => parseDrawerQuote({ ok: true, quote: { ...quote().quote, lines: [{ ...quote().quote.lines[0], ...changes }] } }));
  }
});

test('live reads use one quote and one catalogue, reuse cart credentials, and never create shopper sessions', async () => {
  const calls: string[] = [];
  const snapshot = await loadDrawerSnapshot(config, input, request(`admin_session=unrelated; dose_cart=${token}`), (async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('cookie'), null); assert.equal(headers.get('x-dose-internal-token'), null);
    if (String(url).endsWith('/quote')) {
      assert.equal(headers.get('x-storefront-credential'), token);
      assert.equal(headers.get('x-dose-public-caller'), 'storefront');
      return response(quote());
    }
    return response(catalog);
  }) as typeof fetch);
  assert.equal(calls.length, 2);
  assert.ok(calls.includes(`https://commerce.example.test/merchant/carts/${cartId}/quote`));
  assert.ok(calls.includes('https://commerce.example.test/merchant/catalog'));
  assert.equal(snapshot.items.length, 1);
});

test('no cart is empty without API calls; invalid credentials and API failures never use a fixture', async () => {
  const never = (async () => { throw new Error('Unexpected call'); }) as typeof fetch;
  assert.deepEqual(await loadDrawerSnapshot(config, input, request(), never), { items: [], totals: null });
  await assert.rejects(loadDrawerSnapshot(config, input, request('dose_cart=invalid'), never));
  for (const fetcher of [async () => response({ ok: false }, 503), async () => new Response('bad JSON'), async () => { throw new Error('offline'); }]) {
    await assert.rejects(loadDrawerSnapshot(config, input, request(`dose_cart=${token}`), fetcher as typeof fetch));
  }
  await assert.rejects(loadDrawerSnapshot({ mode: 'live' }, input, request(), never));
});

test('checkout destination is supplied and rejects unsafe protocols, credentials and scheme-relative URLs', () => {
  assert.equal(checkoutLink('/checkout?step=1'), '/checkout?step=1');
  assert.equal(checkoutLink('https://checkout.example.test/start'), 'https://checkout.example.test/start');
  assert.equal(checkoutLink(undefined), undefined);
  for (const value of ['javascript:alert(1)', '//other.example.test', '/\\other', 'https://user:secret@example.test', 'http://other.example.test', '/check out']) assert.throws(() => checkoutLink(value));
  assert.equal(readDrawerConfig({ CART_DATA_MODE: 'demo', CART_CHECKOUT_URL: '' }).checkoutHref, '/cart-drawer/checkout');
  assert.equal(readDrawerConfig({ CART_DATA_MODE: 'live' }).checkoutHref, undefined);
});

test('demo request payload is validated without adding untrusted cart fields', () => {
  assert.deepEqual(parseDrawerRequest(input), input);
  for (const body of [null, {}, { ...input, scenario: 'unknown' }, { ...input, removedIds: [1] }, { ...input, additions: [{ storefront_uid: uid, qty: 0 }] }]) assert.throws(() => parseDrawerRequest(body));
});
