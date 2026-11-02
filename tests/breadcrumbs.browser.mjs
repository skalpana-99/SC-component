import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4447';
const results = [];
const passed = message => { results.push(message); console.log(`PASS ${message}`); };
const server = spawn('node', ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4447', PRODUCTS_DATA_MODE: 'demo', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: 'http://127.0.0.1:1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try { await fetch(`${base}/breadcrumbs`); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, log);
  browser = await chromium.launch({ ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const apiRequests = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
    if (!request.url().startsWith(base)) externalRequests.push(request.url());
  });
  const response = await page.goto(`${base}/breadcrumbs`);
  assert.equal(response.status(), 200);
  assert.ok(!(await response.text()).includes('<script'));
  const current = page.getByRole('navigation', { name: 'Current page breadcrumb', exact: true });
  assert.equal(await current.getByRole('list').count(), 1);
  assert.equal(await current.getByRole('listitem').count(), 2);
  assert.deepEqual(await current.getByRole('link').allTextContents(), ['Home']);
  assert.equal(await current.getByRole('link').getAttribute('href'), '/');
  assert.equal(await current.locator('[aria-current="page"]').textContent(), 'Breadcrumbs');
  assert.equal(await current.locator('[aria-current="page"]').evaluate(element => element.tagName), 'SPAN');
  assert.equal(await current.locator('[aria-current="page"]').getAttribute('tabindex'), null);
  assert.equal(await current.locator('.separator').getAttribute('aria-hidden'), 'true');
  passed('Labelled navigation, ordered list, supplied ancestor link, non-linked current page and hidden separator semantics');

  const root = page.getByRole('navigation', { name: 'Home breadcrumb', exact: true });
  assert.equal(await root.getByRole('listitem').count(), 1);
  assert.equal(await root.getByRole('link').count(), 0);
  assert.equal(await root.locator('.separator').count(), 0);
  assert.equal(await page.getByRole('region', { name: 'No navigation data', exact: true }).getByRole('navigation').count(), 0);
  passed('Root hierarchy stays a single current item; absent data emits no empty navigation');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width] of [['desktop', 1440], ['mobile', 390], ['small-mobile', 320]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/breadcrumbs`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const long = page.getByRole('navigation', { name: 'Long-label breadcrumb', exact: true });
    assert.match(await long.locator('[aria-current="page"]').innerText(), /AnUnbrokenNavigationLabelForCheckingSmallScreenWrapping/);
    assert.equal(await long.locator('[aria-current="page"]').evaluate(element => getComputedStyle(element).textOverflow), 'clip');
    assert.equal(await long.locator('[aria-current="page"]').evaluate(element => element.scrollWidth > element.clientWidth), false);
    await page.screenshot({ path: `artifacts/breadcrumbs-${name}.png`, fullPage: true });
    passed(`${name}: long labels and unbroken text remain fully visible without horizontal overflow`);
  }

  await current.getByRole('link', { name: 'Home', exact: true }).focus();
  assert.equal(await current.getByRole('link', { name: 'Home', exact: true }).evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Enter');
  await page.waitForURL(`${base}/`);
  await page.getByRole('heading', { name: 'Everyday essentials' }).waitFor();
  passed('Ancestor links support native keyboard navigation to the real home page');

  await page.goto(`${base}/breadcrumbs`);
  await page.getByRole('link', { name: 'View this hierarchy on the checkout link preview' }).click();
  await page.waitForURL(`${base}/cart-drawer/checkout`);
  const actual = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  assert.deepEqual(await actual.getByRole('link').allTextContents(), ['Home', 'Cart drawer']);
  assert.equal(await actual.locator('[aria-current="page"]').textContent(), await page.getByRole('heading', { level: 1 }).innerText());
  await actual.getByRole('link', { name: 'Cart drawer', exact: true }).click();
  await page.waitForURL(`${base}/cart-drawer`);
  await page.getByRole('heading', { name: 'Cart drawer', exact: true }).waitFor();
  passed('Existing checkout-link preview displays its real hierarchy and a working parent link');

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${base}/breadcrumbs`);
  const staticNav = staticPage.getByRole('navigation', { name: 'Current page breadcrumb', exact: true });
  assert.equal(await staticNav.locator('[aria-current="page"]').innerText(), 'Breadcrumbs');
  await staticNav.getByRole('link', { name: 'Home', exact: true }).click();
  await staticPage.waitForURL(`${base}/`);
  await noJS.close();
  passed('Complete markup and native navigation work with JavaScript disabled');
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(externalRequests, []);
  passed('No browser runtime errors, endpoint calls or external requests');
  writeFileSync('artifacts/breadcrumbs-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
