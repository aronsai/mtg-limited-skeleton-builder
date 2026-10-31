// Optional browser QA: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { testSets, testPrintings, oldPrintings } from './fixtures.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const prefix = '/mtg-limited-skeleton-builder/';
const server = createServer(async (req, res) => {
  const file = decodeURIComponent(req.url.split('?')[0]).replace(prefix, '') || 'index.html';
  if (!['index.html', 'styles.css', 'app.js', 'cards.js', 'storage.js', 'scryfall.js'].includes(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(file, root)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const errors = [];
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" rx="26" fill="#455d42"/><rect x="18" y="20" width="452" height="50" rx="6" fill="#acba8d"/><path d="M30 390 150 150 250 280 390 100 460 390Z" fill="#859665"/><rect x="26" y="420" width="436" height="230" rx="7" fill="#c6caad"/></svg>';
let failAPI = false, oldDelay = 0;
async function setup(context) {
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('https://api.scryfall.com/**', async route => {
    if (failAPI) { await route.abort(); return; }
    const requestURL = new URL(route.request().url());
    let body;
    if (requestURL.pathname === '/sets') body = { data: testSets };
    else if (requestURL.searchParams.get('q')?.includes('set:old')) {
      if (oldDelay) await new Promise(resolve => setTimeout(resolve, oldDelay));
      body = { data: oldPrintings, has_more: false };
    } else if (requestURL.pathname === '/page2') body = { data: testPrintings.slice(5), has_more: false, total_cards: testPrintings.length };
    else body = { data: testPrintings.slice(0, 5), has_more: true, next_page: 'https://api.scryfall.com/page2', total_cards: testPrintings.length };
    await route.fulfill({ json: body });
  });
  await context.route('https://cards.scryfall.io/**', route => route.fulfill({ contentType: 'image/svg+xml', body: image }));
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await setup(context);
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('.card-row').length === 10);
  assert.match(await page.locator('#set-search').inputValue(), /The Test Wilds/);
  assert.equal(await page.locator('#empty-deck').isVisible(), true);
  const add = name => page.getByRole('button', { name: `Add ${name}`, exact: true }).first().click();
  const count = async n => assert.equal(await page.locator('#total-count').textContent(), String(n));
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('skeleton-builder.v1')));
  await add('Llanowar Elves'); await add('Llanowar Elves'); await add('Elvish Mystic');
  await count(3);
  assert.equal(await page.locator('.card-stack .deck-card').count(), 2);
  assert.equal(await page.locator('.deck-card[data-card="elf"] .deck-quantity').textContent(), '×2');
  await page.getByRole('button', { name: 'Increase Llanowar Elves', exact: true }).focus();
  await page.keyboard.press('Enter'); await count(4);
  assert.equal(await page.getByRole('button', { name: 'Increase Llanowar Elves', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'Decrease Llanowar Elves', exact: true }).click(); await count(3);
  await add('Negate');
  await page.locator('.card-row[data-card="terror"]').dragTo(page.locator('#deck-canvas'));
  await count(5);
  await page.locator('[data-basic="G"]').click(); await page.locator('[data-basic="W"]').click();
  await count(7);
  assert.equal(await page.locator('#creature-count').textContent(), '4');
  assert.equal(await page.locator('#spell-count').textContent(), '1');
  assert.equal(await page.locator('#land-count').textContent(), '2');
  assert.equal(await page.locator('#average-mv').textContent(), '2.4 avg.');
  assert.equal(await page.locator('.land-grid .deck-card').count(), 2);
  await page.locator('[data-color="W"]').click(); await page.locator('[data-color="U"]').click();
  assert.equal(await page.locator('.card-row').count(), 5);
  await page.locator('#reset-filters').click();
  await page.locator('#booster-filter').check(); assert.equal(await page.locator('.card-row').count(), 9);
  await page.locator('#reset-filters').click();
  await page.locator('#card-search').fill('flying'); assert.equal(await page.locator('.card-row').count(), 9);
  await page.locator('#reset-filters').click();
  await page.locator('#type-filter').selectOption('Artifact'); assert.equal(await page.locator('.card-row').count(), 1);
  await page.locator('.inspect-card').click(); assert.equal(await page.locator('#preview-fallback').isVisible(), true);
  await page.keyboard.press('Escape'); await page.locator('#reset-filters').click();
  await page.locator('.card-row[data-card="dfc"] .inspect-card').click();
  assert.equal(await page.locator('#preview-name').textContent(), 'Day Scholar');
  await page.locator('#flip-preview').click(); assert.equal(await page.locator('#preview-name').textContent(), 'Night Sage');
  await page.keyboard.press('Escape');
  await page.mouse.move(1400, 20);
  await page.getByRole('button', { name: 'Add Negate', exact: true }).focus();
  await page.locator('#card-preview').waitFor({ state: 'visible', timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#card-preview').isVisible(), false);
  await page.locator('#deck-name').fill('Blue-green possibility');
  await page.locator('#save-deck').click();
  assert.equal((await state()).decks.length, 1);
  assert.equal((await state()).decks[0].name, 'Blue-green possibility');
  await page.locator('#clear-deck').click(); await count(0);
  assert.equal((await state()).decks.length, 1); assert.equal((await state()).draft.id, null);
  await page.locator('#undo-clear').click(); await count(7);
  await page.locator('#save-as').click(); await page.locator('#choice-input').fill('Second possibility');
  await page.locator('#choice-actions [value="save"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('skeleton-builder.v1')).decks.length === 2);
  assert.equal((await state()).decks.length, 2);
  await page.locator('#open-decks').click();
  await page.locator('.saved-deck').filter({ hasText: 'Second possibility' }).getByRole('button', { name: 'Rename' }).click();
  await page.locator('#choice-input').fill('Renamed idea'); await page.locator('#choice-actions [value="rename"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('skeleton-builder.v1')).draft.name === 'Renamed idea');
  assert.equal((await state()).draft.name, 'Renamed idea');
  await page.locator('.saved-deck').filter({ hasText: 'Renamed idea' }).getByRole('button', { name: 'Delete' }).click();
  await page.locator('#choice-actions [value="delete"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('skeleton-builder.v1')).decks.length === 1);
  assert.equal((await state()).decks.length, 1); assert.equal((await state()).draft.id, null);
  await page.getByRole('button', { name: 'Close saved decks', exact: true }).click();
  // Switching sets protects the dirty draft. Cancel leaves everything intact.
  await page.locator('#set-search').fill('old'); await page.locator('[data-set="old"]').click();
  await page.locator('#choice-actions [value="cancel"]').click();
  assert.match(await page.locator('#set-search').inputValue(), /Test Wilds/); await count(7);
  // Save before switching, then switch back during a delayed load to reject stale data.
  oldDelay = 1000;
  await page.locator('#set-search').fill('old'); await page.locator('[data-set="old"]').click();
  await page.locator('#choice-actions [value="save"]').click();
  await page.waitForFunction(() => document.querySelector('#deck-set').textContent === 'OLD');
  await count(0);
  await page.locator('#set-search').fill('tst'); await page.locator('[data-set="tst"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.card-row').length === 10);
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.card-row[data-card="old-card"]').count(), 0);
  // Open saved deck without refetching its metadata; saved state survives refresh.
  await page.locator('#open-decks').click(); await page.locator('.saved-deck').filter({ hasText: 'Blue-green possibility' }).getByRole('button', { name: 'Open ↗' }).click();
  await count(7);
  await add('Inspiring Overseer'); await count(8);
  await page.reload(); await count(8);
  await page.waitForFunction(() => document.querySelectorAll('.card-row').length === 10);
  // Mobile layout, no document overflow; keyboard shortcut reveals card search.
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('[data-tab="deck"]').click(); assert.equal(await page.locator('#deck-canvas').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('[data-tab="cards"]').click(); assert.equal(await page.locator('#card-list').isVisible(), true);
  }
  if (process.env.SCREENSHOT_DIR) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/skeleton-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/skeleton-desktop.png` });
  }
  failAPI = true;
  await page.reload(); await count(8);
  await page.locator('#retry-load').waitFor(); assert.equal(await page.locator('.deck-card').count() > 0, true);
  failAPI = false;
  await page.locator('#retry-load').click(); await page.waitForFunction(() => document.querySelectorAll('.card-row').length === 10);
  await context.close();
  // Browser blocks writes: draft edits still work, Save cannot report success.
  const blocked = await browser.newContext(); await setup(blocked);
  await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  const blockedPage = await blocked.newPage(); await blockedPage.goto(url);
  await blockedPage.waitForFunction(() => document.querySelectorAll('.card-row').length === 10);
  await blockedPage.getByRole('button', { name: 'Add Negate', exact: true }).click();
  await blockedPage.locator('#deck-name').fill('Cannot save'); await blockedPage.locator('#save-deck').click();
  assert.equal(await blockedPage.locator('#storage-warning').isVisible(), true);
  assert.equal(await blockedPage.locator('#saved-count').textContent(), '0');
  assert.doesNotMatch(await blockedPage.locator('#draft-status').textContent(), /^Saved/);
  await blocked.close();
  const corrupt = await browser.newContext(); await setup(corrupt);
  await corrupt.addInitScript(() => { if (location.protocol === 'http:') localStorage.setItem('skeleton-builder.v1', '{broken'); });
  const corruptPage = await corrupt.newPage(); await corruptPage.goto(url);
  await corruptPage.waitForFunction(() => document.querySelectorAll('.card-row').length === 10);
  assert.equal(await corruptPage.evaluate(() => localStorage.getItem('skeleton-builder.v1')), '{broken');
  assert.equal(await corruptPage.locator('#storage-warning').isVisible(), true);
  await corrupt.close();
  assert.deepEqual(errors, []);
  console.log('PASS: browser interactions, drag/drop, focus, previews, filters, quantities, statistics, save/open/rename/delete, Clear/Undo, refresh, set-switch protection/cancellation, offline recovery, storage failures, mobile layout, and repository-prefix assets.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
