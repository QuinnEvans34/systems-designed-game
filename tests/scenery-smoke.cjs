/* Run with the same PLAYWRIGHT_MODULE and GAME_URL as browser-smoke.cjs. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const config = require('../scripts/config.js').loadConfig(path.join(__dirname, 'fixtures/design-doc-config.yaml'));
    await page.route('**/game/config.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.MOO_CONFIG = ${JSON.stringify(config)};` }));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('scene-fixture')) {
        localStorage.setItem('moo-ving-v3', sessionStorage.getItem('scene-fixture'));
        sessionStorage.removeItem('scene-fixture');
      }
    });
    await page.goto(process.env.GAME_URL || 'http://localhost:4173');
    await page.evaluate(() => {
      const s = MooGame.createGame(42); s.started = true; s.scene = 'ship';
      s.ship = s.field.splice(0, 3); s.pad = s.ship[0].id;
      sessionStorage.setItem('scene-fixture', JSON.stringify(s));
    });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('moo-ving-v3')));
    const shot = name => page.screenshot({ path: path.resolve('test-results', `scenery-${name}.png`) });
    assert.equal(await page.locator('#milk-note, .pad-info, .pad-actions, .pod-label, .stand-tag').count(), 0);
    assert.equal(await page.locator('.ship-cow .selection-screen').count(), 2);
    assert.equal(await page.locator('.ship-cow .cow-name').evaluateAll(els => els.every(el => el.getBoundingClientRect().height > 5)), true, 'selection cards display cow names');
    assert.equal(await page.locator('#pad-name').textContent(), (await saved()).ship[0].name);
    await shot('ship');
    // Drag a console hologram to the pad; the actual cow materializes there.
    const selector = page.locator('.ship-cow').first();
    const id = Number(await selector.getAttribute('data-value'));
    const from = await selector.boundingBox(), to = await page.locator('#pad').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    assert.equal(await page.locator('.drag-ghost.hologram').count(), 1);
    await page.mouse.up();
    assert.equal((await saved()).pad, id);
    assert.equal(await page.locator('.ship-scene.teleporting').count(), 1);
    await page.waitForTimeout(250); await shot('teleport');
    await page.waitForTimeout(700);
    await page.locator('#milk-button').click();
    assert.match(await page.locator('#pad-status').textContent(), /Milking/);
    assert.equal(await page.locator('#store-cow').isDisabled(), true);
    await shot('milking');
    // Both ambient scene pixels and reduced-motion fallback are observable.
    for (const [key, name] of [['1', 'farm'], ['2', 'ship'], ['3', 'market']]) {
      await page.keyboard.press(key); await page.waitForTimeout(150);
      const before = await page.locator(`#${name}-scenery`).evaluate(el => el.toDataURL());
      await page.waitForTimeout(600);
      const after = await page.locator(`#${name}-scenery`).evaluate(el => el.toDataURL());
      assert.notEqual(before, after, `${name} ambient motion changes the painting`);
      await shot(name === 'ship' ? 'ship-active' : name);
    }
    assert.equal(await page.locator('.booth-lettering').count(), 0, 'shop names belong to the painted signs');
    await page.waitForTimeout(6000);
    const catsSafe = await page.locator('.cat').evaluateAll(els => els.every(el => {
      const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
      return x >= 33 && x <= 70 && y >= 73 && y <= 88;
    }));
    assert.equal(catsSafe, true, 'cats remain inside the clear walkway');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const el = document.querySelector('#market-scenery');
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      return data.every((v, i) => i % 4 !== 3 || v === 0);
    }, null, { timeout: 5000 });
    const noMotion = await page.locator('#market-scenery').evaluate(el => {
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      return data.every((v, i) => i % 4 !== 3 || v === 0);
    });
    assert.equal(noMotion, true, 'reduced motion shows the original still artwork');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('2');
    await page.waitForFunction(() => /Milking/.test(document.querySelector('#pad-status').textContent) === false, null, { timeout: 20000 });
    await page.locator('#store-cow').click();
    assert.equal((await saved()).pad, null, 'podium returns cows to storage');
    await page.locator('.ship-cow').first().click();
    assert.notEqual((await saved()).pad, null);
    const cowCount = (await saved()).ship.length;
    await page.locator('#return-cow').click();
    assert.equal((await saved()).ship.length, cowCount - 1, 'podium sends cows home');
    for (const [width, height] of [[390, 844], [844, 390], [640, 360]]) {
      await page.setViewportSize({ width, height });
      for (const key of ['1', '2', '3']) {
        await page.keyboard.press(key); await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (key === '2') {
          assert.equal(await page.locator('.storage-console').evaluate(el => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return r.top >= 0 && r.bottom <= innerHeight && el.contains(hit);
          }), true, 'cow console fits the viewport and remains unobscured');
        }
        await shot(`${width}-${key}`);
      }
    }
    const offline = await browser.newPage();
    await offline.addInitScript(() => {
      window.fieldPaints = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas.id === 'farm-scenery') window.fieldPaints++;
        return draw.apply(this, args);
      };
    });
    offline.on('pageerror', e => errors.push(e.message));
    await offline.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
    await offline.waitForFunction(() => window.fieldPaints > 5);
    assert.equal(await offline.locator('#farm-scenery').isVisible(), true, 'ambient field also animates in file:// play');
    await offline.close();
    assert.deepEqual(errors, []);
    console.log('Scenery, teleport drag, status console, market walkway, reduced motion, and responsive checks passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
