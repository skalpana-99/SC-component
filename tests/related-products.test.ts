import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareRelatedProducts } from '../src/features/related-products/related-products.service';
import type { RelatedProductsSelection } from '../src/features/related-products/related-products.types';
import type { ProductCardData } from '../src/features/products/products.types';
import { getProductCards } from '../src/features/products/products.service';
import { parseCatalog } from '../src/features/products/products.api';
import fixture from '../src/features/products/catalog.demo.json';

const cards: ProductCardData[] = [
  { id: 'a', title: 'First', price: 'LKR 100' },
  { id: 'b', title: 'Second', price: 'LKR 200' },
  { id: 'c', title: 'Third', price: 'LKR 300' },
];

test('related selection preserves supplied order and existing card data without mutation', () => {
  const selection = { productIds: ['c', 'a'] };
  const originalCards = structuredClone(cards), originalSelection = structuredClone(selection);
  assert.deepEqual(prepareRelatedProducts(cards, selection).products, [cards[2], cards[0]]);
  assert.deepEqual(cards, originalCards);
  assert.deepEqual(selection, originalSelection);
});

test('current, repeated and unavailable IDs do not generate duplicate or fabricated cards', () => {
  assert.deepEqual(prepareRelatedProducts(cards, { productIds: ['b', 'a', 'b', 'missing', 'c'], currentProductId: 'a' }).products, [cards[1], cards[2]]);
  assert.deepEqual(prepareRelatedProducts(cards, { productIds: [] }).products, []);
  assert.deepEqual(prepareRelatedProducts(cards, { productIds: ['missing'] }).products, []);
});

test('malformed relationship input fails explicitly', () => {
  for (const value of [null, undefined, {}, { productIds: 'a' }, { productIds: [''] }, { productIds: [2] }, { productIds: [], currentProductId: false }]) {
    assert.throws(() => prepareRelatedProducts(cards, value as RelatedProductsSelection), TypeError);
  }
});

test('one shared catalogue load prepares prices and media while excluding unlisted selected IDs', async () => {
  let calls = 0;
  const content = { ...fixture, products: [...fixture.products,
    { ...fixture.products[0], storefront_uid: 'unlisted', listed: false },
    { ...fixture.products[0], storefront_uid: 'unspecified', listed: undefined },
  ] };
  const prepared = await getProductCards({ mode: 'demo' }, async () => { calls++; return parseCatalog(content); });
  const result = prepareRelatedProducts(prepared, { productIds: ['unlisted', fixture.products[2].storefront_uid, 'unspecified', fixture.products[1].storefront_uid] });
  assert.equal(calls, 1);
  assert.deepEqual(result.products.map(card => card.title), ['Performance Tee', 'Oxford Shirt']);
  assert.deepEqual(result.products.map(card => card.price.replace(/\s/g, ' ')), ['LKR 1,990', 'LKR 3,490']);
  assert.equal(result.products[0].stockLabel, 'Low stock');
  assert.ok(result.products[1].image);
});

