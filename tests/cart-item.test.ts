import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDemoCartItems, parseCartItems } from '../src/features/cart-item/cart-item.api';
import { getCartItems, removeCartItem, toCartItem } from '../src/features/cart-item/cart-item.service';
import fixture from '../src/features/cart-item/cart-item.demo.json';

const clean = (value: string) => value.replace(/\s/g, ' ');
const input = (changes: Record<string, unknown>) => ({ items: [{ ...fixture.items[0], ...changes }] });

test('loads items once, keeps selected options and quantity, and resolves supplementary media separately', async () => {
  let calls = 0;
  const items = await getCartItems(async () => { calls++; return loadDemoCartItems(); });
  assert.equal(calls, 1);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0].options, [{ name: 'Size', value: 'L' }, { name: 'Colour', value: 'Olive' }]);
  assert.equal(items[0].quantity, 2);
  assert.equal(clean(items[0].unitPrice), 'LKR 3,990');
  assert.ok(items[0].image?.alt);
  assert.equal(items[1].image, undefined);
  assert.ok(items[1].title.length > 80);
  assert.deepEqual(items[2].options, []);
});

test('formats supplied unit prices for numeric/string minor units and different currency exponents', () => {
  for (const [unitPriceMinor, currency, expected] of [
    [399000, 'LKR', 'LKR 3,990'], ['399000', 'LKR', 'LKR 3,990'],
    [399050, 'LKR', 'LKR 3,990.50'], [3990, 'JPY', 'JPY 3,990'],
    ['3990123', 'KWD', 'KWD 3,990.123'], [0, 'LKR', 'LKR 0'],
  ] as const) {
    const item = toCartItem(parseCartItems(input({ unitPriceMinor, currency }))[0]);
    assert.equal(clean(item.unitPrice), expected);
    assert.equal(item.quantity, 2);
  }
});

test('missing/invalid prices and invalid quantities fail instead of displaying zero or rounding', () => {
  for (const unitPriceMinor of [undefined, null, '', ' ', 'invalid', '1.5', 1.2, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseCartItems(input({ unitPriceMinor })), TypeError);
  }
  for (const quantity of [undefined, null, 0, -1, 1.2, '2', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseCartItems(input({ quantity })), TypeError);
  }
});

test('validates identities, unique keys, options and currency; accepts an empty cart', () => {
  assert.deepEqual(parseCartItems({ items: [] }), []);
  assert.throws(() => parseCartItems({ items: [fixture.items[0], fixture.items[0]] }), TypeError);
  for (const changes of [{ id: '' }, { title: ' ' }, { storefrontUid: null }, { currency: 'ZZZ' },
    { selectedOptions: {} }, { selectedOptions: [{ name: 'Size' }] }, { selectedOptions: [{ name: 'Size', value: ' ' }] }]) {
    assert.throws(() => parseCartItems(input(changes)), TypeError);
  }
  const item = toCartItem(parseCartItems(input({ storefrontUid: 'toString', id: 'opaque cart key / size M' }))[0]);
  assert.equal(item.image, undefined);
  assert.equal(item.id, 'opaque cart key / size M');
});

test('supplied removal handler is called once with the exact identity and must confirm that identity', async () => {
  let calls = 0;
  const result = await removeCartItem('selected-line', async itemId => {
    calls++; assert.equal(itemId, 'selected-line'); return { ok: true, itemId };
  });
  assert.deepEqual(result, { state: 'removed', itemId: 'selected-line' });
  assert.equal(calls, 1);
  assert.equal((await removeCartItem('selected-line', async () => ({ ok: true, itemId: 'another-line' }))).state, 'uncertain');
});

test('definite refusal keeps its message; rejected, malformed and unconfirmed results never claim removal or retry', async () => {
  assert.deepEqual(await removeCartItem('line', async () => ({ ok: false, message: 'Please try again.' })), { state: 'error', message: 'Please try again.' });
  for (const handler of [
    async () => { throw new Error('Lost confirmation'); },
    async () => undefined,
    async () => ({ ok: true }),
    async () => ({ ok: false, message: 'Check your cart.', uncertain: true }),
  ]) {
    let calls = 0;
    const result = await removeCartItem('line', async () => { calls++; return handler(); });
    assert.equal(result.state, 'uncertain');
    assert.equal(calls, 1);
  }
});
