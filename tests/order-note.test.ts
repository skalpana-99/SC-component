import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNoteReply, requestSaveNote } from '../src/features/order-note/order-note.api';
import { getOrderNoteField, normalizeOrderNote, noteCharacterCount, saveOrderNote, validateOrderNote } from '../src/features/order-note/order-note.service';
import { loadOrderNote, persistOrderNote } from '../src/features/order-note/order-note.server.api';
import type { CartConfig } from '../src/features/add-to-cart/add-to-cart.types';

const cartId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `test.${Buffer.from(JSON.stringify({ cart_id: cartId })).toString('base64url')}.test`;
const config: CartConfig = { mode: 'live', baseUrl: 'https://commerce.example.test/merchant/' };
const request = (cookie = `admin_session=unrelated; dose_cart=${token}`) => new Request('https://shop.example.test/api/cart/order-note', { headers: { cookie } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('normalisation matches the source contract, retaining line breaks and Sinhala joiners', () => {
  assert.equal(normalizeOrderNote('  Ring\tthe bell.  \r\n\r\n\r\nAfter 5.\u200b  '), 'Ring the bell.\n\nAfter 5.');
  assert.equal(normalizeOrderNote('ශ්‍රී ලංකාව'), 'ශ්‍රී ලංකාව');
  assert.equal(normalizeOrderNote('\n\t  '), null);
  assert.equal(normalizeOrderNote('Line one\u2028Line two'), 'Line one\nLine two');
});

test('limits count Unicode code points without truncation; backend-refused terms and non-text are rejected', () => {
  assert.equal(noteCharacterCount('😀'.repeat(500)), 500);
  assert.equal(validateOrderNote('😀'.repeat(500)).ok, true);
  assert.equal(validateOrderNote('😀'.repeat(501)).ok, false);
  assert.equal(validateOrderNote('Please use COUPON now.').ok, false);
  for (const value of [undefined, {}, 12, true]) assert.equal(validateOrderNote(value).ok, false);
  assert.deepEqual(validateOrderNote('  '), { ok: true, note: null });
});

test('initial data loads once; unavailable/missing carts never look like a loaded blank note', async () => {
  let calls = 0;
  const data = await getOrderNoteField(async () => { calls++; return { ok: true, order_note: 'Existing note' }; });
  assert.equal(calls, 1); assert.equal(data.note, 'Existing note'); assert.equal(data.available, true); assert.equal(data.maxLength, 500);
  const missing = await getOrderNoteField(async () => ({ ok: false, reason: 'cart_missing', uncertain: false }));
  assert.equal(missing.available, false); assert.match(missing.message, /Add an item/);
  const failed = await getOrderNoteField(async () => ({ ok: false, reason: 'unavailable', uncertain: false }));
  assert.equal(failed.available, false); assert.match(failed.message, /couldn’t load/);
});

test('service saves canonical text and explicit null for clearing; invalid drafts make no request', async () => {
  let received: string | null | undefined;
  const submit = async (note: string | null) => { received = note; return { ok: true as const, order_note: note }; };
  assert.deepEqual(await saveOrderNote('  Ring the bell  ', 500, 'demo', 'success', submit), { state: 'saved', note: 'Ring the bell' });
  assert.equal(received, 'Ring the bell');
  assert.deepEqual(await saveOrderNote('  ', 500, 'demo', 'success', submit), { state: 'saved', note: null });
  assert.equal(received, null);
  let calls = 0;
  const invalid = await saveOrderNote('a'.repeat(501), 500, 'demo', 'success', async () => { calls++; return { ok: true, order_note: null }; });
  assert.equal(invalid.state, 'error'); assert.equal(calls, 0);
});

test('success must confirm the submitted note; missing persistence and lost responses never claim saved', async () => {
  for (const order_note of [null, 'Another note']) {
    assert.equal((await saveOrderNote('Selected note', 500, 'live', 'success', async () => ({ ok: true, order_note }))).state, 'uncertain');
  }
  const failed = await saveOrderNote('Selected note', 500, 'live', 'success', async () => ({ ok: false, reason: 'cart_already_ordered', uncertain: false }));
  assert.equal(failed.state, 'error');
  assert.match(failed.message, /already been checked out/);
  const unknown = await saveOrderNote('Selected note', 500, 'live', 'success', async () => ({ ok: false, reason: 'toString', uncertain: false }));
  assert.equal(unknown.state, 'error');
});

test('browser transport uses same-origin note-only payloads and performs no automatic retries', async () => {
  let calls = 0;
  const reply = await requestSaveNote('A note', 'live', 'success', (async (url, init) => {
    calls++; assert.equal(url, '/api/cart/order-note'); assert.equal(init?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(init?.body)), { order_note: 'A note' });
    return response({ ok: true, order_note: 'A note', contact: { email: 'not-returned' } });
  }) as typeof fetch);
  assert.deepEqual(reply, { ok: true, order_note: 'A note' }); assert.equal(calls, 1);
  calls = 0;
  const lost = await requestSaveNote('A note', 'live', 'success', (async () => { calls++; throw new Error('lost'); }) as typeof fetch);
  assert.equal(lost.ok, false); assert.equal(calls, 1);
  if (!lost.ok) assert.equal(lost.uncertain, true);
  assert.equal(parseNoteReply({ ok: true }, 200).ok, false);
});

test('server-side read returns only the note, retains cart auth and never forwards the browser/proxy stamp', async () => {
  const loaded = await loadOrderNote(config, request(), (async (url, init) => {
    assert.equal(String(url), `https://commerce.example.test/merchant/carts/${cartId}/contact`);
    assert.equal(init?.method, undefined);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-storefront-credential'), token);
    assert.equal(headers.get('x-dose-public-caller'), null);
    assert.equal(headers.get('cookie'), null);
    return response({ ok: true, cart_id: cartId, order_note: 'Existing note', contact: { email: 'private@example.test' }, billing_address: { line1: 'private' } });
  }) as typeof fetch);
  assert.deepEqual(loaded, { ok: true, order_note: 'Existing note' });
  assert.ok(!JSON.stringify(loaded).includes('private'));
});

test('live writes set only order_note, require an existing cart and do not touch contact/address/opt-in fields', async () => {
  let calls = 0;
  const saved = await persistOrderNote('New note', config, request(), (async (url, init) => {
    calls++; assert.ok(String(url).endsWith(`/carts/${cartId}/contact`)); assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-dose-public-caller'), 'storefront'); assert.equal(headers.get('x-storefront-credential'), token);
    assert.equal(headers.get('cookie'), null); assert.equal(headers.get('x-dose-internal-token'), null);
    assert.deepEqual(JSON.parse(String(init?.body)), { order_note: 'New note' });
    return response({ ok: true, cart_id: cartId, order_note: 'New note' });
  }) as typeof fetch);
  assert.equal(saved.status, 200); assert.equal(calls, 1);
  assert.deepEqual(saved.body, { ok: true, order_note: 'New note' });
  const never = (async () => { throw new Error('Must not create a cart'); }) as typeof fetch;
  assert.equal((await persistOrderNote('Note', config, request(''), never)).status, 409);
  assert.equal((await persistOrderNote('Note', config, request('dose_cart=invalid'), never)).status, 401);
  assert.equal((await persistOrderNote('Note', { mode: 'demo' }, request(), never)).status, 503);
});

test('read/save HTTP, JSON, missing-column and network failures do not fall back or falsely confirm persistence', async () => {
  assert.equal((await loadOrderNote(config, request(''), (async () => { throw new Error('no network'); }) as typeof fetch)).ok, false);
  for (const fetcher of [
    async () => response({ ok: false }, 503), async () => new Response('invalid JSON'), async () => { throw new Error('offline'); },
  ]) {
    assert.equal((await loadOrderNote(config, request(), fetcher as typeof fetch)).ok, false);
    const saved = await persistOrderNote('A note', config, request(), fetcher as typeof fetch);
    assert.equal(saved.body.ok, false);
    if (!saved.body.ok) assert.equal(saved.body.uncertain, true);
  }
  for (const body of [{ ok: true, cart_id: cartId, order_note: null }, { ok: true, cart_id: 'another-cart', order_note: 'A note' }]) {
    assert.equal((await persistOrderNote('A note', config, request(), (async () => response(body)) as typeof fetch)).body.ok, false);
  }
});
