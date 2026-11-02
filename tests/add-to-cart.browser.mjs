import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const processes = [];
const results = [];
const passed = message => { results.push(message); console.log(`PASS ${message}`); };
const catalog = JSON.parse(readFileSync(new URL('../src/features/add-to-cart/add-to-cart.demo.json', import.meta.url)));
const cartId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `test.${Buffer.from(JSON.stringify({ cart_id: cartId })).toString('base64url')}.test`;
let sessions = 0;
const added = [];
let phase = 'success';
let browser;
let stub;

async function start(env) {
  const child = spawn('node', ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PRODUCTS_DATA_MODE: 'demo', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(child);
  let log = '';
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  const base = `http://127.0.0.1:${env.PORT}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${log}`);
    try { await fetch(`${base}/add-to-cart`); return base; } catch { await delay(100); }
  }
  throw new Error(`Startup timed out: ${log}`);
}

try {
  browser = await chromium.launch({ ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}), headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const demoCalls = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/cart/demo-lines')) demoCalls.push(JSON.parse(request.postData()));
  });
  const demo = await start({ PORT: '4436', CART_DATA_MODE: 'demo', COMMERCE_API_BASE_URL: 'http://127.0.0.1:1' });
  assert.equal((await page.goto(`${demo}/add-to-cart`)).status(), 200);
  await page.locator('[data-add-to-cart][data-enhanced="true"]').first().waitFor();
  assert.match(await page.locator('.demo-context').innerText(), /Demo cart mode/);
  const first = page.locator('#cart-example-0');
  await first.getByRole('button', { name: 'Increase quantity' }).click();
  await page.evaluate(() => {
    globalThis.cartEvents = [];
    document.addEventListener('cartadded', event => globalThis.cartEvents.push(event.detail));
  });
  await first.getByRole('button', { name: 'Add to cart', exact: true }).click();
  assert.equal(await first.getByRole('button', { name: 'Adding…' }).isDisabled(), true);
  assert.equal(await first.getByRole('button', { name: 'Adding…' }).getAttribute('aria-busy'), 'true');
  await first.evaluate(form => { for (let i = 0; i < 10; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await first.locator('[data-state="success"]').waitFor();
  assert.equal(demoCalls.length, 1);
  assert.equal(demoCalls[0].lines[0].qty, 2);
  assert.match(await first.getByRole('status', { name: 'Cart action status' }).innerText(), /2 items added/);
  assert.equal((await page.evaluate(() => globalThis.cartEvents)).length, 1);
  passed('Demo loading, selected quantity, confirmed success event and repeated-submit suppression');

  const sized = page.locator('#cart-example-1');
  await sized.getByRole('button', { name: 'Add to cart', exact: true }).click();
  assert.match(await sized.getByRole('status', { name: 'Cart action status' }).innerText(), /Choose a product option/);
  assert.equal(demoCalls.length, 1);
  await sized.getByLabel('Product option').selectOption('DEMO-OXFORD-M');
  await sized.getByRole('button', { name: 'Add to cart', exact: true }).focus();
  await page.keyboard.press('Enter');
  await sized.locator('[data-state="success"]').waitFor();
  assert.equal(demoCalls[1].lines[0].variant, 'DEMO-OXFORD-M');
  assert.equal(demoCalls[1].lines[0].qty, 1);
  passed('Missing variant is handled before a request; selected variant submits by keyboard');

  const refused = page.locator('#cart-refusal');
  await refused.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await refused.locator('[data-state="error"]').waitFor();
  assert.match(await refused.getByRole('status', { name: 'Cart action status' }).innerText(), /no longer available/);
  assert.equal(await refused.getByRole('button', { name: 'Try again' }).isEnabled(), true);
  passed('Definite server refusal shows a useful error and permits an intentional retry');

  await page.route('**/api/cart/demo-lines?outcome=success', route => route.abort());
  await first.getByRole('button', { name: 'Add again' }).click();
  await first.locator('[data-state="uncertain"]').waitFor();
  assert.match(await first.getByRole('status', { name: 'Cart action status' }).innerText(), /Check your cart/);
  assert.equal(await first.getByRole('button', { name: 'Check your cart' }).isDisabled(), true);
  const callsAfterLoss = demoCalls.length;
  await first.evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(demoCalls.length, callsAfterLoss);
  await page.unroute('**/api/cart/demo-lines?outcome=success');
  passed('Lost response is not presented as a definite failure and cannot trigger an automatic duplicate add');

  const disabledLive = await fetch(`${demo}/api/cart/lines`, {
    method: 'POST', headers: { Origin: demo, 'Content-Type': 'application/json' }, body: JSON.stringify(demoCalls[0]),
  });
  assert.equal(disabledLive.status, 503);
  assert.equal((await disabledLive.json()).reason, 'live_not_enabled');
  passed('Demo mode cannot silently write to the live cart route');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width] of [['desktop', 1440], ['mobile', 390], ['small-mobile', 320]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${demo}/add-to-cart`);
    await page.locator('[data-add-to-cart][data-enhanced="true"]').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/add-to-cart-${name}.png`, fullPage: true });
    passed(`${name}: usable controls and no horizontal overflow`);
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${demo}/add-to-cart`);
  assert.equal(await staticPage.locator('[data-add-to-cart]').first().getByRole('button').isDisabled(), true);
  assert.match(await staticPage.locator('[data-add-to-cart]').first().innerText(), /Enable JavaScript/);
  await noJS.close();
  passed('No-JavaScript state explains why the action is unavailable');

  stub = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/merchant/catalog') { response.end(JSON.stringify(catalog)); return; }
    assert.equal(request.headers['x-dose-public-caller'], 'storefront');
    assert.equal(request.headers['x-dose-internal-token'], undefined);
    assert.equal(request.headers.cookie, undefined);
    if (request.url === '/merchant/sessions') {
      sessions++;
      response.setHeader('Set-Cookie', [`dose_cart=${token}; Path=/; HttpOnly; SameSite=Lax`, 'dose_sid=test-session; Path=/; HttpOnly; SameSite=Lax']);
      response.end(JSON.stringify({ ok: true, cart_id: cartId, cart_token: token })); return;
    }
    assert.equal(request.url, `/merchant/carts/${cartId}/lines`);
    assert.equal(request.headers['x-storefront-credential'], token);
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    added.push(body);
    if (phase === 'refusal') { response.statusCode = 409; response.end(JSON.stringify({ ok: false, reason: 'variant_unavailable' })); return; }
    if (phase === 'http') { response.statusCode = 500; response.end(JSON.stringify({ ok: false })); return; }
    response.end(JSON.stringify({ ok: true, cart_id: cartId, lines: body.lines.map(line => ({ ...line, line_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })) }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  const live = await start({ PORT: '4437', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: `http://127.0.0.1:${stub.address().port}/merchant` });
  await page.goto(`${live}/add-to-cart`);
  await page.locator('[data-add-to-cart][data-enhanced="true"]').first().waitFor();
  assert.match(await page.locator('.demo-context').innerText(), /Live cart mode/);
  await page.locator('#cart-example-0').getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.locator('#cart-example-0 [data-state="success"]').waitFor();
  assert.equal(sessions, 1); assert.equal(added.length, 1);
  const cookies = await context.cookies(live);
  assert.ok(cookies.filter(cookie => cookie.name === 'dose_cart' || cookie.name === 'dose_sid').every(cookie => cookie.httpOnly));
  assert.ok(!await page.evaluate(() => document.cookie.includes('dose_cart')));
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page.reload();
  await page.locator('[data-add-to-cart][data-enhanced="true"]').first().waitFor();
  await page.locator('#cart-example-1 select').selectOption('DEMO-OXFORD-S');
  await page.locator('#cart-example-1').getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.locator('#cart-example-1 [data-state="success"]').waitFor();
  assert.equal(sessions, 1); assert.equal(added.length, 2);
  assert.equal(added[1].lines[0].variant, 'DEMO-OXFORD-S');
  passed('Live stub: first-party HttpOnly session, reuse after reload, selected variant, no token storage');

  const writes = added.length;
  const forbidden = await fetch(`${live}/api/cart/lines`, {
    method: 'POST', headers: { Origin: 'https://other.example.test', 'Content-Type': 'application/json' }, body: JSON.stringify(demoCalls[0]),
  });
  assert.equal(forbidden.status, 403); assert.equal(added.length, writes);
  assert.equal((await fetch(`${live}/api/cart/admin`)).status, 404);
  passed('Cross-origin actions and arbitrary proxy paths cannot reach commerce');

  for (phase of ['refusal', 'http']) {
    await page.reload();
    await page.locator('[data-add-to-cart][data-enhanced="true"]').first().waitFor();
    await page.locator('#cart-example-0').getByRole('button', { name: 'Add to cart', exact: true }).click();
    await page.locator(`#cart-example-0 [data-state="${phase === 'refusal' ? 'error' : 'uncertain'}"]`).waitFor();
    assert.equal(sessions, 1);
    passed(`Live ${phase}: no new session, retry or demo fallback`);
  }
  await page.screenshot({ path: 'artifacts/add-to-cart-live-error.png', fullPage: true });
  assert.deepEqual(errors, []);
  passed('No browser runtime errors');
  writeFileSync('artifacts/add-to-cart-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  if (stub) await new Promise(resolve => stub.close(resolve));
  for (const child of processes) child.kill('SIGTERM');
}
