import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const results = [];
const passed = message => { results.push(message); console.log(`PASS ${message}`); };
const children = [];
let browser;
let stub;
let phase = 'success';
let sessions = 0;
let quoteCalls = 0;
let catalogCalls = 0;
const uid = '11111111-1111-4111-8111-111111111111';
const cartId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `test.${Buffer.from(JSON.stringify({ cart_id: cartId })).toString('base64url')}.test`;
const catalog = { ok: true, products: [{ storefront_uid: uid, title: 'Live quote jacket', listed: true, purchasable: true, is_pack: false,
  price_minor: 999999, options: [{ name: 'Size', values: ['M'] }], variants: [{ item_code: 'JACKET-M', values: ['M'] }] }], packs: [] };

async function start(env) {
  const child = spawn('node', ['dist/server/entry.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PRODUCTS_DATA_MODE: 'demo', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let log = '';
  child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
  const base = `http://127.0.0.1:${env.PORT}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try { await fetch(`${base}/cart-drawer`); return base; } catch { await delay(100); }
  }
  throw new Error(log);
}

try {
  browser = await chromium.launch({ ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}), headless: true });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let reads = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/api/cart/drawer-view')) reads++; });
  const base = await start({ PORT: '4440', CART_DATA_MODE: 'demo', CART_CHECKOUT_URL: '', COMMERCE_API_BASE_URL: 'http://127.0.0.1:1' });
  assert.equal((await page.goto(`${base}/cart-drawer`)).status(), 200);
  await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  const dialog = page.getByRole('dialog', { name: 'Your basket' });
  const content = page.locator('[data-drawer-content]');
  const items = page.locator('dialog [data-cart-item]');
  const open = page.getByRole('button', { name: 'Open basket', exact: true });
  const close = page.getByRole('button', { name: 'Close', exact: true });
  const status = page.locator('[data-drawer-status]');
  const loaded = () => page.waitForFunction(() => {
    const content = document.querySelector('[data-drawer-content]');
    const status = document.querySelector('[data-drawer-status]')?.textContent;
    return content && !content.hidden && !content.inert && (status === 'Basket updated.' || status === 'Your basket is empty.');
  });
  await page.evaluate(() => { document.documentElement.style.overflow = 'clip'; });
  let releaseInitialRead;
  const initialReadGate = new Promise(resolve => { releaseInitialRead = resolve; });
  await page.route('**/api/cart/drawer-view', async route => { await initialReadGate; await route.continue(); }, { times: 1 });
  await open.click();
  assert.match(await status.innerText(), /Loading/);
  releaseInitialRead();
  await loaded();
  assert.equal(await items.count(), 3);
  assert.equal(await page.locator('[data-basket-count]').textContent(), '4');
  assert.match((await dialog.locator('.grand-total').innerText()).replace(/\s/g, ' '), /LKR 13,460/);
  assert.equal(reads, 1);
  assert.equal(await close.evaluate(element => document.activeElement === element), true);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('dialog').evaluate(element => element.contains(document.activeElement)), true);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog').open && document.documentElement.style.overflow === 'clip');
  assert.equal(await open.evaluate(element => document.activeElement === element), true);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'clip');
  assert.equal(await open.getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => { document.documentElement.style.overflow = ''; });
  passed('Modal loads once, traps focus, locks scroll, closes with Escape and restores focus/previous scroll style');

  await page.getByRole('button', { name: /^Basket/ }).click();
  await loaded();
  await page.mouse.click(20, 100);
  await page.waitForFunction(() => !document.querySelector('dialog').open);
  passed('Floating trigger opens the same drawer; desktop backdrop closes it');

  await open.click(); await loaded();
  await items.first().getByRole('button', { name: /Remove Track Jacket/ }).click();
  assert.equal(await dialog.getByRole('link', { name: 'Checkout' }).getAttribute('inert'), '');
  await page.waitForFunction(() => document.querySelector('[data-basket-count]')?.textContent === '2');
  await loaded();
  assert.equal(await items.count(), 2);
  assert.match((await dialog.locator('.grand-total').innerText()).replace(/\s/g, ' '), /LKR 5,480/);
  assert.equal(await dialog.getByRole('link', { name: 'Checkout' }).getAttribute('inert'), null);
  passed('Confirmed demo removal refreshes items, count and totals before checkout becomes available');
  assert.equal(await dialog.getByRole('link', { name: 'Checkout' }).getAttribute('href'), '/cart-drawer/checkout');
  await dialog.getByRole('link', { name: 'Checkout' }).click();
  await page.getByRole('heading', { name: 'Checkout link preview' }).waitFor();
  passed('Supplied demo checkout link reaches a clearly identified destination preview');

  await page.getByRole('link', { name: 'Back to cart drawer' }).click();
  await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  await open.click(); await loaded();
  while (await items.count() > 0) {
    const previous = await items.count();
    await items.first().getByRole('button').click();
    await page.waitForFunction(previous => {
      const content = document.querySelector('[data-drawer-content]');
      return content && !content.inert && content.querySelectorAll('[data-cart-item]').length < previous;
    }, previous);
  }
  await loaded();
  await dialog.getByRole('heading', { name: 'Your basket is empty' }).waitFor();
  assert.equal(await dialog.getByRole('link', { name: 'Checkout' }).count(), 0);
  assert.equal(await page.locator('[data-basket-count]').textContent(), '0');
  passed('Removing every demo item shows an empty basket with no checkout link');
  await close.click();

  await page.getByLabel('Demo basket response').selectOption('populated');
  await open.click(); await loaded(); await close.click();
  await page.getByLabel('Demo basket response').selectOption('error');
  await open.click();
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert.equal(await items.count(), 3);
  assert.equal(await content.evaluate(element => element.inert), true);
  const beforeRetry = reads;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert.equal(reads, beforeRetry + 1);
  assert.match(await status.innerText(), /couldn’t refresh/);
  passed('Refresh failure retains the last items, blocks stale checkout and supports an explicit retry');
  await close.click();
  await page.getByLabel('Demo basket response').selectOption('empty');
  await open.click(); await loaded();
  assert.equal(await items.count(), 0);
  await close.click();
  passed('Empty response is distinct from a failed response');

  await page.reload(); await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  await page.locator('#drawer-add-demo').getByRole('button', { name: 'Increase quantity' }).click();
  await page.locator('#drawer-add-demo').getByRole('button', { name: 'Add to cart', exact: true }).click();
  await dialog.waitFor(); await loaded();
  assert.equal(await items.count(), 4);
  assert.equal(await page.locator('[data-basket-count]').textContent(), '6');
  assert.match((await dialog.locator('.grand-total').innerText()).replace(/\s/g, ' '), /LKR 17,440/);
  passed('Confirmed AddToCartButton action opens the drawer and refreshes its coherent demo cart state');
  await close.click();

  const readsBefore = reads;
  await open.click();
  await page.evaluate(() => document.querySelector('[data-add-to-cart]').dispatchEvent(new CustomEvent('cartadded', {
    bubbles: true, detail: { storefront_uid: '33333333-3333-4333-8333-333333333333', qty: 1 },
  })));
  await close.click();
  await page.waitForFunction(() => document.querySelector('[data-basket-count]')?.textContent === '7');
  await loaded();
  assert.equal(reads, readsBefore + 2);
  assert.equal(await page.locator('dialog').evaluate(element => element.open), false);
  passed('An add during a pending read schedules one fresh read, even after the drawer closes');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['small-mobile', 320, 700]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/cart-drawer`); await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
    await open.click(); await loaded();
    await dialog.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const bounds = await page.locator('dialog').boundingBox();
    assert.ok(Math.abs(bounds.x + bounds.width - width) < 2);
    assert.ok(bounds.width <= width && bounds.height <= height + 1);
    assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const imageWidth = await items.first().locator('.item-image').evaluate(element => element.clientWidth);
    assert.equal(imageWidth, 80);
    await page.screenshot({ path: `artifacts/cart-drawer-${name}.png`, fullPage: true });
    if (width < 768) assert.equal(await page.locator('.drawer-scroll').evaluate(element => element.scrollHeight > element.clientHeight), true);
    await close.click();
    passed(`${name}: right-aligned responsive drawer, contained cart rows and scrolling without horizontal overflow`);
  }
  await open.click(); await close.click();
  await delay(500);
  assert.equal(await page.locator('dialog').evaluate(element => element.open), false);
  passed('Closing during a read does not reopen the drawer when the response arrives');

  await page.reload(); await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  await open.click(); await loaded();
  await items.first().getByRole('button', { name: /Remove Track Jacket/ }).click();
  await close.click();
  await open.click();
  await page.waitForFunction(() => document.querySelector('[data-basket-count]')?.textContent === '2');
  await loaded();
  assert.equal(await items.count(), 2);
  assert.match((await dialog.locator('.grand-total').innerText()).replace(/\s/g, ' '), /LKR 5,480/);
  await close.click();
  passed('A removal finishing after close/reopen still refreshes the current cart and totals');

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage(); await staticPage.goto(`${base}/cart-drawer`);
  assert.equal(await staticPage.getByRole('button', { name: 'Open basket', exact: true }).isDisabled(), true);
  assert.match(await staticPage.locator('body').innerText(), /Enable JavaScript to open the basket/);
  await noJS.close();
  passed('No-JavaScript state keeps opening controls disabled with an explanation');

  stub = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/merchant/catalog') { catalogCalls++; response.end(JSON.stringify(catalog)); return; }
    assert.equal(request.headers['x-dose-public-caller'], 'storefront');
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers['x-dose-internal-token'], undefined);
    if (request.url === '/merchant/sessions') {
      sessions++;
      response.setHeader('Set-Cookie', [`dose_cart=${token}; Path=/; HttpOnly; SameSite=Lax`, 'dose_sid=test; Path=/; HttpOnly; SameSite=Lax']);
      response.end(JSON.stringify({ ok: true, cart_id: cartId, cart_token: token })); return;
    }
    assert.equal(request.headers['x-storefront-credential'], token);
    if (request.url === `/merchant/carts/${cartId}/lines`) {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      response.end(JSON.stringify({ ok: true, cart_id: cartId, lines: body.lines.map(line => ({ ...line, line_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })) })); return;
    }
    assert.equal(request.url, `/merchant/carts/${cartId}/quote`); quoteCalls++;
    if (phase === 'error') { response.statusCode = 503; response.end(JSON.stringify({ ok: false })); return; }
    response.end(JSON.stringify({ ok: true, quote: { ok: true, currency: 'LKR', net_total_minor: '700000', tax_total_minor: 98000, grand_total_minor: '798000',
      lines: [{ idx: 1, line_id: null, storefront_uid: uid, item_code: 'JACKET', variant: 'JACKET-M', qty: 2, rate_minor: phase === 'invalid' ? null : '399000' }] } }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  const live = await start({ PORT: '4441', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: `http://127.0.0.1:${stub.address().port}/merchant`, CART_CHECKOUT_URL: 'https://checkout.example.test/start' });
  await page.goto(`${live}/cart-drawer`); await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  await open.click(); await loaded();
  assert.equal(await items.count(), 0); assert.equal(quoteCalls, 0); assert.equal(sessions, 0);
  await close.click();
  passed('A visitor without a cart sees an empty live basket without creating a session');
  await page.goto(`${live}/add-to-cart`); await page.locator('[data-add-to-cart][data-enhanced="true"]').first().waitFor();
  await page.locator('form').first().getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByLabel('Product option').selectOption('JACKET-M');
  await page.locator('form').first().getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.locator('[data-state="success"]').waitFor();
  await page.goto(`${live}/cart-drawer`); await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  const catalogsBefore = catalogCalls;
  await open.click(); await loaded();
  assert.equal(await items.count(), 1); assert.equal(quoteCalls, 1); assert.equal(catalogCalls, catalogsBefore + 1); assert.equal(sessions, 1);
  assert.match(await items.first().locator('h3').innerText(), /Live quote jacket/);
  assert.match(await items.first().locator('dd').innerText(), /M/);
  assert.match((await dialog.locator('.grand-total').innerText()).replace(/\s/g, ' '), /LKR 7,980/);
  assert.match((await items.first().locator('.item-price').innerText()).replace(/\s/g, ' '), /LKR 3,990/);
  assert.equal(await items.first().getByRole('button').isDisabled(), true);
  assert.equal(await dialog.getByRole('link', { name: 'Checkout' }).getAttribute('href'), 'https://checkout.example.test/start');
  passed('Live drawer reuses AddToCart cookies, loads one quote/catalogue, displays authoritative prices/options/totals and supplied checkout link');
  await close.click();
  for (phase of ['error', 'invalid']) {
    await open.click(); await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert.equal(await items.count(), 1); assert.equal(await content.evaluate(element => element.inert), true);
    assert.equal(sessions, 1);
    assert.equal(await page.locator('.demo-context').innerText().then(text => text.includes('Live basket')), true);
    await close.click();
    passed(`Live ${phase} response: retained prior view, blocked checkout, no fixture/session fallback`);
  }
  phase = 'success';
  const noCheckout = await start({ PORT: '4442', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: `http://127.0.0.1:${stub.address().port}/merchant`, CART_CHECKOUT_URL: '' });
  await page.goto(`${noCheckout}/cart-drawer`); await page.locator('[data-cart-drawer][data-enhanced="true"]').waitFor({ state: 'attached' });
  await open.click(); await loaded();
  assert.equal(await dialog.getByRole('link', { name: 'Checkout' }).count(), 0);
  assert.match(await dialog.locator('.checkout-unavailable').innerText(), /unavailable/);
  passed('Missing live checkout configuration does not invent a checkout destination');
  const previousReads = quoteCalls;
  const forbidden = await fetch(`${live}/api/cart/drawer-view`, { method: 'POST', headers: { Origin: 'https://other.example.test', 'Content-Type': 'application/json', Cookie: `dose_cart=${token}` }, body: JSON.stringify({ scenario: 'populated', additions: [], removedIds: [] }) });
  assert.equal(forbidden.status, 403); assert.equal(quoteCalls, previousReads);
  assert.equal((await fetch(`${live}/api/cart/drawer-view`)).status, 405);
  assert.deepEqual(errors, []);
  passed('Cart read action enforces same origin/method and no browser runtime errors occurred');
  writeFileSync('artifacts/cart-drawer-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  if (stub) await new Promise(resolve => stub.close(resolve));
  for (const child of children) child.kill('SIGTERM');
}
