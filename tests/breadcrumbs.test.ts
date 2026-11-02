import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareBreadcrumbs } from '../src/features/breadcrumbs/breadcrumbs.service';
import type { BreadcrumbsInput } from '../src/features/breadcrumbs/breadcrumbs.types';

test('preserves supplied ancestor order and appends exactly one non-linked current page without mutating data', () => {
  const input = { ancestors: [{ label: 'Home', href: '/' }, { label: 'Basket', href: '/cart-drawer' }], currentPage: 'Checkout link preview' };
  const before = structuredClone(input);
  const data = prepareBreadcrumbs(input);
  assert.deepEqual(data.items, [
    { label: 'Home', href: '/', current: false },
    { label: 'Basket', href: '/cart-drawer', current: false },
    { label: 'Checkout link preview', current: true },
  ]);
  assert.deepEqual(input, before);
});

test('explicitly absent data is empty; a root page remains a single current item without invented ancestors', () => {
  assert.deepEqual(prepareBreadcrumbs(null), { items: [] });
  assert.deepEqual(prepareBreadcrumbs({ ancestors: [], currentPage: 'Home' }), { items: [{ label: 'Home', current: true }] });
});

test('trims surrounding whitespace while preserving labels, Unicode and supplied URL references', () => {
  for (const href of ['/shop/?sort=newest#items', '../catalogue', '?page=2', '#category', 'https://shop.example.test/en/', 'http://localhost:4321/']) {
    const data = prepareBreadcrumbs({ ancestors: [{ label: '  නිෂ්පාදන & clothing  ', href: ` ${href} ` }], currentPage: '  Current page  ' });
    assert.deepEqual(data.items[0], { label: 'නිෂ්පාදන & clothing', href, current: false });
    assert.equal(data.items[1].label, 'Current page');
  }
});

test('rejects malformed page data and missing ancestor links rather than fabricating labels or routes', () => {
  for (const value of [undefined, {}, { ancestors: null, currentPage: 'Page' }, { ancestors: [], currentPage: ' ' },
    { ancestors: [null], currentPage: 'Page' }, { ancestors: [{ label: '', href: '/' }], currentPage: 'Page' },
    { ancestors: [{ label: 'Parent' }], currentPage: 'Page' }]) {
    assert.throws(() => prepareBreadcrumbs(value as BreadcrumbsInput), TypeError);
  }
});

test('unsafe link schemes and credential-bearing URLs are rejected', () => {
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hello', 'mailto:hello@example.test', 'https://user:secret@example.test/']) {
    assert.throws(() => prepareBreadcrumbs({ ancestors: [{ label: 'Parent', href }], currentPage: 'Page' }), TypeError);
  }
});
