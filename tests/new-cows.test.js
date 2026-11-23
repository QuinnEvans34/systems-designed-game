const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const G = require('../game/engine');
const { loadConfig } = require('../scripts/config');

function act(s, ...args) {
  const result = G.act(s, ...args);
  assert.equal(result.ok, true, result.message);
  return result;
}

test('the tiers after almond earn back their treats within three bottles of added income', () => {
  assert.deepEqual(G.TYPES.slice(-3), ['almond', 'eggnog', 'skeleton']);
  for (const type of ['almond', 'eggnog']) {
    const item = G.ITEMS[G.itemFor(type)];
    const addedIncome = G.COWS[item.to].price - G.COWS[type].price;
    assert.ok(addedIncome > 0, 'each tier improves milk value');
    assert.ok(item.cost > addedIncome && item.cost <= 3 * addedIncome, 'a permanent upgrade pays back over a few trips');
  }
  assert.equal(G.itemFor('skeleton'), null);
  assert.equal(G.COWS.eggnog.milk, 'Eggnog');
  assert.equal(G.COWS.skeleton.milk, 'Skim milk');
});

test('buy treats, upgrade almond through skeleton over separate trips, milk and sell both products', () => {
  const s = G.createGame(42);
  act(s, 'start');
  const cow = s.field[0];
  cow.type = 'almond';
  const festive = G.itemFor('almond'), bone = G.itemFor('eggnog');
  const budget = G.ITEMS[festive].cost + G.ITEMS[bone].cost;
  act(s, 'travel', 'market');
  s.coins = G.ITEMS[festive].cost - 1;
  assert.equal(G.act(s, 'buyItem', festive).ok, false);
  assert.equal(s.items[festive], 0);
  s.coins = budget;
  act(s, 'buyItem', festive);
  act(s, 'buyItem', bone);
  assert.equal(s.coins, 0);
  act(s, 'travel', 'farm');
  act(s, 'beam', cow.id);
  act(s, 'travel', 'ship');
  assert.equal(G.act(s, 'upgrade', cow.id, bone).ok, false, 'cannot skip eggnog');
  assert.equal(s.items[bone], 1, 'wrong treat stays in inventory');
  act(s, 'upgrade', cow.id, festive);
  assert.equal(cow.type, 'eggnog');
  assert.equal(s.items[festive], 0);
  assert.equal(G.act(s, 'upgrade', cow.id, bone).ok, false, 'one upgrade per trip');
  act(s, 'milk');
  assert.equal(G.act(s, 'upgrade', cow.id, bone).ok, false, 'cannot upgrade during milking');
  G.advance(s, G.milkTime(s));
  assert.equal(s.bottles.eggnog, 1);
  act(s, 'send', cow.id);
  act(s, 'travel', 'farm');
  assert.equal(G.act(s, 'beam', cow.id).ok, false, 'upgraded cow still needs rest');
  G.advance(s, G.REST);
  act(s, 'beam', cow.id);
  act(s, 'travel', 'ship');
  act(s, 'upgrade', cow.id, bone);
  assert.equal(cow.type, 'skeleton');
  assert.equal(s.items[bone], 0);
  act(s, 'milk');
  G.advance(s, G.milkTime(s));
  assert.equal(s.bottles.skeleton, 1);
  const restored = G.restore(JSON.stringify(s));
  assert.ok(restored);
  assert.equal(restored.ship[0].type, 'skeleton');
  assert.equal(restored.bottles.eggnog, 1);
  assert.equal(restored.bottles.skeleton, 1);
  act(s, 'travel', 'market');
  act(s, 'sell', 'eggnog', 1);
  assert.equal(s.coins, G.COWS.eggnog.price);
  assert.equal(s.sold.eggnog, 1);
  act(s, 'sellAll');
  assert.equal(s.coins, G.COWS.eggnog.price + G.COWS.skeleton.price);
  assert.equal(s.earned, s.coins);
  assert.equal(s.sold.skeleton, 1);
  assert.equal(G.bottleCount(s), 0);
});

test('existing five-tier saves gain empty bottles and treats without losing progress', () => {
  const old = G.withConfig(loadConfig(path.join(__dirname, 'fixtures/design-doc-config.yaml')));
  const s = old.createGame(8);
  old.act(s, 'start');
  s.field[0].type = 'almond';
  s.bottles.almond = 2;
  s.sold.chocolate = 4;
  s.items.almond = 3;
  s.coins = 137;
  const restored = G.restore(JSON.stringify(s));
  assert.ok(restored);
  assert.equal(restored.field[0].type, 'almond');
  assert.equal(restored.bottles.almond, 2);
  assert.equal(restored.sold.chocolate, 4);
  assert.equal(restored.items.almond, 3);
  assert.equal(restored.coins, 137);
  for (const type of ['eggnog', 'skeleton']) {
    assert.equal(restored.bottles[type], 0);
    assert.equal(restored.sold[type], 0);
  }
  assert.equal(restored.items.festiveSpice, 0);
  assert.equal(restored.items.boneBiscuit, 0);
});
