const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseYaml, validate, loadConfig, buildConfig, ConfigError } = require('../scripts/config');
const engine = require('../game/engine');
const fixture = path.join(__dirname, 'fixtures/design-doc-config.yaml');
const designDoc = () => JSON.parse(JSON.stringify(loadConfig(fixture)));
const problem = (yaml, pattern) => assert.throws(() => validate(parseYaml(yaml)), e => e instanceof ConfigError && pattern.test(e.message), `expected ${pattern}`);

test('the game_config.yaml you edit is valid and playable', () => {
  const G = engine.withConfig(loadConfig());
  for (let seed = 1; seed <= 30; seed++) {
    const s = G.createGame(seed); G.act(s, 'start'); s.coins = 500;
    let r = seed; const pick = a => a[(r = (r * 1103515245 + 12345) % 2147483648) % a.length];
    for (let i = 0; i < 200; i++) {
      G.act(s, 'travel', pick(G.SCENES));
      const id = pick([...s.field, ...s.ship, { id: -1 }]).id;
      const action = pick(['beam', 'pad', 'milk', 'send', 'upgrade', 'sellAll', 'buyCow', 'buyItem', 'shipUpgrade']);
      const value = { buyItem: pick(Object.keys(G.ITEMS)), shipUpgrade: pick(Object.keys(G.SHIP)) }[action] ?? id;
      G.act(s, action, value, action === 'upgrade' ? pick(Object.keys(G.ITEMS)) : undefined);
      G.advance(s, pick([1, 5, 40]));
    }
    assert.ok(G.bottleCount(s) <= G.bottleCap(s) && s.ship.length <= G.cowCap(s) && G.herdSize(s) <= G.HERD_MAX);
    assert.ok(G.restore(JSON.stringify(s)), 'saves made with your settings load back');
  }
});

test('the design-doc copy matches the shipped settings it was made from', () => {
  // Only checks shape, so tuning numbers in game_config.yaml is fine.
  const mine = loadConfig(), doc = designDoc();
  assert.deepEqual(Object.keys(mine.ship_upgrades), Object.keys(doc.ship_upgrades));
});

test('the reader understands comments, quotes, emoji, negatives and nesting', () => {
  const c = parseYaml('# top\nstart:\n  coins: 12   # trailing\n  name: "Hash # kept"\n  icon: "🍫"\n  plain: Base cow\n  neg: -3\n  dec: 1.5\n  quote: \'it\'\'s\'\nempty:\n');
  assert.deepEqual(c, { start: { coins: 12, name: 'Hash # kept', icon: '🍫', plain: 'Base cow', neg: -3, dec: 1.5, quote: "it's" }, empty: {} });
});

test('mistakes are reported with the line or setting that caused them', () => {
  assert.throws(() => parseYaml('start:\n\tcoins: 1'), /line 2: use spaces/);
  assert.throws(() => parseYaml('start:\n  coins: 1\n   cows: 2'), /line 3: .*line up/);
  assert.throws(() => parseYaml('start:\n  coins 1'), /line 2: expected "name: value"/);
  assert.throws(() => parseYaml('a: 1\na: 2'), /appears twice/);
  const yaml = fs.readFileSync(fixture, 'utf8');
  problem(yaml.replace('milk_price: 5 ', 'milk_prise: 5 '), /cows\.base\.milk_prise: unknown setting/);
  problem(yaml.replace('turns: base', 'turns: banana'), /"banana" isn't one of the cows/);
  problem(yaml.replace('milk_price: 15', 'milk_price: lots'), /cows\.chocolate\.milk_price: should be a number/);
  problem(yaml.replace('max_level: 4', 'max_level: 9').replace('    min: 1\n', ''), /milking time reaches/);
  problem(yaml.replace('  coins: 0 ', '  coins: 2.5 '), /start\.coins: should be a whole number/);
});

test('edited values change the game', () => {
  const c = designDoc();
  c.cows.base.milk_price = 7; c.start.coins = 40; c.start.cows = 2;
  c.ship_upgrades.cowCap.start = 1; c.herd.rest_seconds = 5;
  const G = engine.withConfig(c), s = G.createGame(1); G.act(s, 'start');
  assert.equal(s.coins, 40); assert.equal(s.field.length, 2); assert.equal(G.cowCap(s), 1);
  G.act(s, 'beam', s.field[0].id); assert.equal(G.act(s, 'beam', s.field[0].id).ok, false, 'ship holds 1');
  s.bottles.base = 3; G.act(s, 'travel', 'market'); G.act(s, 'sellAll'); assert.equal(s.coins, 61);
  assert.equal(G.REST, 5);
});

test('saves survive changing the settings', () => {
  const before = engine.withConfig(designDoc()), s = before.createGame(3); before.act(s, 'start');
  s.levels.cowCap = 5; s.levels.bottleCap = 3; s.items.latteCup = 2; s.bottles.almond = 9;
  for (let i = 0; i < 5; i++) before.act(s, 'beam', s.field[0].id), s.suspicion = 0;
  const c = designDoc();
  c.ship_upgrades.cowCap.max_level = 1; c.ship_upgrades.bottleCap.max_level = 0; delete c.upgrade_items.latteCup;
  const G = engine.withConfig(c), restored = G.restore(JSON.stringify(s));
  assert.ok(restored, 'progress is kept');
  assert.equal(restored.levels.cowCap, 1); assert.equal(restored.ship.length, 4);
  assert.equal(G.bottleCount(restored), 5); assert.equal('latteCup' in restored.items, false);
  assert.equal(G.herdSize(restored), 5);
});

test('a broken file keeps the last good game/config.js and records the mistake', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-config-'));
  const yaml = path.join(dir, 'game_config.yaml'), out = path.join(dir, 'config.js');
  fs.copyFileSync(fixture, yaml);
  assert.equal(buildConfig(yaml, out).ok, true);
  assert.match(fs.readFileSync(out, 'utf8'), /window\.MOO_CONFIG = /);
  fs.writeFileSync(yaml, fs.readFileSync(fixture, 'utf8').replace('cost: 20 ', 'cost: free '));
  const bad = buildConfig(yaml, out);
  assert.equal(bad.ok, false);
  const js = fs.readFileSync(out, 'utf8');
  assert.match(js, /"new_cow_price": 15/); assert.match(js, /MOO_CONFIG_ERROR = .*should be a number/);
  fs.copyFileSync(fixture, yaml); buildConfig(yaml, out);
  assert.doesNotMatch(fs.readFileSync(out, 'utf8'), /MOO_CONFIG_ERROR/);
  fs.rmSync(dir, { recursive: true, force: true });
});
