/* Game Day features in a real browser: getting caught, free repair, best result.
   Start `npm start` first (PORT=4173). Uses the live game_config.yaml. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.GAME_URL || 'http://localhost:4173';
const results = path.resolve(__dirname, '../test-results');
fs.mkdirSync(results, { recursive: true });
const KEY = 'moo-ving-v3', BEST = 'moo-ving-best';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(), errors = [];
    await page.addInitScript(key => {
      const fixture = sessionStorage.getItem('gd-next-save');
      if (fixture) { localStorage.setItem(key, fixture); sessionStorage.removeItem('gd-next-save'); }
    }, KEY);
    page.on('pageerror', e => errors.push(e.message));
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    const shot = name => page.screenshot({ path: path.join(results, `gameday-${name}.png`) });
    const fixture = async build => {
      await page.evaluate(([key, src]) => {
        const s = MooGame.createGame(7); MooGame.act(s, 'start'); s.tutorial = 'off';
        new Function('s', 'G', src)(s, MooGame);
        sessionStorage.setItem('gd-next-save', JSON.stringify(s));
      }, [KEY, `(${build})(s, G)`]);
      await page.reload();
      if (await page.locator('[data-action="continue"]').isVisible()) await page.locator('[data-action="continue"]').click();
    };
    const dialogText = () => page.locator('#dialog-content').textContent();

    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    assert.equal(await page.locator('#welcome-best').isVisible(), false, 'no best shown before any win');

    // 1. Getting caught: suspicion is nearly full, one cow and some milk are aboard.
    await fixture((s, G) => {
      s.coins = 100; G.act(s, 'beam', s.field[0].id); s.bottles.base = 4;
      s.scene = 'market'; for (let i = 0; i < 3; i++) G.act(s, 'buyCow', 'base');
      s.field.forEach(c => { c.restUntil = 0; }); s.suspicion = G.SUSPICION_LIMIT - 1; s.scene = 'farm';
    });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    assert.match(await page.locator('body').textContent(), /one more beam and you're caught/i, 'warning shows before the catch');
    let caught = false;
    for (let tries = 0; tries < 15 && !caught; tries++) {
      const box = await page.locator('.field-cow:not(.resting)').first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, 300);
      await page.waitForTimeout(450);
      if (await page.locator('.field-cow.targeted').count()) { await page.keyboard.press('Space'); await page.waitForTimeout(300); }
      caught = (await saved()).caught === 1;
    }
    assert.ok(caught, 'beaming past the limit gets you caught');
    assert.match(await dialogText(), /BUSTED|caught you/i);
    assert.match(await dialogText(), /1 cow ran back.*4 bottles of milk spilled/s);
    await shot('caught');
    let s = await saved();
    assert.equal(s.scene, 'market'); assert.equal(s.ship.length, 0); assert.ok(s.suspicion > 45 && s.suspicion <= 50, 'suspicion drops to 50 after getting away');
    await page.getByRole('button', { name: 'Back to work' }).click();

    // 2. Free, slow repair when broke.
    await fixture((s, G) => { s.coins = 0; s.milker.condition = 0; s.milker.broken = true; s.scene = 'ship'; });
    assert.match(await page.locator('#repair-label').textContent(), /Free repair · 60s/);
    await shot('free-repair');
    await page.locator('#repair-button').click({ force: true }); // it pulses while broken
    await page.waitForTimeout(300);
    s = await saved();
    assert.ok(s.milker.repairUntil - s.time > 55, 'free repair takes about 60 seconds');
    assert.equal(s.coins, 0);
    await fixture((s, G) => { s.coins = 40; s.milker.condition = 30; s.scene = 'ship'; });
    assert.match(await page.locator('#repair-label').textContent(), /Call Hard Hat Cat · 15/);

    // 3. Win, record the best, then see it on the welcome and Continue screens.
    const winRun = async visits => {
      await fixture(`(s, G) => { s.coins = G.GOAL - 5; s.bottles.base = 5; s.scene = 'market'; s.visits = ${visits}; }`);
      await page.locator('[data-action="stand"][data-value="sell"]').click();
      await page.locator('#dialog-content [data-action="sellAll"]').click();
      await page.waitForFunction(() => /CHAMPION|reached/i.test(document.querySelector('#dialog-content').textContent), null, { timeout: 5000 });
      return dialogText();
    };
    let text = await winRun(12);
    assert.match(text, /New best!/); assert.match(text, /first win/);
    await shot('win-first');
    text = await winRun(20);
    assert.match(text, /Your best/); assert.match(text, /12 visits/); assert.match(text, /So close/);
    text = await winRun(9);
    assert.match(text, /New best!/); assert.match(text, /beat your old best of 12 visits/);
    await shot('win-new-best');
    const best = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), BEST);
    assert.equal(best.visits, 9);

    await page.reload();
    assert.match(await dialogText(), /Your best.*9 visits/s, 'Continue screen shows the best');
    await shot('continue-best');
    await page.evaluate(k => localStorage.removeItem(k), KEY);
    await page.reload();
    assert.match(await page.locator('#welcome-best').textContent(), /Your best.*9 visits/);
    await shot('welcome-best');

    // 4. The field guide answers the new rule questions.
    await page.locator('[data-action="start"]').first().click();
    await page.locator('[data-action="menu"]').click();
    const guide = await dialogText();
    assert.match(guide, /farmers catch you/); assert.match(guide, /free, but takes 60s/); assert.match(guide, /Rule questions/);
    await shot('field-guide');

    assert.deepEqual(errors, [], 'no page errors');
    console.log(`Game Day browser checks passed: caught warning and BUSTED screen, cows home and milk lost, free 60s repair when broke, paid repair label, best on win/Continue/welcome screens, field guide rule questions.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
