import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCartReply, requestAddToCart } from '../src/features/add-to-cart/add-to-cart.api';
import { addSelectedToCart, cartExamples, selectionFromForm, validateCartLine } from '../src/features/add-to-cart/add-to-cart.service';
import { loadCartCatalog, readCartConfig, submitLiveCartLine } from '../src/features/add-to-cart/add-to-cart.server.api';
import type { CartConfig, CartLine, CartReply } from '../src/features/add-to-cart/add-to-cart.types';

const line: CartLine = { storefront_uid: '11111111-1111-4111-8111-111111111111', qty: 2 };
const cartId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const lineId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = `test.${Buffer.from(JSON.stringify({ cart_id: cartId })).toString('base64url')}.test`;
const config: CartConfig = { mode: 'live', baseUrl: 'https://commerce.example.test/merchant/' };
const request = (cookie?: string) => new Request('https://shop.example.test/api/cart/lines', {
  method: 'POST', headers: cookie ? { cookie } : {},
});
const success = (selected = line) => ({ ok: true as const, cart_id: cartId, lines: [{ ...selected, line_id: lineId }] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const session = () => {
  const headers = new Headers();
  headers.append('set-cookie', `dose_cart=${token}; Path=/; HttpOnly; SameSite=Lax`);
  headers.append('set-cookie', 'dose_sid=test-session; Path=/; HttpOnly; SameSite=Lax');
  return new Response(JSON.stringify({ ok: true, cart_id: cartId, cart_token: token }), { headers });
};

test('selection validates product, positive integer quantity and selected variant without accepting prices', () => {
  assert.deepEqual(validateCartLine({ ...line, price_minor: 1, variant: ' SIZE-M ' }), { ...line, variant: 'SIZE-M' });
  for (const invalid of [null, {}, { ...line, storefront_uid: '../admin' }, { ...line, variant: {} }, { ...line, variant: '' }]) {
    assert.throws(() => validateCartLine(invalid), TypeError);
  }
  for (const qty of [0, -1, 1.2, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateCartLine({ ...line, qty }), TypeError);
  }
});

test('form selection reads the current stepper and rejects missing required variants and invalid quantity strings', () => {
  const form = new FormData();
  form.set('storefront_uid', line.storefront_uid); form.set('qty', '2');
  assert.deepEqual(selectionFromForm(form, false), line);
  assert.throws(() => selectionFromForm(form, true), /Choose a product option/);
  form.set('variant', 'SIZE-M');
  assert.deepEqual(selectionFromForm(form, true), { ...line, variant: 'SIZE-M' });
  for (const qty of ['', ' ', '1.5', '2e2', '-2']) {
    form.set('qty', qty); assert.throws(() => selectionFromForm(form, true), TypeError);
  }
});

test('success requires a matching product, quantity, variant, line id and success envelope', () => {
  assert.equal(parseCartReply(success(), 200, line).ok, true);
  for (const body of [null, {}, { ...success(), cart_id: 'bad' }, { ...success(), lines: [] }, success({ ...line, qty: 1 }), success({ ...line, variant: 'OTHER' })]) {
    const parsed = parseCartReply(body, 200, line);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.uncertain, true);
  }
  assert.equal(parseCartReply(success(), 500, line).ok, false);
});

test('browser API uses only same-origin routes and forwards the selected variant and quantity', async () => {
  let calls = 0;
  const selected = { ...line, variant: 'SIZE-M' };
  const fetcher = (async (url, init) => {
    calls++; assert.equal(url, '/api/cart/lines');
    assert.equal(init?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(init?.body)), { lines: [selected] });
    return response(success(selected));
  }) as typeof fetch;
  assert.equal((await requestAddToCart(selected, 'live', 'success', fetcher)).ok, true);
  assert.equal(calls, 1);
});

test('lost responses and malformed successful replies are uncertain and are never retried', async () => {
  for (const fail of [async () => { throw new Error('network'); }, async () => new Response('not JSON'), async () => response({ ok: true })]) {
    let calls = 0;
    const result = await requestAddToCart(line, 'live', 'success', (async () => { calls++; return fail(); }) as typeof fetch);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.uncertain, true);
    assert.equal(calls, 1);
  }
});

test('simultaneous requests from different buttons cannot create competing cart sessions', async () => {
  let finish!: (value: Response) => void;
  const first = requestAddToCart(line, 'live', 'success', (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch);
  const second = await requestAddToCart(line, 'live', 'success', (async () => { throw new Error('must not send a second request'); }) as typeof fetch);
  assert.deepEqual(second, { ok: false, reason: 'cart_busy', uncertain: false });
  finish(response(success()));
  assert.equal((await first).ok, true);
});

test('service distinguishes success, definite refusals, unavailable service and uncertain outcomes', async () => {
  for (const [reply, state, words] of [
    [success(), 'success', '2 items'],
    [{ ok: false, reason: 'variant_unavailable', uncertain: false }, 'error', 'no longer available'],
    [{ ok: false, reason: 'unavailable', uncertain: false }, 'error', 'could not be reached'],
    [{ ok: false, reason: 'unconfirmed', uncertain: true }, 'uncertain', 'Check your cart'],
    [{ ok: false, reason: 'toString', uncertain: false }, 'error', 'could not be added'],
  ] as const) {
    const result = await addSelectedToCart(line, 'demo', 'success', async () => reply as CartReply);
    assert.equal(result.state, state); assert.ok(result.message.includes(words));
  }
  const unavailable = parseCartReply({ ok: false, reason: 'unavailable', uncertain: false }, 503, line);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.uncertain, false);
});

test('new live carts create a shopper session, forward its credential once and return no tokens', async () => {
  const calls: string[] = [];
  const result = await submitLiveCartLine(line, request(), config, (async (url, init) => {
    calls.push(String(url));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-dose-public-caller'), 'storefront');
    assert.equal(init?.redirect, 'error');
    if (String(url).endsWith('/sessions')) return session();
    assert.equal(headers.get('x-storefront-credential'), token);
    assert.deepEqual(JSON.parse(String(init?.body)), { lines: [line] });
    return response(success());
  }) as typeof fetch);
  assert.deepEqual(calls, ['https://commerce.example.test/merchant/sessions', `https://commerce.example.test/merchant/carts/${cartId}/lines`]);
  assert.equal(result.status, 200);
  assert.equal(result.cookies.length, 2);
  assert.ok(!JSON.stringify(result.body).includes(token));
});

test('existing cart credentials are reused; unrelated cookies and internal headers do not cross', async () => {
  let calls = 0;
  const result = await submitLiveCartLine(line, request(`admin_session=unrelated; dose_cart=${token}; dose_sid=test-session`), config, (async (url, init) => {
    calls++; assert.ok(String(url).endsWith(`/carts/${cartId}/lines`));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('cookie'), null); assert.equal(headers.get('x-dose-internal-token'), null);
    assert.equal(headers.get('x-storefront-credential'), token);
    return response(success());
  }) as typeof fetch);
  assert.equal(calls, 1); assert.equal(result.status, 200);
});

test('disabled live mode and malformed sessions cause no line writes or demo fallback', async () => {
  const never = (async () => { throw new Error('must not call'); }) as typeof fetch;
  assert.equal((await submitLiveCartLine(line, request(), { mode: 'demo' }, never)).status, 503);
  assert.equal((await submitLiveCartLine(line, request('dose_cart=invalid'), config, never)).status, 401);
  const failed = await submitLiveCartLine(line, request(), config, (async () => response({ ok: false }, 503)) as typeof fetch);
  assert.equal(failed.body.ok, false);
  if (!failed.body.ok) assert.equal(failed.body.uncertain, false);
});

test('line transport loss/5xx is uncertain; definite variant/session refusals remain errors', async () => {
  for (const [fetcher, status, uncertain] of [
    [async () => { throw new Error('lost'); }, 502, true],
    [async () => response({ ok: false, uncertain: false }, 500), 502, true],
    [async () => response({ ok: false, reason: 'variant_unavailable' }, 409), 409, false],
    [async () => response({ ok: false }, 401), 401, false],
  ] as const) {
    const result = await submitLiveCartLine(line, request(`dose_cart=${token}`), config, fetcher as typeof fetch);
    assert.equal(result.status, status);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) assert.equal(result.body.uncertain, uncertain);
  }
});

test('demo catalogue is validated without network calls; listed/pack/purchasability selection is explicit', async () => {
  const products = await loadCartCatalog({ mode: 'demo' }, (async () => { throw new Error('no network'); }) as typeof fetch);
  const examples = cartExamples([...products, { ...products[0], listed: false }, { ...products[0], is_pack: true }, { ...products[0], purchasable: false }]);
  assert.equal(examples.length, 2); assert.equal(examples[1].requiresVariant, true);
  assert.equal(examples[1].variants[0].value, 'DEMO-OXFORD-S');
  for (const body of [{ ok: false }, { ok: true, products: [], packs: null }, { ok: true, products: [{ title: 'bad' }], packs: [] }]) {
    await assert.rejects(loadCartCatalog(config, (async () => response(body)) as typeof fetch));
  }
  assert.equal(readCartConfig({}).mode, 'demo');
  assert.throws(() => readCartConfig({ CART_DATA_MODE: 'typo' }));
});
