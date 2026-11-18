/* Start `npm start`; install Playwright or point PLAYWRIGHT_MODULE at an existing install. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = process.env.GAME_URL || 'http://localhost:4173';
const results = path.resolve(__dirname, '../test-results');
fs.mkdirSync(results, { recursive: true });
const KEY = 'moo-ving-v3';
// Play with the design-document values so edits to game_config.yaml don't change what this test expects.
const { loadConfig } = require('../scripts/config.js');
const designDoc = loadConfig(path.join(__dirname, 'fixtures/design-doc-config.yaml'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/game/config.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.MOO_CONFIG = ${JSON.stringify(designDoc)};` }));
    const page = await context.newPage(), errors = [], missing = [];
    // Inject fixtures after the old document has saved on pagehide.
    await page.addInitScript(key => {
      const fixture = sessionStorage.getItem('smoke-next-save');
      if (fixture) { localStorage.setItem(key, fixture); sessionStorage.removeItem('smoke-next-save'); }
    }, KEY);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    const live = fn => page.waitForFunction(fn, null, { timeout: 25000 });
    const fixture = async build => {
      await page.evaluate(([key, src]) => {
        const s = MooGame.createGame(5); MooGame.act(s, 'start');
        new Function('s', 'G', src)(s, MooGame);
        sessionStorage.setItem('smoke-next-save', JSON.stringify(s));
      }, [KEY, `(${build})(s, G)`]);
      await page.reload();
    };
    const center = async selector => { const b = await page.locator(selector).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    async function dragTo(from, to) {
      const [x1, y1] = await center(from), [x2, y2] = await center(to);
      await page.mouse.move(x1, y1); await page.mouse.down();
      await page.mouse.move(x1 + 20, y1 + 10, { steps: 3 });
      await page.mouse.move(x2, y2, { steps: 12 }); await page.mouse.up();
    }
    const shot = name => page.screenshot({ path: path.join(results, name + '.png') });

    await page.goto(base);
    await page.evaluate(() => localStorage.clear()); await page.reload();
    assert.equal(await page.locator('#welcome').isVisible(), true);
    await shot('welcome-desktop');
    await page.locator('[data-action="start"]:not([data-value])').click();
    assert.equal(await page.locator('#guide').isVisible(), false, 'regular play skips the tutorial');
    assert.equal((await saved()).tutorial, 'off');
    await fixture(s => { s.started = false; });
    await page.locator('[data-action="start"][data-value="tutorial"]').click();
    assert.equal(await page.locator('#guide').isVisible(), true);
    assert.match(await page.locator('#guide-text').textContent(), /first cow/);
    await page.reload();
    assert.equal((await saved()).tutorial, 'first-sale', 'tutorial choice survives a reload');
    assert.equal(await page.locator('#guide').isVisible(), true);
    await shot('tutorial-miso-desktop');

    // UI always wins while the saucer is directly over an abductable cow.
    const stillCows = await page.addStyleTag({ content: '.field-cow { left: 50% !important; transition: none !important; }' });
    const fieldBounds = await page.locator('#stage').boundingBox();
    await page.mouse.move(fieldBounds.x + fieldBounds.width / 2, fieldBounds.y + fieldBounds.height * .6);
    await page.waitForSelector('#ufo.locked');
    for (const selector of ['[data-action="inventory"]', '[data-action="menu"]']) {
      await page.locator(selector).click({ delay: 350 });
      assert.equal(await page.locator('#world-dialog').evaluate(el => el.open), true);
      await page.keyboard.press('Escape');
      assert.equal((await saved()).ship.length, 0, 'a UI click never abducts a cow');
    }
    await page.locator('[data-action="travel"][data-value="ship"]').click({ delay: 350 });
    assert.equal((await saved()).scene, 'ship', 'travel works while the UFO is locked');
    assert.equal((await saved()).ship.length, 0);
    await page.locator('[data-action="travel"][data-value="farm"]').click();
    await stillCows.evaluate(el => el.remove());
    await page.evaluate(() => document.activeElement.blur());

    // Field: steer the UFO over a cow with the mouse, then beam with Space.
    let beamed = false;
    for (let tries = 0; tries < 12 && !beamed; tries++) {
      const [x] = await center('.field-cow:not(.resting)');
      await page.mouse.move(x, 300);
      await page.waitForTimeout(450);
      if (await page.locator('.field-cow.targeted').count()) {
        await page.keyboard.press('Space');
        await page.keyboard.press('Space'); // a second press during the beam must not take another cow
        await page.locator('[data-action="travel"][data-value="ship"]').click();
        assert.equal((await saved()).scene, 'ship', 'travel also works during an active abduction');
        assert.equal(await page.locator('#pad-cow .cow-art').count(), 1);
        await page.locator('[data-action="travel"][data-value="farm"]').click();
        await page.waitForTimeout(1400);
        beamed = (await saved()).ship.length === 1;
      }
    }
    assert.ok(beamed, 'a cow was beamed up');
    assert.match(await page.locator('#guide-text').textContent(), /Go to the Ship/);
    assert.equal((await saved()).field.length, 4);
    await shot('farm-desktop');

    // Ship: the first cow is already on the pad; milk it, then use the chute.
    await page.keyboard.press('2');
    assert.equal((await saved()).pad, (await saved()).ship[0].id);
    assert.equal(await page.locator('#pad-cow .cow-art').count(), 1);
    assert.equal(await page.locator('#milk-rack').count(), 0);
    await page.locator('#milk-button').click();
    await page.waitForTimeout(1500);
    await shot('ship-milking-desktop');
    await live(() => document.querySelector('#bottles').textContent.startsWith('1/'));
    assert.equal((await saved()).bottles.base, 1);
    assert.match(await page.locator('#guide-text').textContent(), /Go to the Market/, 'the first bottle leads straight to selling, without waiting for another cow or the chute');
    assert.equal(await page.locator('#travel [data-value="market"]').evaluate(el => el.classList.contains('tutorial-target')), true);
    await page.waitForTimeout(1000);
    await dragTo('.pad-cow-art', '.pod-body');
    assert.equal(await page.locator('#pod.launch').count(), 1);
    await page.waitForTimeout(900);
    assert.equal(await page.locator('#mini-pod.fly').count(), 1);
    await shot('return-chute-launch');
    let s = await saved();
    assert.equal(s.ship.length, 0); assert.equal(s.field.length, 5);
    assert.ok(s.field.some(c => c.restUntil > s.time), 'the exhausted cow rests in the field');

    // Market: sell at the left stand, buy a ship upgrade at the middle stand.
    await page.keyboard.press('3');
    await page.locator('.stand-sell').click();
    await page.locator('[data-action="sellAll"]').click();
    assert.equal((await saved()).coins, 5);
    assert.equal((await saved()).tutorial, 'markets');
    assert.equal(await page.locator('#world-dialog').evaluate(el => el.open), false, 'the first sale reveals the market stands');
    assert.equal(await page.locator('.stand.tutorial-target').count(), 3);
    await page.reload();
    assert.equal(await page.locator('.stand.tutorial-target').count(), 3, 'the market prompt survives a reload');
    await page.locator('.stand-ship').click();
    assert.equal(await page.locator('.market-tutorial').isVisible(), true);
    assert.match(await page.locator('.market-tutorial').textContent(), /Left: sell milk/);
    assert.match(await page.locator('.market-tutorial').textContent(), /Middle: upgrade your ship/);
    assert.match(await page.locator('.market-tutorial').textContent(), /Right: buy cows and treats/);
    assert.match(await page.locator('.market-tutorial').textContent(), /drag the treat onto the cow/);
    await shot('tutorial-market-overview');
    await page.locator('.market-tutorial [data-action="finish-tutorial"]').click();
    assert.equal((await saved()).tutorial, 'done', 'no purchase or upgrade is required to finish');
    assert.equal(await page.locator('.market-tutorial').count(), 0);
    assert.equal(await page.locator('.tutorial-target').count(), 0);
    await page.locator('[data-action="shipUpgrade"][data-value="milkTime"]').click();
    s = await saved(); assert.equal(s.levels.milkTime, 1); assert.equal(s.coins, 0);
    await page.keyboard.press('Escape');
    await shot('market-desktop');

    // Cow storage UI: drag a chocolate bar onto a base cow aboard.
    await fixture((s, G) => { s.coins = 60; G.act(s, 'beam', s.field[0].id); G.act(s, 'travel', 'market'); G.act(s, 'buyItem', 'chocolateBar'); G.act(s, 'travel', 'ship'); });
    await page.locator('#cow-monitor').click();
    assert.equal(await page.locator('.cow-card:not(.empty)').count(), 1);
    await dragTo('[data-action="select-item"][data-value="chocolateBar"]', '.cow-card:not(.empty)');
    s = await saved(); assert.equal(s.ship[0].type, 'chocolate'); assert.equal(s.items.chocolateBar, 0); assert.equal(s.ship[0].upgraded, true);
    await shot('cow-storage-desktop');
    await page.keyboard.press('Escape');

    // Inventory opens anywhere; progress survives a reload.
    await page.keyboard.press('1'); await page.keyboard.press('i');
    assert.match(await page.locator('#dialog-title').textContent(), /Inventory/);
    await page.keyboard.press('Escape');
    await page.reload();
    assert.equal(await page.locator('#welcome').isVisible(), false);
    assert.equal(await page.locator('#guide').isVisible(), false, 'the tutorial stays finished');
    assert.equal((await saved()).ship[0].type, 'chocolate');

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const scene of ['farm', 'ship', 'market']) {
        await page.locator(`[data-action="travel"][data-value="${scene}"]`).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `${scene} fits ${width}px`);
        const allInside = await page.locator('#travel button, #hud-right button').evaluateAll(els => els.every(el => {
          const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        }));
        assert.equal(allInside, true, `${scene} controls visible at ${width}px`);
        if (width === 390) await shot(scene + '-mobile');
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // A backup is actually restorable; invalid files leave the current dairy intact.
    await page.locator('[data-action="menu"]').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    assert.equal((await download).suggestedFilename(), 'moo-ving-dairy-save.json');
    await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    const backup = await saved(); backup.coins = 123;
    await page.locator('#import-file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.locator('[data-action="confirm-import"]').click();
    assert.equal((await saved()).coins, 123);
    await page.locator('[data-action="menu"]').click();
    await page.locator('[data-action="reset"]').click();
    await page.getByRole('button', { name: 'Keep my dairy', exact: true }).click();
    assert.equal((await saved()).coins, 123);
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-action="confirm-reset"]').click();
    assert.equal((await saved()).coins, 0); assert.equal(await page.locator('#welcome').isVisible(), true);

    // Tutorial controls fit narrow screens, and opting out is saved immediately.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const inside = await page.locator('.welcome-actions button').evaluateAll(els => els.every(el => {
        const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      }));
      assert.equal(inside, true, `opening choices fit ${width}px`);
    }
    await page.locator('[data-action="start"][data-value="tutorial"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('tutorial-miso-mobile');
    await page.locator('#guide [data-action="finish-tutorial"]').click();
    await page.reload();
    assert.equal(await page.locator('#guide').isVisible(), false);
    assert.equal((await saved()).tutorial, 'done');

    // The entire game still runs by opening index.html, with no server or network.
    const offline = await context.newPage();
    offline.on('pageerror', e => errors.push(e.message));
    await offline.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await offline.locator('[data-action="start"]:not([data-value])').click();
    assert.equal(await offline.locator('#travel').isVisible(), true);
    await offline.close();
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(missing, [], 'No missing assets or scripts');
    console.log('Browser smoke passed: optional tutorial, saved tutorial progress, first-cow sale, market and upgrade overview without purchases, tutorial skipping, UI priority, abduction, automatic pad, milking, return chute, market trading, item drag, inventory, autosave, narrow layouts, backup restore, reset, and file:// play.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
