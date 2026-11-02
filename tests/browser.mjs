import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const fixture = JSON.parse(readFileSync(new URL('../src/features/products/catalog.demo.json', import.meta.url)));
const processes = [];
const results = [];
let browser;
let stub;
let phase = 'success';
let catalogCalls = 0;
const passed = (message) => { results.push(message); console.log(`PASS ${message}`); };

async function start(env) {
  const process = spawn('node', ['dist/server/entry.mjs'], {
    env: { ...globalThis.process.env, COMMERCE_API_BASE_URL: '', ...env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(process);
  let log = '';
  process.stdout.on('data', data => { log += data; });
  process.stderr.on('data', data => { log += data; });
  const base = `http://127.0.0.1:${env.PORT}`;
  for (let i = 0; i < 100; i++) {
    if (process.exitCode !== null) throw new Error(`Server exited: ${log}`);
    try { await fetch(base); return base; } catch { await delay(100); }
  }
  throw new Error(`Server startup timed out: ${log}`);
}

try {
  mkdirSync('artifacts', { recursive: true });
  browser = await chromium.launch({
    ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}),
    headless: true,
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const base = await start({ PRODUCTS_DATA_MODE: 'demo', PORT: '4431' });
  for (const [name, width, height, columns] of [
    ['desktop', 1440, 1000, 3], ['laptop', 1280, 800, 3],
    ['tablet', 768, 1024, 3], ['small-tablet', 640, 900, 2], ['mobile', 390, 844, 1], ['small-mobile', 320, 700, 1],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal((await page.goto(base)).status(), 200);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await page.locator('article').count(), 3);
    assert.equal(await page.locator('.stock-label').count(), 1);
    assert.equal(await page.locator('del').count(), 3);
    assert.match(await page.locator('.demo-context').innerText(), /Demo mode/);
    const geometry = await page.locator('.product-grid').evaluate(grid => ({
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      cards: [...grid.querySelectorAll('.product-image')].map(image => ({ width: image.clientWidth, height: image.clientHeight })),
    }));
    assert.equal(geometry.columns, columns);
    assert.equal(geometry.overflow, false);
    for (const image of geometry.cards) assert.ok(Math.abs(image.width / image.height - 0.75) < 0.01);
    const price = (await page.locator('.product-price').first().innerText()).replace(/\s/g, ' ');
    assert.match(price, /LKR 3,990/);
    if (['desktop', 'mobile'].includes(name)) await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
    passed(`${name}: ${columns} columns, portrait images, correct price, no horizontal overflow`);
  }

  for (const [name, width] of [['desktop', 1440], ['mobile', 390]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/examples`);
    assert.equal(await page.locator('.image-placeholder').count(), 1);
    assert.match(await page.locator('.image-placeholder').getAttribute('aria-label'), /lightweight everyday/);
    assert.equal(await page.locator('article').nth(1).locator('del').count(), 0);
    assert.ok((await page.locator('h2').first().innerText()).length > 90);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/edge-cases-${name}.png`, fullPage: true });
    passed(`${name} edge cases: full long title, deliberate missing-image placeholder, absent comparison`);
  }
  await page.getByRole('link', { name: 'Back to product cards' }).click();
  await page.waitForURL(base + '/');
  passed('Example navigation returns to catalogue');

  stub = createServer((request, response) => {
    assert.equal(request.url, '/merchant/catalog');
    catalogCalls++;
    response.setHeader('Content-Type', 'application/json');
    if (phase === 'http') { response.statusCode = 502; response.end('{"ok":false}'); return; }
    if (phase === 'json') { response.end('invalid JSON'); return; }
    let body = structuredClone(fixture);
    if (phase === 'ok') body.ok = false;
    if (phase === 'price') body.products[0].price_minor = null;
    if (phase === 'empty') body.products = [];
    if (phase === 'unlisted') body.products.forEach(product => { product.listed = false; });
    if (phase === 'success') {
      body.products[0].storefront_uid = 'a-real-uid-without-demo-media';
      body.products[0].title = 'Live stub product';
      body.products[1].listed = false;
      delete body.products[2].compare_at_minor;
    }
    response.end(JSON.stringify(body));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  const stubPort = stub.address().port;
  const live = await start({ PRODUCTS_DATA_MODE: 'live', COMMERCE_API_BASE_URL: `http://127.0.0.1:${stubPort}/merchant`, PORT: '4432' });
  catalogCalls = 0;
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal((await page.goto(live)).status(), 200);
  assert.equal(catalogCalls, 1);
  assert.equal(await page.locator('article').count(), 2);
  assert.equal(await page.locator('.image-placeholder').count(), 1);
  assert.equal(await page.locator('del').count(), 1);
  assert.match(await page.locator('.demo-context').innerText(), /Live mode/);
  passed('Live stub: one catalogue request, listed:false excluded, unmapped image, no comparison');

  for (phase of ['empty', 'unlisted']) {
    assert.equal((await page.goto(live)).status(), 200);
    assert.equal(await page.locator('article').count(), 0);
    await page.getByRole('heading', { name: 'No products to show yet' }).waitFor();
    await page.screenshot({ path: `artifacts/${phase}.png`, fullPage: true });
    passed(`Live ${phase} catalogue shows an understandable empty state`);
  }
  for (phase of ['http', 'ok', 'json', 'price']) {
    assert.equal((await page.goto(live)).status(), 503);
    assert.equal(await page.locator('article').count(), 0);
    await page.getByRole('heading', { name: 'We couldn’t load the products' }).waitFor();
    assert.match(await page.locator('.demo-context').innerText(), /Live mode/);
    passed(`Live ${phase} failure: 503, clear error, no demo fallback`);
  }
  await page.screenshot({ path: 'artifacts/live-error.png', fullPage: true });
  for (const [name, env] of [
    ['missing configuration', { COMMERCE_API_BASE_URL: '', PORT: '4433' }],
    ['network refusal', { COMMERCE_API_BASE_URL: 'http://127.0.0.1:1', PORT: '4434' }],
  ]) {
    const url = await start({ PRODUCTS_DATA_MODE: 'live', ...env });
    assert.equal((await page.goto(url)).status(), 503);
    assert.equal(await page.locator('article').count(), 0);
    passed(`Live ${name}: no demo fallback`);
  }
  assert.deepEqual(pageErrors, []);
  passed('No browser runtime errors');
  writeFileSync('artifacts/verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  if (stub) await new Promise(resolve => stub.close(resolve));
  for (const process of processes) process.kill('SIGTERM');
}
