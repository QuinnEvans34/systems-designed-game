// Play-test changes (Nov 23): visits are counted, 5,000 coins wins, and the milker wears out.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadConfig } = require('../scripts/config');
const base = loadConfig(path.join(__dirname, 'fixtures/design-doc-config.yaml'));
// Rules with chosen milker settings, so each test controls the randomness.
const rules = milker => require('../game/engine').withConfig({ ...base, milker: { ...base.milker, ...milker } });
const SAFE = { break_chance: 0, worn_break_chance: 0 };

function setup(G, seed = 7) {
  const s = G.createGame(seed); G.act(s, 'start');
  const ok = (...args) => { const r = G.act(s, ...args); assert.equal(r.ok, true, r.message); return r; };
  const no = (...args) => { const r = G.act(s, ...args); assert.equal(r.ok, false, `${args[0]} should be rejected`); return r; };
  const toShip = () => { ok('travel', 'farm'); ok('beam', s.field.find(c => !G.resting(s, c)).id); ok('travel', 'ship'); };
  return { s, ok, no, toShip };
}

test('a visit is counted each time you leave the market for the field', () => {
  const G = rules(SAFE); const { s, ok } = setup(G);
  assert.equal(s.visits, 1);
  ok('travel', 'ship'); ok('travel', 'market'); assert.equal(s.visits, 1);
  ok('travel', 'farm'); assert.equal(s.visits, 2);
  ok('travel', 'ship'); ok('travel', 'farm'); assert.equal(s.visits, 2, 'only leaving the market starts a new visit');
});

test('reaching the coin goal wins once and records the visit count', () => {
  const G = rules(SAFE); const { s, ok } = setup(G);
  assert.equal(G.GOAL, 5000);
  s.coins = G.GOAL - 5; s.bottles.base = 1; s.visits = 4;
  ok('travel', 'market'); ok('sellAll');
  assert.equal(s.won, true); assert.equal(s.wonVisits, 4);
  assert.equal(s.notices.at(-1).kind, 'win');
  s.bottles.base = 1; ok('sellAll');
  assert.equal(s.notices.filter(n => n.kind === 'win').length, 1, 'the win only fires once');
});

test('each milking wears the milker, and a worn milker milks slower', () => {
  const G = rules({ ...SAFE, wear_per_milking: 30 }); const { s, ok, toShip } = setup(G);
  const fresh = G.milkTime(s);
  for (let i = 0; i < 2; i++) { toShip(); ok('milk'); G.advance(s, G.milkTime(s)); ok('send', s.ship[0].id); G.advance(s, G.REST); }
  assert.equal(s.milker.condition, 40);
  assert.equal(G.worn(s), true);
  assert.equal(G.milkTime(s), fresh * G.MILKER.slow_multiplier);
});

test('a broken milker refuses to milk until the Hard Hat Cat repairs it', () => {
  const G = rules({ break_chance: 1 }); const { s, ok, no, toShip } = setup(G);
  s.coins = 100; toShip();
  const r = ok('milk');
  assert.equal(s.milker.broken, true); assert.equal(s.milking, null); assert.match(r.message, /broke/);
  assert.match(no('milk').message, /broken/);
  ok('repair'); assert.equal(s.coins, 100 - G.MILKER.repair_cost);
  assert.match(no('milk').message, /fixing/); assert.match(no('repair').message, /already/);
  G.advance(s, G.MILKER.repair_seconds);
  assert.deepEqual(s.milker, { condition: 100, broken: false, repairUntil: 0 });
  assert.equal(s.notices.at(-1).kind, 'repair');
});

test('breakdowns get more likely as the milker wears, and always happen at zero', () => {
  const G = rules({ break_chance: 0.05, worn_break_chance: 0.2 }); const { s } = setup(G);
  assert.equal(G.breakChance(s), 0.05);
  s.milker.condition = 40; assert.equal(G.breakChance(s), 0.2);
  s.milker.condition = 0; assert.equal(G.breakChance(s), 1);
});

test('preventive repairs are allowed, but not on a perfect milker or without coins', () => {
  const G = rules(SAFE); const { s, ok, no } = setup(G);
  ok('travel', 'ship');
  assert.match(no('repair').message, /top shape/);
  s.milker.condition = 70; s.coins = 0; assert.match(no('repair').message, /charges/);
  s.coins = 15; ok('repair'); assert.equal(s.coins, 0);
});

test('breakdowns follow the seeded random numbers, so a save replays the same way', () => {
  const G = rules({ break_chance: 0.5 });
  const results = seed => { const { s, ok, toShip } = setup(G, seed); s.coins = 1000; const out = [];
    for (let i = 0; i < 6; i++) { toShip(); ok('milk'); out.push(s.milker.broken); if (s.milker.broken) { ok('repair'); G.advance(s, G.MILKER.repair_seconds); } else G.advance(s, G.milkTime(s)); ok('send', s.ship[0].id); G.advance(s, G.REST); }
    return out; };
  assert.deepEqual(results(11), results(11));
  assert.ok(results(11).some(Boolean) && results(11).some(b => !b), 'a 50% chance should give a mix');
});

test('saves from before these changes load with a counter and a fresh milker', () => {
  const G = rules(SAFE); const { s } = setup(G);
  const old = JSON.parse(JSON.stringify(s));
  delete old.visits; delete old.won; delete old.wonVisits; delete old.wonTime; delete old.milker;
  const r = G.restore(JSON.stringify(old));
  assert.ok(r);
  assert.equal(r.visits, 1); assert.equal(r.won, false);
  assert.deepEqual(r.milker, { condition: 100, broken: false, repairUntil: 0 });
  for (const bad of [{ visits: 0 }, { visits: 1.5 }, { milker: { condition: 120, broken: false, repairUntil: 0 } }, { milker: { condition: 50, broken: 'yes', repairUntil: 0 } }, { won: 'no' }]) {
    assert.equal(G.restore(JSON.stringify({ ...s, ...bad })), null, JSON.stringify(bad));
  }
});
