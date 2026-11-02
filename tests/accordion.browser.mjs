import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4448';
const results = [];
const passed = message => { results.push(message); console.log(`PASS ${message}`); };
// An unavailable commerce service must not affect this page-supplied content feature.
const server = spawn('node', ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4448', PRODUCTS_DATA_MODE: 'live', CART_DATA_MODE: 'live', COMMERCE_API_BASE_URL: 'http://127.0.0.1:1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try { await fetch(`${base}/accordion`); ready = true; break; } catch { await delay(100); }
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
  const response = await page.goto(`${base}/accordion`);
  assert.equal(response.status(), 200);
  const html = await response.text();
  assert.ok(!html.includes('<script'));
  assert.match(html, /Local editorial fixture · CMS not connected/);
  assert.equal(await page.locator('details').count(), 5);
  assert.equal(await page.locator('details[open]').count(), 0);
  assert.equal(await page.locator('details').first().locator('.answer').isVisible(), false);
  assert.match(html, /This is sample editorial content/);
  passed('Explicit demo source; answers are server-rendered while disclosures start closed');

  const main = page.getByRole('region', { name: 'Frequently asked questions', exact: true });
  const first = main.locator('details').nth(0), second = main.locator('details').nth(1);
  await first.locator('summary').click();
  assert.equal(await first.evaluate(element => element.open), true);
  assert.equal(await first.locator('.answer').isVisible(), true);
  assert.equal(await first.locator('.answer p').count(), 2);
  await second.locator('summary').click();
  assert.equal(await first.evaluate(element => element.open), true);
  assert.equal(await second.evaluate(element => element.open), true);
  await first.locator('summary').click();
  assert.equal(await first.locator('.answer').isVisible(), false);
  assert.equal(await second.evaluate(element => element.open), true);
  for (let i = 0; i < 4; i++) await first.locator('summary').click();
  assert.equal(await first.evaluate(element => element.open), false);
  passed('Mouse expansion/collapse, separate paragraphs and repeated toggles; other items retain their state');

  await page.goto(`${base}/accordion`);
  await first.locator('summary').focus();
  const accessibility = await page.context().newCDPSession(page);
  // Chrome exposes native summary as DisclosureTriangle, which Playwright's
  // generic ARIA snapshot currently omits. Read its actual accessible state.
  async function disclosureState() {
    const { nodes } = await accessibility.send('Accessibility.getFullAXTree');
    const disclosure = nodes.find(node => node.role?.value === 'DisclosureTriangle'
      && node.name?.value === 'Where can I find more product information?');
    assert.ok(disclosure);
    return Object.fromEntries(disclosure.properties.map(property => [property.name, property.value.value]));
  }
  assert.equal((await disclosureState()).focused, true);
  assert.equal((await disclosureState()).expanded, false);
  await page.keyboard.press('Enter');
  assert.equal(await first.evaluate(element => element.open), true);
  assert.equal((await disclosureState()).expanded, true);
  await page.keyboard.press('Space');
  assert.equal(await first.evaluate(element => element.open), false);
  assert.equal(await first.locator('summary').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
  await page.keyboard.press('Tab');
  assert.equal(await second.locator('summary').evaluate(element => document.activeElement === element), true);
  passed('Native accessible expanded state, Enter/Space controls, visible keyboard focus and tab order');

  const edge = page.getByRole('region', { name: 'Long content & plain text', exact: true });
  await edge.locator('summary').nth(1).click();
  assert.match(await edge.locator('details').nth(1).innerText(), /ඔව් — Unicode text is preserved/);
  assert.match(await edge.locator('.answer').nth(1).innerText(), /<strong>sample<\/strong>/);
  assert.equal(await edge.locator('.answer strong').count(), 0);
  await first.locator('summary').click();
  assert.equal(await edge.locator('details').nth(1).evaluate(element => element.open), true);
  passed('Multiple component instances stay independent; Unicode and literal markup render as safe text');

  mkdirSync('artifacts', { recursive: true });
  for (const [name, width] of [['desktop', 1440], ['mobile', 390], ['small-mobile', 320]]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${base}/accordion`);
    await first.locator('summary').click();
    await edge.locator('summary').nth(0).click();
    await edge.locator('summary').nth(1).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await edge.locator('.answer').first().evaluate(element => element.scrollWidth > element.clientWidth), false);
    assert.equal(await edge.locator('summary').first().evaluate(element => element.scrollWidth > element.clientWidth), false);
    assert.match(await edge.locator('.answer').first().innerText(), /ExampleEditorialReferenceWithoutAnySpacesForSmallScreenLayoutChecks1234567890/);
    await page.screenshot({ path: `artifacts/accordion-${name}.png`, fullPage: true });
    passed(`${name}: long questions, paragraphs and unbroken text wrap without horizontal overflow`);
  }

  await page.getByRole('link', { name: 'Empty content', exact: true }).click();
  assert.equal(await page.locator('details').count(), 0);
  assert.equal(await page.getByText('No questions available yet.', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'We couldn’t load the FAQ content' }).count(), 0);
  passed('Empty content has an understandable state without fabricated entries');

  const invalid = await page.goto(`${base}/accordion?example=invalid`);
  assert.equal(invalid.status(), 503);
  assert.equal(await page.getByRole('heading', { name: 'We couldn’t load the FAQ content' }).count(), 1);
  assert.equal(await page.locator('details').count(), 0);
  assert.equal(await page.getByText('No questions available yet.', { exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Return to sample content' }).click();
  assert.equal(await page.locator('details').count(), 5);
  passed('Invalid editorial content reports failure without fixture fallback and provides a recovery link');

  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJS.newPage();
  await staticPage.goto(`${base}/accordion`);
  const native = staticPage.locator('details').first();
  await native.locator('summary').click();
  assert.equal(await native.locator('.answer').isVisible(), true);
  await native.locator('summary').focus();
  await staticPage.keyboard.press('Space');
  assert.equal(await native.locator('.answer').isVisible(), false);
  await staticPage.keyboard.press('Enter');
  assert.equal(await native.locator('.answer').isVisible(), true);
  await noJS.close();
  passed('Mouse and keyboard expansion/collapse work with JavaScript disabled');

  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(externalRequests, []);
  passed('No browser errors, endpoint calls or external requests');
  writeFileSync('artifacts/accordion-verification.json', JSON.stringify({ results }, null, 2) + '\n');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
