/* Game rules and economy. Runs independently of the scene renderer (also loads in Node for tests).
   Every number comes from game_config.yaml: in the browser through game/config.js, in Node read directly. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const { loadConfig } = require('../scripts/config.js');
    const api = factory(loadConfig());
    api.withConfig = config => factory(config); // tests can run the rules with other settings
    module.exports = api;
  } else {
    if (!root.MOO_CONFIG) throw new Error('game/config.js is missing. Run `npm run config` to create it from game_config.yaml.');
    root.MooGame = factory(root.MOO_CONFIG);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const VERSION = 3;
  const OFFLINE_LIMIT = C.time.offline_hours * 60 * 60;
  const SCENES = ['farm', 'ship', 'market'];

  // Cows in upgrade order. Each cow gives one bottle of its milk.
  const TYPES = Object.keys(C.cows);
  const COWS = Object.fromEntries(TYPES.map(t => [t, { name: C.cows[t].name, milk: C.cows[t].milk, price: C.cows[t].milk_price }]));
  // Cow upgrades are linear: an item only works on one cow type.
  const ITEMS = Object.fromEntries(Object.entries(C.upgrade_items).map(([k, it]) => [k, { name: it.name, icon: it.icon, from: it.turns, to: it.into, cost: it.cost }]));
  const rounded = (u, n) => {
    let v = u.change === 'add' ? u.start + u.amount * n : u.start * u.amount ** n;
    if (u.round === 'whole') v = Math.round(v);
    else if (u.round === 'tenth') v = Math.round(v * 10) / 10;
    return u.min === undefined ? v : Math.max(u.min, v);
  };
  const SHIP = Object.fromEntries(Object.entries(C.ship_upgrades).map(([k, u]) => [k, {
    name: u.name, text: u.description, unit: u.unit.length > 1 ? ' ' + u.unit : u.unit,
    value: n => rounded(u, n), cost: u.cost, scale: u.cost_multiplier, max: u.max_level
  }]));
  const COW_PRICE = C.herd.new_cow_price;
  const HERD_MAX = C.herd.max_cows;
  const REST = C.herd.rest_seconds;
  const START_COWS = C.start.cows;
  const SUSPICION_LIMIT = C.suspicion.limit;
  const SUSPICION_DECAY = C.suspicion.cooldown_per_second;
  const NAMES = ['Daisy', 'Clover', 'Mochi', 'Buttercup', 'Waffles', 'Hazel', 'Poppy', 'Biscuit', 'Maple', 'Cocoa', 'Mabel', 'Oreo', 'Pudding', 'Juniper', 'Truffle', 'Peaches', 'Nutmeg', 'Toffee', 'Sprinkles', 'Marzipan'];

  const level = (s, key) => s.levels[key];
  const shipValue = (s, key) => SHIP[key].value(s.levels[key]);
  const milkTime = s => shipValue(s, 'milkTime');
  const cowCap = s => shipValue(s, 'cowCap');
  const bottleCap = s => shipValue(s, 'bottleCap');
  const stealth = s => shipValue(s, 'stealth');
  const beamSuspicion = s => Math.round(C.suspicion.per_beam / stealth(s) * 10) / 10;
  const upgradeCost = (s, key) => Math.round(SHIP[key].cost * SHIP[key].scale ** s.levels[key]);
  const bottleCount = s => TYPES.reduce((n, t) => n + s.bottles[t], 0);
  const herdSize = s => s.field.length + s.ship.length;
  const exhausted = c => Boolean(c.milked || c.upgraded);
  const resting = (s, c) => c.restUntil > s.time;
  const restLeft = (s, c) => Math.max(0, Math.ceil(c.restUntil - s.time));
  const milkValue = s => TYPES.reduce((n, t) => n + s.bottles[t] * COWS[t].price, 0);
  const findShipCow = (s, id) => s.ship.find(c => c.id === id);
  const itemFor = type => Object.keys(ITEMS).find(k => ITEMS[k].from === type) || null;

  function random(s) {
    s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
    return s.rng / 4294967296;
  }
  function makeCow(s, type = TYPES[0]) {
    const id = s.nextCow++;
    return { id, name: NAMES[id % NAMES.length], type, restUntil: 0, milked: false, upgraded: false };
  }
  function notify(s, text, kind = '', type = '') {
    s.notices.push({ id: ++s.noticeId, text, kind, type });
    s.notices = s.notices.slice(-8);
  }
  const zeroes = keys => Object.fromEntries(keys.map(k => [k, 0]));
  function createGame(seed = Date.now()) {
    const s = {
      version: VERSION, started: false, tutorial: 'off', scene: 'farm', time: 0, totalTime: 0, savedAt: Date.now(), rng: Number(seed) >>> 0,
      coins: C.start.coins, earned: 0, nextCow: 0, suspicion: 0,
      field: [], ship: [], pad: null, milking: null,
      bottles: zeroes(TYPES), sold: zeroes(TYPES), items: zeroes(Object.keys(ITEMS)), levels: zeroes(Object.keys(SHIP)),
      notices: [], noticeId: 0
    };
    for (let i = 0; i < START_COWS; i++) s.field.push(makeCow(s));
    return s;
  }

  function reason(s, action, value, extra) {
    if (action === 'start') return s.started ? 'Your operation is already running.' : '';
    if (!s.started) return 'Start your operation first.';
    if (action === 'travel') return SCENES.includes(value) ? '' : 'Unknown destination.';
    if (action === 'beam') {
      if (s.scene !== 'farm') return 'Fly over the field to beam up cows.';
      const c = s.field.find(c => c.id === value);
      if (!c) return 'There is no cow under your beam.';
      if (resting(s, c)) return `${c.name} is resting for ${restLeft(s, c)}s more. Let the poor thing nap.`;
      if (s.ship.length >= cowCap(s)) return `Your ship is full (${cowCap(s)} cows). Milk them and send them home, or upgrade capacity at the market.`;
      if (s.suspicion + beamSuspicion(s) > SUSPICION_LIMIT) return 'Earth is getting suspicious! Let things cool down, or upgrade your stealth.';
    } else if (['pad', 'unpad', 'milk', 'send', 'upgrade'].includes(action)) {
      if (s.scene !== 'ship') return 'Head to your ship first.';
      const id = action === 'unpad' || action === 'milk' ? s.pad : value;
      const c = findShipCow(s, id);
      if (!c) return action === 'milk' || action === 'unpad' ? 'Move a cow onto the milking pad first.' : 'That cow is not aboard your ship.';
      const busy = s.milking && s.milking.cowId === c.id;
      if (action === 'pad') {
        if (s.milking) return 'The milker is busy. Wait for it to lift off.';
        if (s.pad === c.id) return `${c.name} is already on the milking pad.`;
      } else if (action === 'unpad') {
        if (busy) return 'Wait for the milker to finish.';
      } else if (action === 'milk') {
        if (s.milking) return 'The milker is already working.';
        if (c.milked) return `${c.name} has already been milked this trip. Send it home to rest.`;
        if (bottleCount(s) >= bottleCap(s)) return `Milk storage is full (${bottleCap(s)} bottles). Sell some at the market.`;
      } else if (action === 'send') {
        if (busy) return 'Wait for the milker to finish.';
      } else if (action === 'upgrade') {
        const item = ITEMS[extra];
        if (!item || !Object.hasOwn(ITEMS, extra)) return 'Unknown upgrade item.';
        if (busy) return 'Wait for the milker to finish.';
        if (!s.items[extra]) return `You don't have a ${item.name.toLowerCase()}. Buy one at the cow stand.`;
        if (c.upgraded) return `${c.name} was already upgraded this trip.`;
        if (c.type !== item.from) return `A ${item.name.toLowerCase()} only works on a ${COWS[item.from].name.toLowerCase()}. ${c.name} is a ${COWS[c.type].name.toLowerCase()}.`;
      }
    } else if (['sell', 'sellAll', 'buyCow', 'buyItem', 'shipUpgrade'].includes(action)) {
      if (s.scene !== 'market') return 'Visit the marketplace first.';
      if (action === 'sell') {
        if (!TYPES.includes(value)) return 'Unknown milk.';
        const qty = extra === 'all' ? s.bottles[value] : extra;
        if (!Number.isInteger(qty) || qty < 1) return `You have no ${COWS[value].milk.toLowerCase()} to sell.`;
        if (s.bottles[value] < qty) return `You only have ${s.bottles[value]} ${COWS[value].milk.toLowerCase()}.`;
      } else if (action === 'sellAll') {
        if (!bottleCount(s)) return 'You have no milk to sell.';
      } else if (action === 'buyCow') {
        if (herdSize(s) >= HERD_MAX) return `Your herd is at the ${HERD_MAX}-cow limit.`;
        if (s.coins < COW_PRICE) return `A new cow costs ${COW_PRICE} coins.`;
      } else if (action === 'buyItem') {
        if (!Object.hasOwn(ITEMS, value)) return 'Unknown item.';
        if (s.coins < ITEMS[value].cost) return `A ${ITEMS[value].name.toLowerCase()} costs ${ITEMS[value].cost} coins.`;
      } else if (action === 'shipUpgrade') {
        if (!Object.hasOwn(SHIP, value)) return 'Unknown upgrade.';
        if (s.levels[value] >= SHIP[value].max) return 'This upgrade is maxed out.';
        if (s.coins < upgradeCost(s, value)) return `You need ${upgradeCost(s, value)} coins for this upgrade.`;
      }
    } else return 'Unknown action.';
    return '';
  }

  function act(s, action, value, extra) {
    const error = reason(s, action, value, extra);
    if (error) return { ok: false, message: error };
    let message = '', detail;
    if (action === 'start') { s.started = true; message = 'Welcome to Earth! Steer with the mouse or arrow keys. Click or press Space to beam.'; }
    else if (action === 'travel') {
      // The earliest cow aboard is ready to milk when entering an empty deck.
      if (value === 'ship' && s.scene !== 'ship' && s.pad === null && s.ship.length) s.pad = s.ship[0].id;
      s.scene = value;
    }
    else if (action === 'beam') {
      const c = s.field.splice(s.field.findIndex(c => c.id === value), 1)[0];
      c.milked = c.upgraded = false; c.restUntil = 0;
      s.ship.push(c);
      s.suspicion = Math.min(SUSPICION_LIMIT, s.suspicion + beamSuspicion(s));
      detail = c; message = `${c.name} is aboard!`;
    } else if (action === 'pad') {
      s.pad = value; detail = findShipCow(s, value);
      message = `${detail.name} steps onto the milking pad.`;
    } else if (action === 'unpad') {
      detail = findShipCow(s, s.pad); s.pad = null;
      message = `${detail.name} is back in ship storage.`;
    } else if (action === 'milk') {
      const c = findShipCow(s, s.pad);
      s.milking = { cowId: c.id, type: c.type, until: s.time + milkTime(s), duration: milkTime(s) };
      detail = c; message = `Milking ${c.name}…`;
    } else if (action === 'send') {
      const c = s.ship.splice(s.ship.findIndex(c => c.id === value), 1)[0];
      if (s.pad === c.id) s.pad = null;
      c.restUntil = exhausted(c) ? s.time + REST : 0;
      c.milked = c.upgraded = false;
      s.field.push(c); detail = c;
      message = c.restUntil ? `${c.name} is headed home to rest for ${REST}s.` : `${c.name} is headed back to the field.`;
    } else if (action === 'upgrade') {
      const c = findShipCow(s, value), item = ITEMS[extra];
      s.items[extra]--; c.type = item.to; c.upgraded = true; detail = c;
      message = `${c.name} is now a ${COWS[c.type].name.toLowerCase()}!`;
    } else if (action === 'sell' || action === 'sellAll') {
      const types = action === 'sell' ? [value] : TYPES.filter(t => s.bottles[t]);
      let count = 0, coins = 0; const sold = [];
      for (const t of types) {
        const qty = action === 'sell' ? (extra === 'all' ? s.bottles[t] : extra) : s.bottles[t];
        s.bottles[t] -= qty; s.sold[t] += qty; count += qty; coins += qty * COWS[t].price;
        for (let i = 0; i < qty; i++) sold.push(t);
      }
      s.coins += coins; s.earned += coins; detail = { count, coins, sold };
      message = `Sold ${count} bottle${count === 1 ? '' : 's'} for ${coins} coins.`;
    } else if (action === 'buyCow') {
      s.coins -= COW_PRICE; detail = makeCow(s); s.field.push(detail);
      message = `${detail.name} joins your herd in the field.`;
    } else if (action === 'buyItem') {
      s.coins -= ITEMS[value].cost; s.items[value]++;
      message = `Bought a ${ITEMS[value].name.toLowerCase()}. Use it on a cow aboard your ship.`;
    } else if (action === 'shipUpgrade') {
      s.coins -= upgradeCost(s, value); s.levels[value]++;
      message = `${SHIP[value].name} upgraded to ${shipValue(s, value)}${SHIP[value].unit}.`;
    }
    return { ok: true, message, detail };
  }

  function step(s, dt) {
    s.time += dt; s.totalTime += dt;
    s.suspicion = Math.max(0, s.suspicion - dt * SUSPICION_DECAY);
    if (s.milking && s.time >= s.milking.until - 1e-9) {
      const c = findShipCow(s, s.milking.cowId), t = s.milking.type;
      if (bottleCount(s) < bottleCap(s)) s.bottles[t]++;
      if (c) c.milked = true;
      s.milking = null;
      notify(s, `${c ? c.name : 'Your cow'} gave 1 ${COWS[t].milk.toLowerCase()}.`, 'bottle', t);
    }
  }
  function advance(s, seconds) {
    if (!s.started || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = Math.min(seconds, OFFLINE_LIMIT);
    while (remaining > 1e-9) {
      // Land exactly on the end of a milking so it finishes on time.
      let dt = Math.min(1, remaining);
      if (s.milking && s.milking.until > s.time) dt = Math.min(dt, s.milking.until - s.time);
      step(s, dt); remaining -= dt;
    }
  }
  function offline(s, now = Date.now()) {
    const seconds = Math.min(OFFLINE_LIMIT, Math.max(0, (now - s.savedAt) / 1000));
    advance(s, seconds); s.savedAt = now;
    return { seconds };
  }

  // Fit a save made under different game_config.yaml settings, so tweaking values doesn't wipe progress.
  function adapt(s) {
    // Add missing keys and drop removed ones; bad values stay so the checks below still reject corrupt saves.
    const fill = (obj, keys) => obj && typeof obj === 'object' ? Object.fromEntries(keys.map(k => [k, Object.hasOwn(obj, k) ? obj[k] : 0])) : obj;
    s.bottles = fill(s.bottles, TYPES); s.sold = fill(s.sold, TYPES);
    s.items = fill(s.items, Object.keys(ITEMS)); s.levels = fill(s.levels, Object.keys(SHIP));
    if (!s.levels || !s.bottles) return;
    for (const k of Object.keys(SHIP)) if (Number.isInteger(s.levels[k])) s.levels[k] = Math.min(s.levels[k], SHIP[k].max);
    s.suspicion = Math.min(s.suspicion, SUSPICION_LIMIT);
    if (!Array.isArray(s.field) || !Array.isArray(s.ship)) return;
    for (const c of [...s.field, ...s.ship]) if (c && !TYPES.includes(c.type)) c.type = TYPES[0];
    if (s.milking && !TYPES.includes(s.milking.type)) s.milking.type = TYPES[0];
    while (s.ship.length > cowCap(s)) {
      const i = s.ship.findLastIndex(c => !s.milking || !c || c.id !== s.milking.cowId);
      if (i < 0) break;
      const [c] = s.ship.splice(i, 1);
      if (c && s.pad === c.id) s.pad = null;
      if (c) { c.milked = c.upgraded = false; s.field.push(c); }
    }
    while (s.field.length + s.ship.length > HERD_MAX && s.field.length) s.field.pop();
    for (const t of [...TYPES].reverse()) while (bottleCount(s) > bottleCap(s) && s.bottles[t] > 0) s.bottles[t]--;
  }
  function restore(raw) {
    try {
      const s = JSON.parse(raw);
      if (!s || s.version !== VERSION || typeof s.started !== 'boolean' || !SCENES.includes(s.scene)) return null;
      // Older saves resume quietly; optional tutorial progress travels with backups.
      if (!['off', 'first-sale', 'markets', 'overview', 'done'].includes(s.tutorial)) s.tutorial = 'off';
      const number = (n, max = 1e15) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
      const counts = (obj, keys) => obj && typeof obj === 'object' && Object.keys(obj).length === keys.length && keys.every(k => Number.isInteger(obj[k]) && number(obj[k]));
      for (const key of ['time', 'totalTime', 'savedAt', 'rng', 'coins', 'earned', 'nextCow', 'suspicion', 'noticeId']) if (!number(s[key])) return null;
      if (![s.coins, s.earned, s.nextCow, s.rng, s.noticeId].every(Number.isInteger)) return null;
      adapt(s);
      if (!counts(s.bottles, TYPES) || !counts(s.sold, TYPES) || !counts(s.items, Object.keys(ITEMS)) || !counts(s.levels, Object.keys(SHIP))) return null;
      for (const [k, u] of Object.entries(SHIP)) if (s.levels[k] > u.max) return null;
      if (!Array.isArray(s.field) || !Array.isArray(s.ship) || s.field.length + s.ship.length > HERD_MAX || s.ship.length > cowCap(s)) return null;
      if (bottleCount(s) > bottleCap(s)) return null;
      const ids = new Set();
      for (const c of [...s.field, ...s.ship]) {
        if (!c || !Number.isInteger(c.id) || c.id < 0 || ids.has(c.id) || c.id >= s.nextCow || typeof c.name !== 'string' || c.name.length > 40 || !TYPES.includes(c.type) || !number(c.restUntil) || typeof c.milked !== 'boolean' || typeof c.upgraded !== 'boolean') return null;
        ids.add(c.id);
      }
      if (s.pad !== null && !s.ship.some(c => c.id === s.pad)) return null;
      if (s.milking !== null) {
        const m = s.milking;
        if (!m || m.cowId !== s.pad || !TYPES.includes(m.type) || !number(m.until) || !number(m.duration)) return null;
      }
      if (!Array.isArray(s.notices) || s.notices.length > 8 || s.notices.some(n => !n || !number(n.id) || typeof n.text !== 'string' || n.text.length > 300)) return null;
      return s;
    } catch { return null; }
  }

  return {
    VERSION, OFFLINE_LIMIT, SCENES, TYPES, COWS, ITEMS, SHIP, COW_PRICE, HERD_MAX, REST, SUSPICION_LIMIT, CONFIG: C,
    createGame, act, reason, advance, offline, restore,
    level, shipValue, milkTime, cowCap, bottleCap, stealth, beamSuspicion, upgradeCost,
    bottleCount, herdSize, exhausted, resting, restLeft, milkValue, itemFor
  };
});
