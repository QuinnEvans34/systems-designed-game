/* Reads game_config.yaml, checks it, and writes game/config.js for the browser.
   Run: npm run config   (npm start does this automatically and re-runs it when the file changes). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'game_config.yaml');
const OUTPUT_PATH = path.join(ROOT, 'game', 'config.js');
const ART = ['base', 'chocolate', 'strawberry', 'doughnut', 'almond']; // cow sprites that exist in assets/
const SHIP_KEYS = ['milkTime', 'cowCap', 'bottleCap', 'stealth'];

class ConfigError extends Error {}

/* ---------- a small YAML reader: nested "key: value" maps, comments and quoted strings ---------- */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote && line[i - 1] !== '\\') quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function scalar(text, where) {
  const v = text.trim();
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) throw new ConfigError(`${where}: this text is missing its closing ".`);
    try { return JSON.parse(v); } catch { throw new ConfigError(`${where}: couldn't read the quoted text ${v}.`); }
  }
  if (v.startsWith("'")) {
    if (!v.endsWith("'") || v.length < 2) throw new ConfigError(`${where}: this text is missing its closing '.`);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (/^(true|yes)$/i.test(v)) return true;
  if (/^(false|no)$/i.test(v)) return false;
  if (/^(null|~)$/i.test(v)) return null;
  if (/^[-+]?(\d[\d_]*\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return Number(v.replace(/_/g, ''));
  return v;
}
function parseYaml(text, file = 'game_config.yaml') {
  const root = {}, stack = [{ indent: -1, obj: root, childIndent: undefined }];
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const where = `${file} line ${i + 1}`;
    const line = stripComment(raw);
    if (!line.trim()) return;
    const lead = line.match(/^[ \t]*/)[0];
    if (lead.includes('\t')) throw new ConfigError(`${where}: use spaces to indent, not tabs.`);
    const indent = lead.length;
    const m = line.trim().match(/^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/);
    if (!m) throw new ConfigError(`${where}: expected "name: value" but found "${line.trim()}".`);
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const top = stack[stack.length - 1];
    if (top.childIndent === undefined) top.childIndent = indent;
    else if (indent !== top.childIndent) throw new ConfigError(`${where}: the indentation of "${m[1]}" doesn't line up with the lines above it.`);
    const [, key, value] = m;
    if (Object.hasOwn(top.obj, key)) throw new ConfigError(`${where}: "${key}" appears twice in the same section.`);
    if (value === undefined || value.trim() === '') {
      const obj = {}; top.obj[key] = obj; stack.push({ indent, obj, childIndent: undefined });
    } else top.obj[key] = scalar(value, where);
  });
  return root;
}

/* ---------- checking values ---------- */
function validate(raw) {
  const problems = [];
  const fail = (p, msg) => problems.push(`${p}: ${msg}`);
  const section = (obj, p) => {
    if (!obj || typeof obj !== 'object') { fail(p, 'this section is missing.'); return null; }
    return obj;
  };
  const known = (obj, p, keys) => { for (const k of Object.keys(obj)) if (!keys.includes(k)) fail(`${p}.${k}`, `unknown setting (check the spelling). Expected one of: ${keys.join(', ')}.`); };
  const num = (obj, key, p, { min = -Infinity, int = false, above, optional = false } = {}) => {
    const v = obj[key];
    if (v === undefined && optional) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) { fail(`${p}.${key}`, `should be a number${v === undefined ? ' but is missing' : `, not "${v}"`}.`); return 0; }
    if (int && !Number.isInteger(v)) fail(`${p}.${key}`, `should be a whole number, not ${v}.`);
    if (v < min) fail(`${p}.${key}`, `should be at least ${min}, not ${v}.`);
    if (above !== undefined && v <= above) fail(`${p}.${key}`, `should be more than ${above}, not ${v}.`);
    return v;
  };
  const str = (obj, key, p, { optional = false } = {}) => {
    const v = obj[key];
    if (v === undefined && optional) return '';
    if (typeof v !== 'string' && typeof v !== 'number') { fail(`${p}.${key}`, 'should be text.'); return ''; }
    return String(v);
  };
  if (!raw || typeof raw !== 'object') throw new ConfigError('game_config.yaml is empty.');
  known(raw, 'config', ['start', 'herd', 'cows', 'upgrade_items', 'ship_upgrades', 'suspicion', 'time']);
  const out = {};

  const start = section(raw.start, 'start');
  if (start) { known(start, 'start', ['coins', 'cows']); out.start = { coins: num(start, 'coins', 'start', { min: 0, int: true }), cows: num(start, 'cows', 'start', { min: 0, int: true }) }; }
  const herd = section(raw.herd, 'herd');
  if (herd) {
    known(herd, 'herd', ['max_cows', 'new_cow_price', 'rest_seconds']);
    out.herd = { max_cows: num(herd, 'max_cows', 'herd', { min: 1, int: true }), new_cow_price: num(herd, 'new_cow_price', 'herd', { min: 0, int: true }), rest_seconds: num(herd, 'rest_seconds', 'herd', { min: 0 }) };
  }
  if (out.start && out.herd && out.start.cows > out.herd.max_cows) fail('start.cows', `can't be more than herd.max_cows (${out.herd.max_cows}).`);

  const cows = section(raw.cows, 'cows');
  out.cows = {};
  if (cows) {
    if (!Object.keys(cows).length) fail('cows', 'list at least one cow.');
    for (const [k, c] of Object.entries(cows)) {
      const p = `cows.${k}`;
      if (!ART.includes(k)) { fail(p, `there's no art for a "${k}" cow. Cow keys must be one of: ${ART.join(', ')}.`); continue; }
      if (!section(c, p)) continue;
      known(c, p, ['name', 'milk', 'milk_price']);
      out.cows[k] = { name: str(c, 'name', p), milk: str(c, 'milk', p), milk_price: num(c, 'milk_price', p, { min: 0, int: true }) };
    }
  }
  const items = section(raw.upgrade_items, 'upgrade_items');
  out.upgrade_items = {};
  if (items) {
    for (const [k, it] of Object.entries(items)) {
      const p = `upgrade_items.${k}`;
      if (!section(it, p)) continue;
      known(it, p, ['name', 'icon', 'turns', 'into', 'cost']);
      const item = { name: str(it, 'name', p), icon: str(it, 'icon', p, { optional: true }) || '★', turns: str(it, 'turns', p), into: str(it, 'into', p), cost: num(it, 'cost', p, { min: 0, int: true }) };
      for (const f of ['turns', 'into']) if (!Object.hasOwn(out.cows, item[f])) fail(`${p}.${f}`, `"${item[f]}" isn't one of the cows (${Object.keys(out.cows).join(', ')}).`);
      if (item.turns === item.into) fail(p, '"turns" and "into" must be different cows.');
      if (Object.values(out.upgrade_items).some(o => o.turns === item.turns)) fail(`${p}.turns`, `another item already upgrades the ${item.turns} cow. Each cow can have only one next step.`);
      out.upgrade_items[k] = item;
    }
  }
  const ship = section(raw.ship_upgrades, 'ship_upgrades');
  out.ship_upgrades = {};
  if (ship) {
    known(ship, 'ship_upgrades', SHIP_KEYS);
    for (const k of SHIP_KEYS) {
      const p = `ship_upgrades.${k}`, u = section(ship[k], p);
      if (!u) continue;
      known(u, p, ['name', 'description', 'unit', 'start', 'change', 'amount', 'round', 'min', 'cost', 'cost_multiplier', 'max_level']);
      const up = {
        name: str(u, 'name', p), description: str(u, 'description', p, { optional: true }), unit: str(u, 'unit', p, { optional: true }),
        start: num(u, 'start', p), change: u.change, amount: num(u, 'amount', p), round: u.round === undefined ? 'none' : u.round,
        min: num(u, 'min', p, { optional: true }), cost: num(u, 'cost', p, { min: 0, int: true }),
        cost_multiplier: num(u, 'cost_multiplier', p, { above: 0 }), max_level: num(u, 'max_level', p, { min: 0, int: true })
      };
      if (!['add', 'multiply'].includes(up.change)) fail(`${p}.change`, `should be "add" or "multiply", not "${up.change}".`);
      if (!['whole', 'tenth', 'none'].includes(up.round)) fail(`${p}.round`, `should be "whole", "tenth" or "none", not "${up.round}".`);
      if (up.min === undefined) delete up.min;
      out.ship_upgrades[k] = up;
    }
    // Every level must give a usable value.
    for (const [k, up] of Object.entries(out.ship_upgrades)) {
      if (!['add', 'multiply'].includes(up.change) || !['whole', 'tenth', 'none'].includes(up.round)) continue;
      for (let n = 0; n <= up.max_level; n++) {
        const v = shipValue(up, n);
        if (k === 'milkTime' && !(v > 0)) { fail(`ship_upgrades.${k}`, `milking time reaches ${v}s at level ${n}. Lower max_level or add "min: 1".`); break; }
        if ((k === 'cowCap' || k === 'bottleCap') && !(Number.isInteger(v) && v >= 1)) { fail(`ship_upgrades.${k}`, `capacity must be a whole number of at least 1, but level ${n} gives ${v}. Use "round: whole".`); break; }
        if (k === 'stealth' && !(v > 0)) { fail(`ship_upgrades.${k}`, `stealth must stay above 0, but level ${n} gives ${v}.`); break; }
      }
    }
  }
  const sus = section(raw.suspicion, 'suspicion');
  if (sus) { known(sus, 'suspicion', ['per_beam', 'limit', 'cooldown_per_second']); out.suspicion = { per_beam: num(sus, 'per_beam', 'suspicion', { min: 0 }), limit: num(sus, 'limit', 'suspicion', { above: 0 }), cooldown_per_second: num(sus, 'cooldown_per_second', 'suspicion', { min: 0 }) }; }
  const time = section(raw.time, 'time');
  if (time) { known(time, 'time', ['offline_hours']); out.time = { offline_hours: num(time, 'offline_hours', 'time', { min: 0 }) }; }

  if (problems.length) throw new ConfigError(`game_config.yaml has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  • ${problems.join('\n  • ')}`);
  return out;
}
function shipValue(up, n) {
  let v = up.change === 'add' ? up.start + up.amount * n : up.start * up.amount ** n;
  if (up.round === 'whole') v = Math.round(v);
  else if (up.round === 'tenth') v = Math.round(v * 10) / 10;
  if (up.min !== undefined) v = Math.max(up.min, v);
  return v;
}

function loadConfig(file = CONFIG_PATH) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { throw new ConfigError(`Couldn't find ${path.basename(file)} next to index.html.`); }
  return validate(parseYaml(text, path.basename(file)));
}
const HEADER = '// Generated from game_config.yaml. Don\'t edit this file. Edit game_config.yaml, then run `npm run config` (npm start does it for you).\n';
/* Writes game/config.js. On a mistake, keeps the last good settings and adds the error so the game can show it. */
function buildConfig(file = CONFIG_PATH, output = OUTPUT_PATH) {
  try {
    const config = loadConfig(file);
    fs.writeFileSync(output, `${HEADER}window.MOO_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
    return { ok: true, config };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    let previous = '';
    try { previous = fs.readFileSync(output, 'utf8').replace(/\nwindow\.MOO_CONFIG_ERROR = .*\n?$/s, '\n'); } catch { /* no earlier build */ }
    if (previous) fs.writeFileSync(output, `${previous.trimEnd()}\nwindow.MOO_CONFIG_ERROR = ${JSON.stringify(error.message)};\n`);
    return { ok: false, error: error.message };
  }
}

module.exports = { parseYaml, validate, loadConfig, buildConfig, shipValue, ConfigError, CONFIG_PATH, OUTPUT_PATH };

if (require.main === module) {
  const result = buildConfig();
  if (result.ok) console.log(`✓ game_config.yaml → game/config.js (${Object.keys(result.config.cows).length} cows, ${Object.keys(result.config.upgrade_items).length} upgrade items)`);
  else { console.error(`✗ ${result.error}\n  The game keeps using the last good settings until this is fixed.`); process.exitCode = 1; }
}
