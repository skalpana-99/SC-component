import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4439';
const results = [];
const passed = message => { results.push(message); console.log(`PASS ${message}`); };
const child = spawn('node', ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4439', PRODUCTS_DATA_MODE: 'live', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: 'http://127.0.0.1:1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', data => { log += data; });
child.stderr.on('data', data => { log += data; });
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try { await fetch(`${base}/cart-item`); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, log);
  browser = await chromium.launch({ ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}), headless: true });
  const page = await browser.newPage();
  const errors = [];
  const mutations = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'GET') mutations.push(request.url());
    if (!request.url().startsWith(base)) external.push(request.url());
  });
  assert.equal((await page.goto(`${base}/cart-item`)).status(), 200);
  await page.locator('[data-cart-item][data-enhanced="true"]').first().waitFor();
  const items = page.locator('[data-cart-item]');
  assert.equal(await items.count(), 3);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  assert.equal(await items.first().locator('.item-quantity').innerText(), 'Quantity 2');
  assert.match((await items.first().locator('.item-price').innerText()).replace(/\s/g, ' '), /Unit price LKR 3,990/);
  assert.deepEqual(await items.first().locator('dt').allTextContents(), ['Size:', 'Colour:']);
  assert.deepEqual(await items.first().locator('dd').allTextContents(), ['L', 'Olive']);
  assert.equal(await items.nth(1).getByRole('img').getAttribute('aria-label'), `Image unavailable for ${await items.nth(1).locator('h3').innerText()}`);
  assert.equal(await items.nth(2).locator('dl').count(), 0);
  passed('Image, selected options, supplied unit price and quantity render; missing image and no-options cases work');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width] of [['desktop', 1440], ['mobile', 390], ['small-mobile', 320]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/cart-item`);
    await page.locator('[data-cart-item][data-enhanced="true"]').first().waitFor();
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok((await items.nth(1).locator('h3').innerText()).length > 80);
    await page.screenshot({ path: `artifacts/cart-item-${name}.png`, fullPage: true });
    passed(`${name}: full long title, readable item layout and no overflow`);
  }

  await page.getByLabel('Demo removal result').selectOption('error');
  await items.first().getByRole('button', { name: /Remove Track Jacket/ }).click();
  assert.equal(await items.first().getByRole('button', { name: /Removing:/ }).isDisabled(), true);
  await items.first().getByRole('status', { name: 'Item removal status' }).filter({ hasText: 'We couldn’t remove this item. Please try again.' }).waitFor();
  assert.equal(await items.count(), 3);
  assert.equal(await items.first().getByRole('button', { name: /Try again:/ }).isEnabled(), true);
  assert.match(await items.first().locator('.item-price').innerText(), /3,990/);
  await page.screenshot({ path: 'artifacts/cart-item-refusal.png', fullPage: true });
  passed('Definite removal failure retains the row, price and quantity and permits an intentional retry');

  await page.getByLabel('Demo removal result').selectOption('success');
  await page.evaluate(() => {
    globalThis.removedItems = [];
    document.addEventListener('cartitemremoved', event => globalThis.removedItems.push(event.detail.itemId));
  });
  await items.first().getByRole('button', { name: /Try again:/ }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await items.count(), 3);
  await items.first().locator('[data-remove-cart-item]').evaluate(button => {
    for (let i = 0; i < 10; i++) button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.locator('[data-item-id="demo-jacket-line"]').waitFor({ state: 'detached' });
  assert.equal(await items.count(), 2);
  assert.deepEqual(await page.evaluate(() => globalThis.removedItems), ['demo-jacket-line']);
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-remove-cart-item')), true);
  passed('Keyboard removal waits for confirmation, suppresses repeat clicks, emits one event and moves focus');

  while (await items.count() > 0) {
    const itemId = await items.first().getAttribute('data-item-id');
    await items.first().getByRole('button').click();
    await page.locator(`[data-item-id="${itemId}"]`).waitFor({ state: 'detached' });
  }
  assert.equal(await page.getByRole('heading', { name: 'Your cart is empty' }).isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Your cart is empty');
  await page.screenshot({ path: 'artifacts/cart-item-empty.png', fullPage: true });
  passed('Removing all items produces an understandable empty state and moves focus to it');

  await page.getByRole('link', { name: 'Reset demo' }).click();
  await page.locator('[data-cart-item][data-enhanced="true"]').first().waitFor();
  await page.getByLabel('Demo removal result').selectOption('uncertain');
  await items.first().getByRole('button').click();
  await items.first().locator('[data-remove-cart-item][aria-busy="false"]').waitFor();
  assert.equal(await items.count(), 3);
  assert.match(await items.first().getByRole('status').innerText(), /couldn’t confirm removal/);
  assert.equal(await items.first().getByRole('button', { name: /Check cart:/ }).isDisabled(), true);
  passed('Lost confirmation retains the item and blocks blind retries');

  // An external mode with no supplied handler must not use demo success as a fallback.
  await page.route('**/cart-item?external', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replaceAll('data-removal-mode="demo"', 'data-removal-mode="external"');
    await route.fulfill({ response, body: html });
  });
  await page.goto(`${base}/cart-item?external`);
  await page.locator('[data-cart-item][data-enhanced="true"]').first().waitFor();
  assert.equal(await items.first().getByRole('button').isDisabled(), true);
  assert.match(await items.first().getByRole('status').innerText(), /unavailable/);
  passed('External removal without a handler is unavailable and never falls back to demo removal');

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${base}/cart-item`);
  assert.equal(await staticPage.locator('[data-cart-item]').first().getByRole('button').isDisabled(), true);
  assert.match(await staticPage.locator('[data-cart-item]').first().innerText(), /Enable JavaScript/);
  await noJS.close();
  passed('Without JavaScript item details remain visible and the unavailable action is explained');
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  assert.deepEqual(external, []);
  passed('No runtime errors, remote requests or live cart mutations');
  writeFileSync('artifacts/cart-item-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  child.kill('SIGTERM');
}
