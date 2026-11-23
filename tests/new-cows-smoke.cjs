/* Run with the local server; PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE are optional. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const results = path.resolve(__dirname, '../test-results');
fs.mkdirSync(results, { recursive: true });
const KEY = 'moo-ving-v3';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], missing = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
    await page.addInitScript(key => {
      const fixture = sessionStorage.getItem('new-cows-next-save');
      if (fixture) { localStorage.setItem(key, fixture); sessionStorage.removeItem('new-cows-next-save'); }
    }, KEY);
    const fixture = async build => {
      await page.evaluate(src => {
        const G = MooGame, s = G.createGame(10);
        G.act(s, 'start');
        new Function('s', 'G', src)(s, G);
        sessionStorage.setItem('new-cows-next-save', JSON.stringify(s));
      }, `(${build})(s, G)`);
      await page.reload();
      if (await page.locator('[data-action="continue"]').isVisible()) await page.locator('[data-action="continue"]').click();
    };
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    const close = () => page.locator('[data-action="close-dialog"]').click();
    const travel = scene => page.locator(`#travel [data-value="${scene}"]`).click();
    const shot = name => page.screenshot({ path: path.join(results, name + '.png') });
    await page.goto(process.env.GAME_URL || 'http://localhost:4173');
    await fixture((s, G) => {
      const cow = s.field[0]; cow.type = 'almond';
      G.act(s, 'beam', cow.id);
      s.coins = G.ITEMS.festiveSpice.cost + G.ITEMS.boneBiscuit.cost;
      G.act(s, 'travel', 'market');
      s.levels.milkTime = G.SHIP.milkTime.max;
    });
    await page.locator('[data-action="stand"][data-value="cows"]').click();
    assert.match(await page.locator('#dialog-content').textContent(), /almond → eggnog → skeleton/);
    for (const key of ['festiveSpice', 'boneBiscuit']) {
      await page.locator(`[data-action="buyItem"][data-value="${key}"]`).click();
    }
    assert.equal((await saved()).coins, 0);
    await page.locator('.item-bone-biscuit').scrollIntoViewIfNeeded();
    await shot('new-cows-shop');
    await close(); await travel('ship');
    await page.locator('#cow-monitor').click();
    await page.locator('[data-action="select-item"][data-value="festiveSpice"]').click();
    await page.locator('[data-action="card-cow"]').click();
    assert.equal((await saved()).ship[0].type, 'eggnog');
    await shot('new-cows-eggnog-storage');
    await close();
    assert.equal(await page.locator('#pad-cow .cow-art.eggnog').count(), 1);
    await shot('new-cows-eggnog-ship');
    await page.locator('#milk-button').click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).bottles.eggnog === 1, KEY);
    // Keep the normal rules; use a saved fixture to finish resting between trips.
    await fixture((s, G) => {
      s.field[0].type = 'eggnog'; s.items.boneBiscuit = 1; s.bottles.eggnog = 1;
      G.act(s, 'beam', s.field[0].id); G.act(s, 'travel', 'ship');
      s.levels.milkTime = G.SHIP.milkTime.max;
    });
    await page.locator('#cow-monitor').click();
    await page.locator('[data-action="select-item"][data-value="boneBiscuit"]').click();
    await page.locator('[data-action="card-cow"]').click();
    assert.equal((await saved()).ship[0].type, 'skeleton');
    assert.match(await page.locator('.cow-card').first().textContent(), /Fully upgraded/);
    await shot('new-cows-skeleton-storage');
    await close(); await shot('new-cows-skeleton-ship');
    await page.locator('#milk-button').click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).bottles.skeleton === 1, KEY);
    await page.locator('[data-action="inventory"]').click();
    assert.equal(await page.locator('.slot .bottle.eggnog').count(), 1);
    assert.equal(await page.locator('.slot .bottle.skeleton').count(), 1);
    await shot('new-cows-inventory');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('new-cows-inventory-mobile');
    const closeBounds = await page.locator('[data-action="close-dialog"]').boundingBox();
    assert.ok(closeBounds && closeBounds.x >= 0 && closeBounds.y >= 0 && closeBounds.x + closeBounds.width <= 390);
    await close(); await travel('market');
    await page.locator('[data-action="stand"][data-value="sell"]').click();
    await page.locator('[data-action="sell"][data-value="eggnog"][data-extra="all"]').click();
    await page.locator('[data-action="sell"][data-value="skeleton"][data-extra="all"]').click();
    const s = await saved();
    assert.equal(s.sold.eggnog, 1); assert.equal(s.sold.skeleton, 1);
    assert.equal(s.coins, await page.evaluate(() => MooGame.COWS.eggnog.price + MooGame.COWS.skeleton.price));
    await shot('new-cows-sales-mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
    await fixture((s, G) => {
      const template = s.field[0];
      s.field = G.TYPES.map((type, id) => ({ ...template, type, id, name: G.COWS[type].name }));
      s.nextCow = s.field.length;
    });
    await shot('new-cows-field');
    // Check all new PNGs decode successfully with the server and direct file play.
    const urls = ['cow-eggnog', 'cow-skeleton', 'festive-spice', 'bone-biscuit', 'bottle-eggnog', 'bottle-skim'];
    const checkImages = () => page.evaluate(names => Promise.all(names.map(name => new Promise(resolve => {
      const im = new Image(); im.onload = () => resolve([im.naturalWidth, im.naturalHeight]);
      im.onerror = () => resolve(null); im.src = new URL(`assets/sprites/${name}.png`, location.href).href;
    }))), urls);
    assert.deepEqual(await checkImages(), [[512, 331], [512, 331], [96, 96], [96, 96], [34, 80], [34, 80]]);
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    assert.deepEqual(await checkImages(), [[512, 331], [512, 331], [96, 96], [96, 96], [34, 80], [34, 80]]);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log('New cow browser checks passed: shop, both upgrades, milk, sales, inventory, desktop/mobile screenshots, field and file:// assets.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
