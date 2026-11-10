const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadConfig } = require('../scripts/config');
// These rule tests use the design-document values, so editing game_config.yaml never breaks them.
const G = require('../game/engine').withConfig(loadConfig(path.join(__dirname, 'fixtures/design-doc-config.yaml')));
function game(seed = 42) { const s = G.createGame(seed); G.act(s, 'start'); return s; }
function ok(s, ...args) { const r = G.act(s, ...args); assert.equal(r.ok, true, r.message); return r; }
function no(s, ...args) { const r = G.act(s, ...args); assert.equal(r.ok, false, `${args[0]} should be rejected`); return r; }
function beam(s, n = 1) {
  ok(s, 'travel', 'farm');
  for (let i = 0; i < n; i++) ok(s, 'beam', s.field.find(c => !G.resting(s, c)).id);
}
function milkPad(s) { ok(s, 'milk'); G.advance(s, G.milkTime(s)); }
function invariant(s) {
  assert.ok(Number.isInteger(s.coins) && s.coins >= 0);
  assert.ok(G.bottleCount(s) <= G.bottleCap(s));
  assert.ok(s.ship.length <= G.cowCap(s));
  assert.ok(G.herdSize(s) <= G.HERD_MAX);
  assert.ok(s.suspicion >= 0 && s.suspicion <= 100);
  const ids = [...s.field, ...s.ship].map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(G.restore(JSON.stringify(s)), 'state must survive a save round-trip');
}

test('a new game starts with base cows in the field and an empty ship', () => {
  const s = G.createGame(1);
  assert.equal(s.field.length, 5); assert.ok(s.field.every(c => c.type === 'base'));
  assert.equal(s.ship.length, 0); assert.equal(s.coins, 0);
  assert.equal(G.cowCap(s), 3); assert.equal(G.bottleCap(s), 5); assert.equal(G.milkTime(s), 15); assert.equal(G.stealth(s), 10);
  assert.equal(G.act(s, 'beam', s.field[0].id).ok, false, 'nothing happens before starting');
  invariant(s);
});

test('milk prices and the linear cow-upgrade chain match the design doc', () => {
  assert.deepEqual(G.TYPES.map(t => G.COWS[t].price), [5, 15, 30, 65, 150]);
  assert.equal(G.COWS.doughnut.milk, 'Coffee');
  const chain = Object.values(G.ITEMS).map(i => `${i.from}>${i.to}:${i.cost}`);
  assert.deepEqual(chain, ['base>chocolate:20', 'chocolate>strawberry:50', 'strawberry>doughnut:75', 'doughnut>almond:120']);
});

test('beamed cows leave the field, and the ship holds at most its capacity', () => {
  const s = game(), first = s.field[0].id;
  ok(s, 'beam', first);
  assert.ok(!s.field.some(c => c.id === first)); assert.ok(s.ship.some(c => c.id === first));
  beam(s, 2); assert.equal(s.ship.length, 3);
  assert.match(no(s, 'beam', s.field[0].id).message, /ship is full/);
  invariant(s);
});

test('entering the ship places the first abducted cow on an empty pad and preserves a chosen cow', () => {
  const s = game(); beam(s, 2);
  const [first, second] = s.ship;
  ok(s, 'travel', 'ship');
  assert.equal(s.pad, first.id);
  assert.equal(s.milking, null, 'milking still requires the player to press MILK');
  ok(s, 'pad', second.id);
  ok(s, 'travel', 'farm'); ok(s, 'travel', 'ship');
  assert.equal(s.pad, second.id, 'travel does not replace a selected cow');
  ok(s, 'milk'); ok(s, 'travel', 'market'); ok(s, 'travel', 'ship');
  assert.equal(s.pad, second.id);
  assert.equal(s.milking.cowId, second.id);
  G.advance(s, G.milkTime(s));
  ok(s, 'unpad'); ok(s, 'travel', 'ship');
  assert.equal(s.pad, null, 'clicking the current tab does not undo manual storage');
  ok(s, 'send', first.id); ok(s, 'send', second.id);
  ok(s, 'travel', 'farm'); ok(s, 'travel', 'ship');
  assert.equal(s.pad, null, 'an empty ship has no pad cow');
  invariant(s);
});

test('actions only work in the right scene and bad input changes nothing', () => {
  const s = game(), before = JSON.stringify(s);
  for (const args of [['travel', 'moon'], ['milk'], ['pad', 0], ['sellAll'], ['buyCow'], ['shipUpgrade', 'cowCap'], ['buyItem', '__proto__'], ['beam', 999]]) no(s, ...args);
  assert.equal(JSON.stringify(s), before);
});

test('one cow is milked at a time, takes the milking time and gives one bottle of its milk', () => {
  const s = game(); beam(s, 2); ok(s, 'travel', 'ship');
  const [a, b] = s.ship;
  assert.equal(s.pad, a.id); ok(s, 'milk');
  no(s, 'pad', b.id); no(s, 'milk'); no(s, 'send', a.id);
  G.advance(s, 14.5); assert.equal(s.bottles.base, 0);
  G.advance(s, 0.5); assert.equal(s.bottles.base, 1); assert.equal(s.milking, null);
  assert.equal(a.milked, true); assert.ok(G.exhausted(a));
  assert.match(no(s, 'milk').message, /already been milked/);
  ok(s, 'pad', b.id); assert.equal(s.pad, b.id, 'swapping puts the other cow back in storage');
  invariant(s);
});

test('milk storage capacity blocks milking until milk is sold', () => {
  const s = game(); beam(s); ok(s, 'travel', 'ship'); assert.equal(s.pad, s.ship[0].id);
  s.bottles.base = 5;
  assert.match(no(s, 'milk').message, /storage is full/);
  ok(s, 'travel', 'market'); ok(s, 'sell', 'base', 2);
  assert.equal(s.coins, 10); assert.equal(s.bottles.base, 3);
  ok(s, 'sellAll'); assert.equal(s.coins, 25); assert.equal(s.earned, 25);
  ok(s, 'travel', 'ship'); ok(s, 'milk');
});

test('exhausted cows rest in the field before they can be beamed again', () => {
  const s = game(); beam(s); ok(s, 'travel', 'ship');
  const c = s.ship[0]; assert.equal(s.pad, c.id); milkPad(s);
  ok(s, 'send', c.id);
  assert.equal(s.pad, null); assert.ok(s.field.includes(c)); assert.equal(c.milked, false);
  assert.ok(G.resting(s, c)); assert.equal(G.restLeft(s, c), G.REST);
  ok(s, 'travel', 'farm'); assert.match(no(s, 'beam', c.id).message, /resting/);
  G.advance(s, G.REST); ok(s, 'beam', c.id);
});

test('a fresh cow sent home does not need to rest', () => {
  const s = game(); beam(s); ok(s, 'travel', 'ship');
  const c = s.ship[0]; ok(s, 'send', c.id);
  assert.equal(G.resting(s, c), false);
});

test('cow upgrades are linear, use an item, and exhaust the cow once per trip', () => {
  const s = game(); beam(s); s.coins = 500;
  ok(s, 'travel', 'market'); ok(s, 'buyItem', 'chocolateBar'); ok(s, 'buyItem', 'strawberry');
  assert.equal(s.coins, 430); assert.equal(s.items.chocolateBar, 1);
  ok(s, 'travel', 'ship'); const c = s.ship[0];
  assert.match(no(s, 'upgrade', c.id, 'strawberry').message, /only works on a chocolate cow/);
  ok(s, 'upgrade', c.id, 'chocolateBar');
  assert.equal(c.type, 'chocolate'); assert.equal(s.items.chocolateBar, 0); assert.ok(G.exhausted(c));
  assert.match(no(s, 'upgrade', c.id, 'strawberry').message, /already upgraded/);
  // Milked and upgraded in the same trip: upgrading first gives the better milk.
  assert.equal(s.pad, c.id); milkPad(s); assert.equal(s.bottles.chocolate, 1);
  ok(s, 'send', c.id); G.advance(s, G.REST); ok(s, 'travel', 'farm'); ok(s, 'beam', c.id);
  ok(s, 'travel', 'ship'); ok(s, 'upgrade', c.id, 'strawberry'); assert.equal(c.type, 'strawberry');
  invariant(s);
});

test('a cow cannot be upgraded while it is being milked', () => {
  const s = game(); beam(s); s.items.chocolateBar = 1; ok(s, 'travel', 'ship');
  const c = s.ship[0]; assert.equal(s.pad, c.id); ok(s, 'milk');
  assert.match(no(s, 'upgrade', c.id, 'chocolateBar').message, /milker/);
  G.advance(s, 15); assert.equal(s.bottles.base, 1, 'milk type is fixed when milking starts');
});

test('ship upgrades follow the starting values, increments and cost multipliers', () => {
  const s = game(); s.coins = 100000; ok(s, 'travel', 'market');
  const costs = key => { const out = []; while (s.levels[key] < G.SHIP[key].max) { out.push(G.upgradeCost(s, key)); ok(s, 'shipUpgrade', key); } return out; };
  assert.deepEqual(costs('milkTime'), [5, 7, 8, 11]); assert.equal(G.milkTime(s), 3);
  assert.deepEqual(costs('cowCap').slice(0, 3), [20, 30, 45]); assert.equal(G.cowCap(s), 10);
  assert.deepEqual(costs('bottleCap').slice(0, 3), [10, 13, 17]);
  assert.deepEqual(Array.from({ length: 5 }, (_, n) => G.SHIP.bottleCap.value(n)), [5, 8, 11, 17, 25]);
  assert.deepEqual(costs('stealth').slice(0, 3), [20, 36, 65]);
  assert.deepEqual([0, 1, 2].map(n => G.SHIP.stealth.value(n)), [10, 15, 22.5]);
  assert.match(no(s, 'shipUpgrade', 'milkTime').message, /maxed/);
  invariant(s);
});

test('stealth lowers the suspicion each beam adds, and suspicion cools over time', () => {
  const s = game(); s.levels.cowCap = 7;
  beam(s, 4); assert.equal(s.suspicion, 100);
  assert.match(no(s, 'beam', s.field[0].id).message, /suspicious/);
  G.advance(s, 20); ok(s, 'beam', s.field[0].id);
  const t = game(); t.levels.stealth = 2; beam(t); assert.ok(t.suspicion < 12);
});

test('cows can be bought up to the 20-cow herd limit', () => {
  const s = game(); s.coins = 1000; ok(s, 'travel', 'market');
  ok(s, 'buyCow'); assert.equal(s.coins, 1000 - G.COW_PRICE); assert.equal(s.field.length, 6);
  while (G.herdSize(s) < G.HERD_MAX) ok(s, 'buyCow');
  assert.match(no(s, 'buyCow').message, /limit/);
  invariant(s);
});

test('a full loop from nothing earns enough to buy the first upgrades', () => {
  const s = game();
  for (let trip = 0; trip < 3; trip++) {
    G.advance(s, G.REST); beam(s, 3); ok(s, 'travel', 'ship');
    for (const c of [...s.ship]) { if (s.pad !== c.id) ok(s, 'pad', c.id); milkPad(s); ok(s, 'send', c.id); }
    ok(s, 'travel', 'market'); ok(s, 'sellAll');
  }
  assert.equal(s.coins, 45); assert.equal(s.sold.base, 9);
  ok(s, 'buyItem', 'chocolateBar'); ok(s, 'shipUpgrade', 'milkTime'); invariant(s);
});

test('time keeps running in other scenes and offline time is capped', () => {
  const s = game(); beam(s); ok(s, 'travel', 'ship'); assert.equal(s.pad, s.ship[0].id); ok(s, 'milk');
  ok(s, 'travel', 'market'); s.savedAt = 1000;
  const r = G.offline(s, 1000 + 20000); assert.equal(r.seconds, 20); assert.equal(s.bottles.base, 1);
  assert.equal(G.offline(s, 1e13).seconds, G.OFFLINE_LIMIT);
});

test('saves round-trip; corrupt and old-version saves are rejected', () => {
  const s = game(); beam(s); ok(s, 'travel', 'ship'); assert.equal(s.pad, s.ship[0].id); ok(s, 'milk');
  assert.deepEqual(G.restore(JSON.stringify(s)), s);
  const bad = [null, '{}', '{', { version: 2 }, { coins: -1 }, { scene: 'moon' }, { ship: [null] }, { pad: 999 }, { bottles: { base: -1, chocolate: 0, strawberry: 0, doughnut: 0, almond: 0 } }];
  for (const b of bad) assert.equal(G.restore(typeof b === 'object' && b ? JSON.stringify({ ...s, ...b }) : b), null);
});

test('tutorial progress survives backups and older saves resume without a tutorial', () => {
  const s = game();
  for (const tutorial of ['off', 'first-sale', 'markets', 'overview', 'done']) {
    s.tutorial = tutorial;
    assert.equal(G.restore(JSON.stringify(s)).tutorial, tutorial);
  }
  delete s.tutorial;
  assert.equal(G.restore(JSON.stringify(s)).tutorial, 'off');
  s.tutorial = { unexpected: true };
  assert.equal(G.restore(JSON.stringify(s)).tutorial, 'off');
});

test('50 random sessions keep every stock within its limits', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = game(seed); s.coins = 300;
    let r = seed;
    const pick = arr => arr[(r = (r * 1103515245 + 12345) % 2147483648) % arr.length];
    for (let i = 0; i < 300; i++) {
      const scene = pick(G.SCENES); G.act(s, 'travel', scene);
      const cowId = pick([...s.field, ...s.ship, { id: -1 }]).id;
      const choice = pick(['beam', 'pad', 'milk', 'send', 'upgrade', 'sell', 'sellAll', 'buyCow', 'buyItem', 'shipUpgrade', 'unpad']);
      const value = { sell: pick(G.TYPES), buyItem: pick(Object.keys(G.ITEMS)), shipUpgrade: pick(Object.keys(G.SHIP)) }[choice] ?? cowId;
      const extra = choice === 'upgrade' ? pick(Object.keys(G.ITEMS)) : choice === 'sell' ? 'all' : undefined;
      G.act(s, choice, value, extra); G.advance(s, pick([0.5, 2, 9, 31]));
    }
    invariant(s);
  }
});
