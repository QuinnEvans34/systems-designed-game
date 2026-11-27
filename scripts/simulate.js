#!/usr/bin/env node
// Balance simulation: plays Moo-ving Violations automatically with a few strategies
// and reports how long each takes to reach the coin goal.
//
//   npm run simulate              (20 games per strategy)
//   npm run simulate -- 50        (50 games per strategy)
//
// It uses the real game rules (game/engine.js) and the real settings (game_config.yaml),
// so change a number in the settings file and run this again to see what it does.
// Time counts game time plus a few seconds per click, roughly how long a person takes.
'use strict';
const path = require('node:path');
const { loadConfig } = require('./config.js');
// Try a number without editing the settings file:  npm run simulate -- 20 goal.coins=2000 start.cows=3
const args = process.argv.slice(2);
const config = loadConfig(path.join(__dirname, '..', 'game_config.yaml'));
for (const a of args.filter(a => a.includes('='))) {
  const [key, raw] = a.split('='); const parts = key.split('.'); let o = config;
  for (const p of parts.slice(0, -1)) { if (!o[p]) throw new Error(`No setting called ${key}`); o = o[p]; }
  if (!(parts.at(-1) in o)) throw new Error(`No setting called ${key}`);
  o[parts.at(-1)] = isNaN(Number(raw)) ? raw : Number(raw);
}
const G = require('../game/engine.js').withConfig(config);
const GAMES = Number(args.find(a => !a.includes('='))) || 20;
const CLICK = 2;      // seconds a person spends per click (travel, pad, send, buy)
const BEAM = 3;       // seconds to line up and beam a cow
const MAX_VISITS = 300;

// Each strategy decides what to buy at the market and how careful to be.
const STRATEGIES = {
  'Flavor first': { careful: true, repairEarly: true, order: ['treats', 'milkTime', 'cowCap', 'bottleCap', 'cows', 'stealth'] },
  'Ship first': { careful: true, repairEarly: true, order: ['milkTime', 'cowCap', 'bottleCap', 'treats', 'cows', 'stealth'] },
  'Big herd': { careful: true, repairEarly: true, order: ['cows', 'cowCap', 'bottleCap', 'treats', 'milkTime', 'stealth'] },
  'Stealthy': { careful: true, repairEarly: true, order: ['stealth', 'cowCap', 'treats', 'milkTime', 'bottleCap', 'cows'] },
  'Careless': { careful: false, repairEarly: false, order: ['treats', 'milkTime', 'cowCap', 'bottleCap', 'cows', 'stealth'] }
};

function play(strategy, seed) {
  const s = G.createGame(seed); G.act(s, 'start');
  const stats = { breakdowns: 0, repairs: 0, repairCoins: 0, caught: 0, beams: 0, bottles: 0 };
  const act = (...a) => G.act(s, ...a);
  const wait = secs => G.advance(s, secs);

  while (!s.won && s.visits <= MAX_VISITS) {
    // ---- Field: beam cows until the ship is full or (if careful) suspicion is too high.
    if (s.scene !== 'farm') { act('travel', 'farm'); wait(CLICK); }
    for (let tries = 0; tries < 40 && s.ship.length < G.cowCap(s); tries++) {
      const cow = s.field.find(c => !G.resting(s, c));
      if (!cow) { if (s.ship.length) break; wait(5); continue; }       // everyone is resting: wait a bit
      if (strategy.careful && G.overLimit(s)) { if (s.ship.length) break; wait(5); continue; }
      const r = act('beam', cow.id); wait(BEAM); stats.beams++;
      if (r.detail && r.detail.caught) { stats.caught++; break; }
    }
    // ---- Ship: upgrade, milk and send home every cow aboard.
    if (s.ship.length) {
      act('travel', 'ship'); wait(CLICK);
      for (const c of [...s.ship]) {
        if (s.pad !== c.id) { act('pad', c.id); wait(CLICK); }
        const item = G.itemFor(c.type);
        if (item && s.items[item] > 0 && act('upgrade', c.id, item).ok) wait(CLICK);
        // Always fix a broken milker (free but slow when short on coins). Careful players also fix a worn one early if they can pay.
        const early = strategy.repairEarly && G.worn(s) && s.coins >= G.MILKER.repair_cost;
        if (s.milker.broken || early) {
          const price = G.repairPrice(s), secs = G.repairSeconds(s);
          if (act('repair').ok) { stats.repairs++; stats.repairCoins += price; wait(secs); }
        }
        if (G.bottleCount(s) < G.bottleCap(s) && !s.milker.broken) {
          const r = act('milk'); wait(CLICK);
          if (r.detail && r.detail.broke) stats.breakdowns++;
          else if (r.ok) { wait(G.milkTime(s)); stats.bottles++; }
        }
        act('send', c.id); wait(CLICK);
      }
    }
    // ---- Market: sell everything, then shop in the strategy's order. Keep enough for one repair.
    act('travel', 'market'); wait(CLICK);
    if (G.bottleCount(s)) { act('sellAll'); wait(CLICK); }
    if (s.won) break;
    shop(s, strategy, act, wait);
  }
  return { won: s.won, visits: s.won ? s.wonVisits : s.visits, minutes: s.totalTime / 60, ...stats };
}

function shop(s, strategy, act, wait) {
  const reserve = G.MILKER.repair_cost;
  for (let bought = true, n = 0; bought && n < 40; n++) {
    bought = false;
    for (const want of strategy.order) {
      const budget = s.coins - reserve;
      if (want === 'cows') {
        if (G.herdSize(s) < G.HERD_MAX && budget >= G.COW_PRICE && act('buyCow').ok) { wait(CLICK); bought = true; break; }
      } else if (want === 'treats') {
        // Buy the treat that adds the most milk value per coin for a cow we own and haven't got a treat for yet.
        const herd = [...s.field, ...s.ship];
        let best = null;
        for (const [key, item] of Object.entries(G.ITEMS)) {
          const owned = herd.filter(c => c.type === item.from).length;
          if (!owned || s.items[key] >= owned || item.cost > budget) continue;
          const gain = (G.COWS[item.to].price - G.COWS[item.from].price) / item.cost;
          if (!best || gain > best.gain) best = { key, gain };
        }
        if (best && act('buyItem', best.key).ok) { wait(CLICK); bought = true; break; }
      } else if (s.levels[want] < G.SHIP[want].max && budget >= G.upgradeCost(s, want) && act('shipUpgrade', want).ok) {
        wait(CLICK); bought = true; break;
      }
    }
  }
}

const median = xs => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`Moo-ving Violations balance check · goal ${G.GOAL.toLocaleString()} coins · ${GAMES} games per strategy`);
if (args.some(a => a.includes('='))) console.log(`Trying: ${args.filter(a => a.includes('=')).join(', ')}`);
console.log(`Suspicion when full: ${G.CAUGHT ? 'caught' : 'block'} · milker wear ${G.MILKER.wear_per_milking}% · breakdowns ${G.MILKER.break_chance * 100}%/${G.MILKER.worn_break_chance * 100}% · repair ${G.MILKER.repair_cost} coins\n`);
const rows = [];
if (require.main === module) for (const [name, strategy] of Object.entries(STRATEGIES)) {
  const runs = Array.from({ length: GAMES }, (_, i) => play(strategy, 1000 + i));
  const wins = runs.filter(r => r.won);
  rows.push({
    Strategy: name,
    'Won': `${wins.length}/${GAMES}`,
    'Visits (median)': wins.length ? median(wins.map(r => r.visits)) : '-',
    'Minutes (median)': wins.length ? median(wins.map(r => r.minutes)).toFixed(1) : '-',
    'Breakdowns': avg(runs.map(r => r.breakdowns)).toFixed(1),
    'Repairs': avg(runs.map(r => r.repairs)).toFixed(1),
    'Repair coins': Math.round(avg(runs.map(r => r.repairCoins))),
    'Caught': avg(runs.map(r => r.caught)).toFixed(1)
  });
}
if (require.main === module) console.table(rows);
module.exports = { play, STRATEGIES };
