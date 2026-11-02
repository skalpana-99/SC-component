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
let savedNote = 'Existing cart note';
let reads = 0;
const writes = [];
const cartId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `test.${Buffer.from(JSON.stringify({ cart_id: cartId })).toString('base64url')}.test`;
const contact = { email: 'private@example.test', phone: 'private-phone', billing_address: { line1: 'private address' } };
const originalContact = structuredClone(contact);

async function start(env) {
  const child = spawn('node', ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PRODUCTS_DATA_MODE: 'demo', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let log = ''; child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
  const base = `http://127.0.0.1:${env.PORT}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try { await fetch(`${base}/order-note`); return base; } catch { await delay(100); }
  }
  throw new Error(log);
}

try {
  browser = await chromium.launch({ ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}), headless: true });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const demoWrites = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/cart/demo-order-note')) demoWrites.push(JSON.parse(request.postData())); });
  const demo = await start({ PORT: '4444', CART_DATA_MODE: 'demo', COMMERCE_API_BASE_URL: 'http://127.0.0.1:1' });
  assert.equal((await page.goto(`${demo}/order-note`)).status(), 200);
  const form = page.locator('[data-order-note]');
  const field = page.getByLabel('Order note (optional)', { exact: true });
  const status = page.getByRole('status', { name: 'Order note status' });
  await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.inputValue(), 'Please ring the bell once.');
  assert.equal(await form.getByRole('button', { name: 'Save note', exact: true }).isDisabled(), true);
  await page.evaluate(() => {
    globalThis.noteEvents = [];
    document.addEventListener('ordernotesaved', event => globalThis.noteEvents.push(event.detail.orderNote));
  });
  await field.fill('  Leave at reception.  ');
  await page.getByRole('heading', { name: 'Order note', exact: true }).click();
  assert.equal(demoWrites.length, 0);
  let releaseInitialSave;
  const initialSaveGate = new Promise(resolve => { releaseInitialSave = resolve; });
  await page.route('**/api/cart/demo-order-note?outcome=success', async route => { await initialSaveGate; await route.continue(); }, { times: 1 });
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  assert.equal(await form.getByRole('button', { name: 'Saving…' }).isDisabled(), true);
  assert.equal(await field.isEnabled(), true);
  await form.evaluate(element => { for (let i = 0; i < 10; i++) element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await field.fill('Please use the side entrance.');
  releaseInitialSave();
  await status.filter({ hasText: 'Previous version saved. You have unsaved changes.' }).waitFor();
  assert.equal(demoWrites.length, 1);
  assert.deepEqual(demoWrites[0], { order_note: 'Leave at reception.' });
  assert.equal(await field.inputValue(), 'Please use the side entrance.');
  assert.equal(await form.getByRole('button', { name: 'Save note', exact: true }).isEnabled(), true);
  assert.deepEqual(await page.evaluate(() => globalThis.noteEvents), ['Leave at reception.']);
  passed('Explicit save only; pending duplicate submits are suppressed and newer in-flight edits are preserved');
  await form.getByRole('button', { name: 'Save note', exact: true }).focus();
  await page.keyboard.press('Enter');
  await status.filter({ hasText: 'Order note saved.' }).waitFor();
  assert.equal(await form.getByRole('button', { name: 'Save note', exact: true }).isDisabled(), true);
  assert.equal(demoWrites.length, 2);
  passed('Keyboard save confirms the edited note and marks it unchanged');
  await field.fill(' \n ');
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'Order note cleared.' }).waitFor();
  assert.deepEqual(demoWrites[2], { order_note: null });
  assert.equal(await field.inputValue(), '');
  passed('Clearing submits an explicit null and confirms the cleared state');

  const beforeInvalid = demoWrites.length;
  await field.fill('a'.repeat(501));
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'within 500 characters' }).waitFor();
  assert.equal((await field.inputValue()).length, 501);
  assert.equal(await field.getAttribute('aria-invalid'), 'true');
  assert.equal(demoWrites.length, beforeInvalid);
  await field.fill('😀'.repeat(500));
  assert.equal(await form.locator('[data-note-count]').innerText(), '500 / 500');
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'Order note saved.' }).waitFor();
  assert.equal(await field.inputValue(), '😀'.repeat(500));
  await field.fill('Please apply a COUPON.');
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'Please reword' }).waitFor();
  assert.equal(demoWrites.length, beforeInvalid + 1);
  passed('Unicode code-point limits and source-confirmed refusal rules are enforced without truncating the draft');

  await page.getByLabel('Demo save result').selectOption('error');
  await field.fill('Please ring once.');
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'order system refused' }).waitFor();
  assert.equal(await field.inputValue(), 'Please ring once.');
  assert.equal(await form.getByRole('button', { name: 'Try again', exact: true }).isEnabled(), true);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/order-note-error.png', fullPage: true });
  passed('Server refusal retains the draft and offers an intentional retry');
  await page.getByLabel('Demo save result').selectOption('uncertain');
  await form.getByRole('button', { name: 'Try again', exact: true }).click();
  await status.filter({ hasText: 'couldn’t confirm the save' }).waitFor();
  const afterLoss = demoWrites.length;
  await delay(100);
  assert.equal(demoWrites.length, afterLoss);
  assert.equal(await field.inputValue(), 'Please ring once.');
  await page.getByLabel('Demo save result').selectOption('success');
  await form.getByRole('button', { name: 'Try again', exact: true }).click();
  await status.filter({ hasText: 'Order note saved.' }).waitFor();
  passed('Unconfirmed save is not labelled saved, makes no automatic retry and can be retried explicitly');

  await page.route('**/api/cart/demo-order-note?outcome=success', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, order_note: null }) }));
  await field.fill('Keep this draft.');
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'couldn’t confirm the save' }).waitFor();
  assert.equal(await field.inputValue(), 'Keep this draft.');
  await page.unroute('**/api/cart/demo-order-note?outcome=success');
  passed('A mismatched success response cannot falsely confirm a note was saved');

  for (const [name, width] of [['desktop', 1440], ['mobile', 390], ['small-mobile', 320]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${demo}/order-note`); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await field.getAttribute('maxlength'), null);
    assert.equal(await field.evaluate(element => element.clientWidth <= innerWidth), true);
    await page.screenshot({ path: `artifacts/order-note-${name}.png`, fullPage: true });
    passed(`${name}: readable field and controls without horizontal overflow`);
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage(); await staticPage.goto(`${demo}/order-note`);
  assert.equal(await staticPage.getByLabel('Order note (optional)', { exact: true }).isDisabled(), true);
  assert.match(await staticPage.locator('body').innerText(), /Enable JavaScript/);
  await noJS.close();
  passed('No-JavaScript state explains that editing and saving are unavailable');

  const disabledLive = await fetch(`${demo}/api/cart/order-note`, { method: 'POST', headers: { Origin: demo, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_note: 'A note' }) });
  assert.equal(disabledLive.status, 503);
  assert.equal((await disabledLive.json()).reason, 'live_not_enabled');
  passed('Demo configuration cannot silently call the live saving action');

  stub = createServer(async (request, response) => {
    assert.equal(request.url, `/merchant/carts/${cartId}/contact`);
    assert.equal(request.headers['x-storefront-credential'], token);
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers['x-dose-internal-token'], undefined);
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET') {
      reads++; assert.equal(request.headers['x-dose-public-caller'], undefined);
      if (phase === 'read-error') { response.statusCode = 503; response.end(JSON.stringify({ ok: false })); return; }
      response.end(JSON.stringify({ ok: true, cart_id: cartId, order_note: savedNote, contact, billing_address: contact.billing_address, email_opt_in: { opted_in: true } })); return;
    }
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-dose-public-caller'], 'storefront');
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); writes.push(body);
    assert.deepEqual(Object.keys(body), ['order_note']);
    if (phase === 'closed') { response.statusCode = 409; response.end(JSON.stringify({ ok: false, cart_id: cartId, reason: 'cart_already_ordered' })); return; }
    if (phase === 'write-error') { response.statusCode = 500; response.end(JSON.stringify({ ok: false })); return; }
    if (phase === 'missing-column') { response.end(JSON.stringify({ ok: true, cart_id: cartId, order_note: null })); return; }
    savedNote = body.order_note;
    response.end(JSON.stringify({ ok: true, cart_id: cartId, order_note: savedNote }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  const live = await start({ PORT: '4445', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: `http://127.0.0.1:${stub.address().port}/merchant` });
  await page.goto(`${live}/order-note`); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.isDisabled(), true); assert.equal(reads, 0); assert.equal(writes.length, 0);
  assert.match(await status.innerText(), /Add an item/);
  passed('No cart means unavailable saving and no automatic session creation');
  await context.addCookies([{ name: 'dose_cart', value: token, url: live, httpOnly: true, sameSite: 'Lax' }]);
  await page.reload(); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.inputValue(), 'Existing cart note');
  const readback = await page.request.get(`${live}/api/cart/order-note`);
  assert.deepEqual(await readback.json(), { ok: true, order_note: 'Existing cart note' });
  await field.fill('Live updated note.');
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'Order note saved.' }).waitFor();
  assert.equal(savedNote, 'Live updated note.');
  await page.reload(); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.inputValue(), 'Live updated note.');
  assert.deepEqual(contact, originalContact);
  passed('Live read filters contact details; note-only save persists after reload without changing contact/address data');
  const literalNote = '<script>globalThis.noteInjected = true</script>\nGift note.';
  await field.fill(literalNote);
  await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'Order note saved.' }).waitFor();
  await page.reload(); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.inputValue(), literalNote);
  assert.equal(await page.evaluate(() => globalThis.noteInjected), undefined);
  passed('Saved markup-like text remains plain text after server rendering');
  await field.fill(''); await form.getByRole('button', { name: 'Save note', exact: true }).click();
  await status.filter({ hasText: 'Order note cleared.' }).waitFor();
  assert.equal(savedNote, null);
  await page.reload(); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.inputValue(), '');
  passed('Live clearing persists an explicit null');

  for (phase of ['closed', 'write-error', 'missing-column']) {
    await field.fill(`Draft during ${phase}.`);
    await form.getByRole('button').click();
    await form.locator('[aria-busy="false"]').waitFor();
    assert.equal(await field.inputValue(), `Draft during ${phase}.`);
    assert.equal(await form.getAttribute('data-state'), phase === 'closed' ? 'error' : 'uncertain');
    passed(`Live ${phase}: draft retained, no false saved confirmation or fixture fallback`);
  }
  phase = 'read-error'; await page.reload(); await page.locator('[data-order-note][data-enhanced="true"]').waitFor();
  assert.equal(await field.isDisabled(), true); assert.equal(await field.inputValue(), '');
  assert.match(await status.innerText(), /couldn’t load/);
  passed('Live initial read failure is explicit and disables editing rather than showing a demo note');
  const beforeForbidden = writes.length;
  const forbidden = await fetch(`${live}/api/cart/order-note`, { method: 'POST', headers: { Origin: 'https://other.example.test', Cookie: `dose_cart=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_note: 'forbidden' }) });
  assert.equal(forbidden.status, 403); assert.equal(writes.length, beforeForbidden);
  phase = 'success';
  const stripped = await fetch(`${live}/api/cart/order-note`, { method: 'POST', headers: { Origin: live, Cookie: `dose_cart=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_note: 'Only the note changes.', email: 'must-not-change@example.test', email_opt_in: false }) });
  assert.equal(stripped.status, 200); assert.deepEqual(contact, originalContact);
  assert.deepEqual(errors, []);
  passed('Same-origin enforcement and payload projection protect unrelated cart fields; no runtime errors occurred');
  writeFileSync('artifacts/order-note-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close(); if (stub) await new Promise(resolve => stub.close(resolve));
  for (const child of children) child.kill('SIGTERM');
}
