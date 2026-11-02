import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from '../src/features/products/catalog.demo.json';
import { CatalogError, getCatalog, parseCatalog, readProductsConfig } from '../src/features/products/products.api';
import { getProductCards, toProductCard } from '../src/features/products/products.service';

const response = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const config = { mode: 'live', baseUrl: 'https://commerce.example.test/api/' } as const;
const clean = (value: string) => value.replace(/\s/g, ' ');
const catalog = (changes: Record<string, unknown>) => ({ ...fixture, products: [{ ...fixture.products[0], ...changes }] });

test('demo uses the same validator without any network request; maps exact supplied prices', async () => {
  const data = await getCatalog({ mode: 'demo' }, (async () => { throw new Error('must not fetch'); }) as typeof fetch);
  const cards = await getProductCards({ mode: 'demo' }, async () => data);
  assert.deepEqual(cards.map(p => clean(p.price)), ['LKR 3,990', 'LKR 3,490', 'LKR 1,990']);
  assert.deepEqual(cards.map(p => clean(p.comparisonPrice!)), ['LKR 7,990', 'LKR 6,990', 'LKR 3,990']);
  assert.deepEqual(cards.map(p => p.stockLabel), [undefined, undefined, 'Low stock']);
});

test('one catalogue load; excludes listed:false and absent listed, without inventing stock thresholds', async () => {
  let calls = 0;
  const data = parseCatalog({ ...fixture, products: [
    { ...fixture.products[0], sellable_qty: 0 },
    { ...fixture.products[1], listed: false },
    { ...fixture.products[2], listed: undefined },
  ] });
  const cards = await getProductCards({ mode: 'demo' }, async () => { calls++; return data; });
  assert.equal(calls, 1);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].stockLabel, undefined);
});

test('string and numeric minor units match; currency fraction digits are respected', () => {
  for (const [currency, price_minor, expected] of [
    ['LKR', '399000', 'LKR 3,990'], ['LKR', 399000, 'LKR 3,990'],
    ['LKR', 399050, 'LKR 3,990.50'], ['JPY', 3990, 'JPY 3,990'],
    ['KWD', '3990123', 'KWD 3,990.123'], ['LKR', 0, 'LKR 0'],
  ] as const) {
    assert.equal(clean(toProductCard(parseCatalog(catalog({ currency, price_minor })).products[0]).price), expected);
  }
});

test('missing, invalid, equal and lower comparison prices are omitted', () => {
  for (const compare_at_minor of [undefined, null, '', 'nope', -1, 1.2, {}, 399000, '399000', 199000]) {
    const product = parseCatalog(catalog({ compare_at_minor })).products[0];
    assert.equal(toProductCard(product).comparisonPrice, undefined);
  }
});

test('invalid current prices are rejected rather than displayed as zero', () => {
  for (const price_minor of [undefined, null, '', ' ', 'garbage', true, -1, 3.9, '3990.00', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseCatalog(catalog({ price_minor })), CatalogError);
  }
});

test('validates envelope and every consumed field', () => {
  for (const body of [null, {}, { ...fixture, ok: false }, { ...fixture, packs: undefined }, { ...fixture, products: {} }]) {
    assert.throws(() => parseCatalog(body), CatalogError);
  }
  for (const changes of [{ storefront_uid: '' }, { title: 1 }, { title: ' ' }, { listed: 'true' }, { band: 'almost-out' }, { currency: 'ZZZ' }]) {
    assert.throws(() => parseCatalog(catalog(changes)), CatalogError);
  }
});

test('unmapped media and long titles are preserved; sizes do not invent price ranges', () => {
  const title = 'Long '.repeat(50);
  const product = parseCatalog(catalog({ storefront_uid: 'toString', title, options: ['S', 'M'], variants: [{ price_minor: 100 }] })).products[0];
  const card = toProductCard(product);
  assert.equal(card.title, title);
  assert.equal(card.image, undefined);
  assert.equal(clean(card.price), 'LKR 3,990');
});

test('empty and entirely unlisted catalogues return no cards', async () => {
  for (const products of [[], [{ ...fixture.products[0], listed: false }]]) {
    assert.deepEqual(await getProductCards({ mode: 'demo' }, async () => parseCatalog({ ok: true, products, packs: [] })), []);
  }
});

test('live requests the prefixed /catalog once and validates its response', async () => {
  let calls = 0;
  const data = await getCatalog(config, (async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://commerce.example.test/api/catalog');
    assert.equal(init?.cache, 'no-store');
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    return new Response(JSON.stringify(fixture));
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.equal(data.products.length, 3);
});

test('live HTTP, ok:false, malformed JSON, invalid fields and network failures never fall back', async () => {
  const failingFetchers = [
    response(fixture, 503), response({ ...fixture, ok: false }), response(catalog({ price_minor: null })),
    (async () => new Response('not json')) as typeof fetch,
    (async () => { throw new Error('private upstream URL or token'); }) as typeof fetch,
  ];
  for (const fetcher of failingFetchers) {
    await assert.rejects(getCatalog(config, fetcher), (error: Error) => error instanceof CatalogError && !error.message.includes('private upstream'));
  }
});

test('mode and live URL configuration fail explicitly', async () => {
  assert.equal(readProductsConfig({}).mode, 'demo');
  assert.throws(() => readProductsConfig({ PRODUCTS_DATA_MODE: 'typo' }), CatalogError);
  for (const baseUrl of [undefined, '', 'invalid', 'file:///tmp/catalog', 'https://user:secret@example.test', 'https://example.test/?token=secret']) {
    await assert.rejects(getCatalog({ mode: 'live', baseUrl }), CatalogError);
  }
});
