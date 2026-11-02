import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4435';
const results = [];
const passed = (message) => { results.push(message); console.log(`PASS ${message}`); };
const server = spawn('node', ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4435', PRODUCTS_DATA_MODE: 'demo' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${serverLog}`);
    try { await fetch(`${base}/quantity-stepper`); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, `Preview did not start: ${serverLog}`);
  browser = await chromium.launch({
    ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(base)) externalRequests.push(request.url());
  });
  assert.equal((await page.goto(`${base}/quantity-stepper`)).status(), 200);
  await page.locator('[data-enhanced="true"]').first().waitFor();
  assert.equal(await page.locator('[data-quantity-stepper]').count(), 6);
  const stepper = id => page.locator('[data-quantity-stepper]').filter({ has: page.locator(`#${id}`) });
  const increase = id => stepper(id).getByRole('button', { name: 'Increase quantity' });
  const decrease = id => stepper(id).getByRole('button', { name: 'Decrease quantity' });
  const value = id => page.locator(`#${id}`).textContent();

  await page.evaluate(() => {
    globalThis.quantityChanges = [];
    document.addEventListener('quantitychange', event => {
      globalThis.quantityChanges.push({ id: event.target.querySelector('output').id, value: event.detail.value });
    });
  });
  assert.equal(await decrease('everyday').isDisabled(), true);
  await increase('everyday').evaluate(button => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a quantity button.');
    for (let i = 0; i < 30; i++) button.click();
  });
  assert.equal(await value('everyday'), '10');
  assert.equal(await increase('everyday').isDisabled(), true);
  assert.equal(await stepper('everyday').locator('input').inputValue(), '10');
  await decrease('everyday').evaluate(button => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a quantity button.');
    for (let i = 0; i < 30; i++) button.click();
  });
  assert.equal(await value('everyday'), '1');
  assert.equal(await decrease('everyday').isDisabled(), true);
  const changes = await page.evaluate(() => globalThis.quantityChanges.filter(event => event.id === 'everyday'));
  assert.deepEqual(changes.map(event => event.value), [2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  passed('Rapid repeated clicks stay within supplied limits and emit one bubbling event per actual change');

  assert.equal(await increase('upper-limit').isDisabled(), true);
  await decrease('upper-limit').focus();
  await page.keyboard.press('Space');
  assert.equal(await value('upper-limit'), '4');
  await page.keyboard.press('Enter');
  assert.equal(await value('upper-limit'), '3');
  assert.equal(await increase('upper-limit').isEnabled(), true);
  passed('Native keyboard activation works and controls re-enable away from boundaries');

  assert.equal(await value('zero'), '0');
  assert.equal(await decrease('zero').isDisabled(), true);
  await increase('zero').click();
  assert.equal(await value('zero'), '1');
  assert.equal(await value('everyday'), '1');
  assert.equal(await value('long-label'), '4');
  passed('Zero minimum is respected and multiple instances maintain independent state');

  for (const id of ['fixed', 'disabled']) {
    assert.equal(await decrease(id).isDisabled(), true);
    assert.equal(await increase(id).isDisabled(), true);
  }
  assert.equal(await stepper('disabled').locator('input').isDisabled(), true);
  assert.equal(await page.locator('#everyday').getAttribute('aria-live'), 'polite');
  passed('Fixed and explicitly disabled controls are inactive; quantity changes have a live output');

  // Wrap the demo in a form before scripts execute to exercise the optional form field.
  await page.route('**/quantity-stepper?form', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<ul class="stepper-examples"', '<form id="quantity-form"><ul class="stepper-examples"').replace('</ul>', '</ul></form>');
    await route.fulfill({ response, body: html });
  });
  await page.goto(`${base}/quantity-stepper?form`);
  await page.locator('[data-enhanced="true"]').first().waitFor();
  await increase('zero').click();
  assert.equal(await page.locator('#quantity-form').evaluate(form => new FormData(form).get('quantity-zero')), '1');
  assert.equal(await page.locator('#quantity-form').evaluate(form => new FormData(form).has('quantity-disabled')), false);
  await page.locator('#quantity-form').evaluate(form => {
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected a quantity form.');
    form.reset();
  });
  assert.equal(await value('zero'), '0');
  assert.equal(await decrease('zero').isDisabled(), true);
  await increase('zero').click();
  await page.locator('#quantity-form').evaluate(form => {
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected a quantity form.');
    form.addEventListener('reset', event => event.preventDefault(), { once: true });
    form.reset();
  });
  assert.equal(await value('zero'), '1');
  passed('Named form fields track quantity, omit disabled values, and reset with the form');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width] of [['desktop', 1440], ['mobile', 390], ['small-mobile', 320]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/quantity-stepper`);
    await page.locator('[data-enhanced="true"]').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const columns = await page.locator('.stepper-examples').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width >= 768 ? 2 : 1);
    assert.ok((await stepper('long-label').locator('.quantity-label').textContent()).length > 65);
    const sizes = await page.locator('.quantity-controls button').evaluateAll(buttons => buttons.map(button => ({ width: button.clientWidth, height: button.clientHeight })));
    assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44));
    await page.screenshot({ path: `artifacts/quantity-stepper-${name}.png`, fullPage: true });
    passed(`${name}: responsive layout, full long label, accessible button sizes and no overflow`);
  }

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${base}/quantity-stepper`);
  assert.equal(await staticPage.locator('#everyday').textContent(), '1');
  assert.equal(await staticPage.locator('[data-quantity-stepper]').first().getByRole('button', { name: 'Increase quantity' }).isDisabled(), true);
  assert.match(await staticPage.locator('[data-quantity-stepper]').first().innerText(), /Enable JavaScript/);
  await noJS.close();
  passed('Without JavaScript the initial quantity remains visible and inactive controls are explained');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  passed('No browser runtime errors or upstream requests');
  writeFileSync('artifacts/quantity-stepper-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
