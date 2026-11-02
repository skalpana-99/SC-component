import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4449';
const fixture = JSON.parse(readFileSync('src/features/products/catalog.demo.json', 'utf8'));
const [jacket, shirt, tee] = fixture.products;
const live = structuredClone(fixture);
live.products.forEach(product => { product.title = `Live ${product.title}`; });
live.products.push({ ...jacket, storefront_uid: 'unlisted', title: 'Hidden product', listed: false });
let requests = 0, fault = '';
const upstream = createServer((request, response) => {
  requests++;
  assert.equal(request.url, '/catalog');
  response.setHeader('Content-Type', 'application/json');
  if (fault === 'http') { response.writeHead(503); response.end(JSON.stringify({ error: 'Unavailable' })); }
  else if (fault === 'invalid') response.end(JSON.stringify({ ...live, products: [{ ...jacket, price_minor: null }] }));
  else if (fault === 'ok-false') response.end(JSON.stringify({ ...live, ok: false }));
  else if (fault === 'json') response.end('invalid JSON');
  else response.end(JSON.stringify(live));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
const results = [];
const passed = message => { results.push(message); console.log(`PASS ${message}`); };
const server = spawn('node', ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4449', PRODUCTS_DATA_MODE: 'live', COMMERCE_API_BASE_URL: upstreamUrl },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
let browser;
const clean = value => value.replace(/\s/g, ' ');

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try { await fetch(`${base}/related-products`); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, log);
  browser = await chromium.launch({ ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], apiRequests = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
    if (!request.url().startsWith(base)) externalRequests.push(request.url());
  });
  const response = await page.goto(`${base}/related-products`);
  assert.equal(response.status(), 200);
  const html = await response.text();
  assert.match(html, /Demo mode · Local catalogue fixture · Sample selection/);
  assert.ok(!html.includes('<script'));
  const related = page.getByRole('region', { name: 'Related products', exact: true });
  assert.equal(await related.getByRole('heading', { level: 2 }).count(), 1);
  assert.equal(await related.getByRole('listitem').count(), 3);
  assert.deepEqual(await related.getByRole('heading', { level: 3 }).allTextContents(), ['Track Jacket', 'Oxford Shirt', 'Performance Tee']);
  for (const image of await related.locator('img').all()) {
    assert.ok(await image.getAttribute('alt'));
    assert.ok(Number(await image.getAttribute('width')) > 0);
    assert.ok(Number(await image.getAttribute('height')) > 0);
    assert.equal(await image.evaluate(element => element.complete && element.naturalWidth > 0), true);
  }
  assert.deepEqual((await related.locator('.product-price > span').allTextContents()).map(clean), ['Current price: LKR 3,990', 'Current price: LKR 3,490', 'Current price: LKR 1,990']);
  assert.equal(requests, 0);
  passed('Explicit demo selection reuses three ProductCards with semantic heading levels, exact prices and local dimensioned images');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width, columns] of [['desktop', 1440, 3], ['tablet', 640, 2], ['mobile', 390, 1], ['small-mobile', 320, 1]]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await related.locator('.related-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), columns);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/related-products-${name}.png`, fullPage: true });
    passed(`${name}: ${columns} grid columns with no horizontal overflow`);
  }

  await page.goto(`${base}/related-products?example=edges`);
  assert.match(await related.getByRole('heading', { level: 3 }).first().innerText(), /AnUnbrokenProductReferenceForSmallScreenWrapping/);
  assert.equal(await related.getByRole('img', { name: /^Image unavailable for/ }).count(), 1);
  assert.equal(await related.getByRole('listitem').nth(1).locator('del').count(), 0);
  assert.equal(await related.getByText('Low stock', { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/related-products-edges-mobile.png', fullPage: true });
  passed('Existing card behaviour preserves long titles, deliberate image placeholders, absent comparison prices and low-stock labels');

  await page.getByRole('link', { name: 'Empty selection', exact: true }).click();
  assert.equal(await related.getByRole('article').count(), 0);
  assert.equal(await related.getByText('No related products to show yet.', { exact: true }).count(), 1);
  const failure = await page.goto(`${base}/related-products?example=error`);
  assert.equal(failure.status(), 503);
  assert.equal(await page.getByRole('heading', { name: 'We couldn’t load the related products', exact: true }).count(), 1);
  assert.equal(await page.locator('.product-card').count(), 0);
  assert.equal(await page.getByText('No related products to show yet.', { exact: true }).count(), 0);
  passed('Empty selection and catalogue failure have distinct understandable states');

  let before = requests;
  await page.goto(`${base}/related-products?source=catalog`);
  assert.equal(requests - before, 1);
  assert.match(await page.locator('.demo-context').innerText(), /Live mode · Commerce catalogue/);
  assert.equal(await related.locator('.product-card').count(), 0);
  assert.equal(await page.getByRole('checkbox').count(), 3);
  await page.getByRole('checkbox', { name: 'Live Oxford Shirt', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('checkbox', { name: 'Live Performance Tee', exact: true }).check();
  before = requests;
  await page.getByRole('button', { name: 'Show selected products' }).click();
  await related.getByRole('heading', { name: 'Live Oxford Shirt', exact: true }).waitFor();
  assert.equal(requests - before, 1);
  assert.deepEqual(await related.getByRole('heading', { level: 3 }).allTextContents(), ['Live Oxford Shirt', 'Live Performance Tee']);
  passed('Configured catalogue loads once per page; native selection controls supply IDs without inventing relationships');

  const ordered = new URLSearchParams({ source: 'catalog', current: shirt.storefront_uid });
  for (const id of [tee.storefront_uid, shirt.storefront_uid, 'unlisted', tee.storefront_uid, 'missing', jacket.storefront_uid]) ordered.append('product', id);
  before = requests;
  const liveResponse = await page.goto(`${base}/related-products?${ordered}`);
  assert.equal(requests - before, 1);
  assert.deepEqual(await related.getByRole('heading', { level: 3 }).allTextContents(), ['Live Performance Tee', 'Live Track Jacket']);
  assert.ok(!(await liveResponse.text()).includes(upstreamUrl));
  passed('Live selection preserves supplied order while excluding current, duplicate, unlisted and unavailable IDs');

  for (const type of ['http', 'invalid', 'ok-false', 'json']) {
    fault = type;
    before = requests;
    const failed = await page.goto(`${base}/related-products?${ordered}`);
    assert.equal(failed.status(), 503);
    assert.equal(requests - before, 1);
    assert.equal(await page.getByRole('heading', { name: 'We couldn’t load the related products', exact: true }).count(), 1);
    assert.equal(await page.locator('.product-card').count(), 0);
  }
  fault = '';
  passed('Live HTTP, invalid-price, ok:false and malformed-JSON failures report errors without demo fallback');

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${base}/related-products`);
  assert.equal(await staticPage.getByRole('region', { name: 'Related products', exact: true }).getByRole('article').count(), 3);
  await staticPage.getByRole('link', { name: 'Configured catalogue', exact: true }).click();
  await staticPage.getByRole('checkbox', { name: 'Live Track Jacket', exact: true }).check();
  await staticPage.getByRole('button', { name: 'Show selected products' }).click();
  await staticPage.getByRole('heading', { name: 'Live Track Jacket', exact: true }).waitFor();
  await noJS.close();
  passed('Cards and the demo selection form work without JavaScript');
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(externalRequests, []);
  passed('No browser runtime errors, browser API calls or external requests');
  writeFileSync('artifacts/related-products-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => upstream.close(resolve));
}
