(() => {
  'use strict';
  const G = window.MooGame;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e4 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toLocaleString();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const KEY = 'moo-ving-v3';
  const LOCATIONS = {
    farm: ['The Field', 'Earth / a very unsuspecting pasture'],
    ship: ['The Milky Wayfarer', 'Your saucer / milking deck'],
    market: ['Galactic Marketplace', 'Fresh from Earth. Wanted everywhere.']
  };
  const art = (type, extra = '') => `<span class="cow-art ${type}${extra ? ' ' + extra : ''}"></span>`;
  const bottle = type => `<span class="bottle ${type}" aria-hidden="true"></span>`;
  const ITEM_SPRITES = { chocolateBar: 'chocolate-bar', strawberry: 'strawberry-treat', latteCup: 'latte-cup', almond: 'almond-treat' };
  const icon = key => ITEM_SPRITES[key]
    ? `<span class="item-icon item-${ITEM_SPRITES[key]}" aria-hidden="true"></span>`
    : `<span class="item-icon" aria-hidden="true">${esc(G.ITEMS[key].icon)}</span>`;
  const cowName = type => G.COWS[type].name;
  const milkName = type => G.COWS[type].milk;

  let state, storageOK = true, toastTimer, dialog = '', dialogSig = '', lastNotice = 0, lastSave = Date.now(), lastTick = Date.now();
  let pendingReset = false, pendingImport = null, selectedItem = null, suppressClick = false, guideHidden = false;
  try { guideHidden = localStorage.getItem('moo-guide-hidden') === '1'; } catch { /* storage blocked */ }

  /* ---------- saving, toasts, floating numbers ---------- */
  function save() {
    const now = Date.now();
    G.advance(state, Math.max(0, (now - lastTick) / 1000));
    lastTick = now; state.savedAt = now;
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch { storageOK = false; }
    $('save-mark').textContent = storageOK ? '● Saved on this device' : '○ Autosave unavailable · keep this tab open';
    lastSave = now;
  }
  function toast(text) {
    if (!text) return;
    clearTimeout(toastTimer); $('world-toast').textContent = text; $('world-toast').hidden = false;
    toastTimer = setTimeout(() => { $('world-toast').hidden = true; }, 3600);
    $('announcement').textContent = text;
  }
  function float(text, target) {
    const el = document.createElement('span'), rect = target?.getBoundingClientRect?.();
    el.className = 'floating-number'; el.textContent = text;
    el.style.left = (rect ? rect.left + rect.width / 2 : innerWidth / 2) + 'px';
    el.style.top = (rect ? rect.top : innerHeight / 2) + 'px';
    const host = $('world-dialog').open ? $('world-dialog') : $('float-layer');
    host.append(el); setTimeout(() => el.remove(), 1700);
  }
  function fly(html, from, to, duration = 900) {
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const el = document.createElement('div'); el.className = 'flyer'; el.innerHTML = html;
    el.style.left = a.left + a.width / 2 + 'px'; el.style.top = a.top + a.height / 3 + 'px';
    $('float-layer').append(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 3);
    const anim = el.animate([
      { translate: '-50% -50%', scale: '.6', opacity: 0 },
      { translate: `calc(-50% + ${dx * .3}px) calc(-50% + ${dy * .3 - 60}px)`, scale: '1.1', opacity: 1, offset: .35 },
      { translate: `calc(-50% + ${dx}px) calc(-50% + ${dy}px)`, scale: '.5', opacity: .2 }
    ], { duration, easing: 'ease-in-out' });
    anim.onfinish = () => el.remove();
  }
  const stageRect = () => $('stage').getBoundingClientRect();
  const stageX = clientX => { const r = stageRect(); return (clientX - r.left) / r.width * 100; };
  const dialogOpen = () => $('world-dialog').open;

  /* ---------- the field: UFO, beam and hopping cows ---------- */
  const field = new Map(); // cow id → { el, x, y, dir, next, type, departing }
  const ufo = { x: 70, target: 70, keys: new Set(), queued: false };
  let beaming = false, targetId = null;

  function placeCow(v) {
    v.el.style.left = v.x + '%'; v.el.style.top = v.y + '%';
    v.el.style.zIndex = Math.round(v.y * 10);
    // The painted pasture recedes to a horizon at 60%. Keep hooves anchored
    // while apparent size grows with distance from that vanishing line.
    v.el.style.setProperty('--depth', ((v.y - 60) / 14).toFixed(3));
    v.el.style.setProperty('--dir', v.dir);
  }
  function syncField() {
    const ids = new Set(state.field.map(c => c.id));
    for (const [id, v] of field) if (!ids.has(id) && !v.departing) { v.el.remove(); field.delete(id); }
    for (const c of state.field) {
      let v = field.get(c.id);
      if (!v) {
        const el = document.createElement('div');
        el.className = 'field-cow';
        el.innerHTML = `<span class="cow-shadow"></span><span class="cow-body">${art(c.type)}</span><span class="zzz">z<b>z</b><i>z</i></span><span class="cow-tag"></span>`;
        $('field-cows').append(el);
        v = { el, x: rand(9, 91), y: rand(66, 88), dir: Math.random() < .5 ? 1 : -1, next: performance.now() + rand(400, 4000), type: c.type };
        field.set(c.id, v); placeCow(v);
      }
      if (v.type !== c.type) { v.type = c.type; v.el.querySelector('.cow-art').className = 'cow-art ' + c.type; }
      const resting = G.resting(state, c);
      v.el.classList.toggle('resting', resting);
      if (resting) v.el.classList.remove('hopping');
      v.el.querySelector('.cow-tag').textContent = c.name;
    }
  }
  function wander(now) {
    for (const v of field.values()) {
      if (v.departing || v.el.classList.contains('resting') || now < v.next) continue;
      if (Math.random() < .3) { v.next = now + rand(1500, 4000); continue; }
      const dx = rand(3, 9) * (Math.random() < .5 ? -1 : 1);
      v.x = clamp(v.x + dx, 8, 92); v.y = clamp(v.y + rand(-3, 3), 66, 88); v.dir = dx > 0 ? 1 : -1;
      v.el.classList.remove('hopping'); void v.el.offsetWidth; v.el.classList.add('hopping');
      placeCow(v); v.next = now + rand(2400, 6500);
    }
  }
  function cowX(v, rect) { const r = v.el.getBoundingClientRect(); return (r.left + r.width / 2 - rect.left) / rect.width * 100; }
  function pickTarget() {
    const rect = stageRect(); let best = null, bestScore = Infinity;
    for (const c of state.field) {
      const v = field.get(c.id); if (!v || v.departing) continue;
      const d = Math.abs(cowX(v, rect) - ufo.x);
      if (d > 4.5) continue;
      const score = d + (G.resting(state, c) ? 10 : 0);
      if (score < bestScore) { best = c; bestScore = score; }
    }
    return best;
  }
  function moveUfo(dt) {
    let dir = 0;
    if (ufo.keys.has('left')) dir--;
    if (ufo.keys.has('right')) dir++;
    if (dir) ufo.target = clamp(ufo.target + dir * 50 * dt, 5, 95);
    if (!beaming) ufo.x += (ufo.target - ufo.x) * Math.min(1, dt * 9);
    const u = $('ufo');
    u.style.left = ufo.x + '%';
    u.style.setProperty('--tilt', clamp((ufo.target - ufo.x) * 1.5, -12, 12).toFixed(1) + 'deg');
    if (beaming) return;
    const c = pickTarget(), id = c ? c.id : null;
    if (id !== targetId) {
      field.get(targetId)?.el.classList.remove('targeted');
      targetId = id;
      field.get(id)?.el.classList.add('targeted');
    }
    const v = field.get(id);
    u.classList.toggle('locked', Boolean(c && !G.resting(state, c)));
    u.style.setProperty('--beam-h', ((v ? v.y - 3 : 84) - 24).toFixed(1) + 'cqh');
    if (ufo.queued && Math.abs(ufo.target - ufo.x) < 0.8) { ufo.queued = false; tryBeam(); }
  }
  function tryBeam() {
    if (state.scene !== 'farm' || !state.started || beaming || dialogOpen()) return;
    const c = state.field.find(c => c.id === targetId);
    if (!c) { toast('Line the UFO up over a cow first. It glows when you are on target.'); return; }
    const v = field.get(c.id), result = G.act(state, 'beam', c.id);
    if (!result.ok) { toast(result.message); return; }
    beaming = true; v.departing = true; v.el.classList.remove('targeted', 'hopping'); v.el.classList.add('beamed');
    targetId = null;
    const saucer = $('ufo').querySelector('.saucer').getBoundingClientRect(), cow = v.el.getBoundingClientRect();
    const dx = saucer.left + saucer.width / 2 - (cow.left + cow.width / 2), dy = saucer.top + saucer.height * .55 - (cow.top + cow.height / 2);
    $('ufo').classList.remove('beaming'); void $('ufo').offsetWidth; $('ufo').classList.add('beaming');
    $('ufo').style.setProperty('--beam-h', (v.y - 3 - 24).toFixed(1) + 'cqh');
    const anim = v.el.animate([
      { translate: '0 0', scale: '1' },
      { translate: `0 ${dy * .15}px`, scale: '1', offset: .2 },
      { translate: `${dx}px ${dy}px`, scale: '.08' }
    ], { duration: 1150, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => {
      v.el.remove(); field.delete(c.id); beaming = false;
      $('ufo').classList.remove('beaming');
      float(`${c.name} aboard!`, $('ufo'));
    };
    render(); save();
  }

  /* ---------- the ship ---------- */
  let shipSig = '', lastPuff = 0, visiblePad = null, teleportTimer;
  function cowStatus(c) {
    if (state.milking && state.milking.cowId === c.id) return 'Being milked';
    const parts = [];
    if (c.milked) parts.push('milked');
    if (c.upgraded) parts.push('upgraded');
    return parts.length ? `Exhausted (${parts.join(' & ')})` : 'Fresh';
  }
  function buildShip() {
    const storage = state.ship.filter(c => c.id !== state.pad);
    $('ship-storage').innerHTML = storage.map(c => {
      return `<button class="ship-cow${G.exhausted(c) ? ' tired' : ''}" data-action="pad" data-value="${c.id}" data-drag="cow" aria-label="${esc(c.name)}, ${cowStatus(c)}. Teleport to the milking pad." title="Drag this hologram to the pad, or click to teleport"><span class="selection-screen">${art(c.type)}</span><span class="cow-name">${esc(c.name)}</span><span class="selection-status">${G.exhausted(c) ? 'REST NEEDED' : 'LINK READY'}</span></button>`;
    }).join('');
    const pad = state.ship.find(c => c.id === state.pad);
    $('pad-cow').innerHTML = pad ? `<div class="pad-cow-art" data-drag="cow" data-value="${pad.id}" title="Drag to the return chute or back to storage">${art(pad.type)}</div>` : '';
    $('ship-scene').classList.toggle('has-pad', Boolean(pad));
    $('pad-hint').hidden = Boolean(pad) || !storage.length;
    $('storage-empty').hidden = Boolean(storage.length);
    if (state.pad !== visiblePad) {
      clearTimeout(teleportTimer);
      $('ship-scene').classList.remove('teleporting');
      if (pad || visiblePad !== null) {
        void $('teleport-effects').offsetWidth;
        $('ship-scene').classList.add('teleporting');
        teleportTimer = setTimeout(() => $('ship-scene').classList.remove('teleporting'), 850);
      }
      visiblePad = state.pad;
    }
  }
  function renderShip() {
    const s = state, m = s.milking;
    const sig = JSON.stringify([s.ship.map(c => [c.id, c.name, c.type, c.milked, c.upgraded]), s.pad, Boolean(m)]);
    if (sig !== shipSig && !drag.active) { shipSig = sig; buildShip(); }
    $('ship-scene').classList.toggle('milking', Boolean(m));
    $('milker-fill').style.width = m ? clamp(100 - (m.until - s.time) / m.duration * 100, 0, 100) + '%' : '0%';
    $('monitor-count').textContent = `${s.ship.length}/${G.cowCap(s)}`;
    $('monitor-pips').innerHTML = Array.from({ length: G.cowCap(s) }, (_, i) => `<i class="${i < s.ship.length ? 'on' : ''}"></i>`).join('');
    const why = G.reason(s, 'milk');
    $('milk-button').classList.toggle('off', Boolean(why));
    $('milk-button').title = why || 'Milk the cow on the pad (M)';
    const pad = s.ship.find(c => c.id === s.pad);
    $('pad-name').textContent = pad ? pad.name : 'NO COW LINKED';
    $('pad-status').textContent = m ? `Milking · ${Math.max(0, Math.ceil(m.until - s.time))}s` : !pad ? 'Select a cow below' : /full/.test(why || '') ? 'Milk storage full' : cowStatus(pad);
    $('podium-fill').style.width = m ? $('milker-fill').style.width : '0%';
    $('store-cow').disabled = $('return-cow').disabled = !pad || Boolean(m);
  }
  function shipFrame(now) {
    if (!state.milking || now - lastPuff < 420) return;
    lastPuff = now;
    const p = document.createElement('i');
    p.className = 'puff sprite ' + (Math.random() < .5 ? 'sprite-puff' : 'sprite-puff2');
    const side = Math.random() < .5 ? -1 : 1;
    p.style.left = (side < 0 ? rand(-6, 14) : rand(70, 92)) + '%';
    p.style.setProperty('--dx', side * rand(10, 40) + 'px');
    $('steam').append(p); setTimeout(() => p.remove(), 1600);
  }
  let launchTimer, flightTimer;
  function launchPod(cow) {
    const pod = $('pod'), mini = $('mini-pod');
    clearTimeout(launchTimer); clearTimeout(flightTimer);
    pod.classList.remove('launch'); mini.classList.remove('fly'); void pod.offsetWidth;
    $('chute-passenger').innerHTML = art(cow.type);
    pod.classList.add('launch'); mini.classList.add('fly');
    launchTimer = setTimeout(() => { pod.classList.remove('launch'); $('chute-passenger').innerHTML = ''; }, 1000);
    flightTimer = setTimeout(() => mini.classList.remove('fly'), 3400);
  }

  /* ---------- the market: alien cats drinking the milk you sold ---------- */
  const cats = [], drinkQueue = [];
  function makeCats() {
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div'); el.className = 'cat';
      el.innerHTML = '<span class="cat-shadow"></span><span class="cat-body"><span class="cat-face"></span><span class="cat-drink"></span></span>';
      $('cats').append(el);
      const c = { el, x: 35 + i * 10, y: rand(74, 86), dir: 1, next: performance.now() + rand(300, 3000), drink: null };
      cats.push(c); placeCat(c);
    }
  }
  function placeCat(c) {
    c.el.style.left = c.x + '%'; c.el.style.top = c.y + '%'; c.el.style.zIndex = Math.round(c.y * 10);
    c.el.style.setProperty('--depth', (0.8 + (c.y - 70) / 20 * 0.3).toFixed(3));
    c.el.style.setProperty('--dir', c.dir);
  }
  function catsFrame(now) {
    for (const c of cats) {
      if (c.drink && now > c.drink.until) { c.drink = null; c.el.classList.remove('drinking'); }
      if (!c.drink && drinkQueue.length) {
        const type = drinkQueue.shift();
        c.drink = { type, until: now + rand(9000, 14000) };
        c.el.querySelector('.cat-drink').className = 'cat-drink bottle ' + type;
        c.el.classList.add('drinking'); c.el.classList.remove('hopping');
      }
      if (now < c.next) continue;
      if (c.drink) { c.next = now + 1000; continue; }
      if (Math.random() < .3) { c.el.classList.add('blink'); setTimeout(() => c.el.classList.remove('blink'), 260); c.next = now + rand(800, 2000); continue; }
      const dx = rand(4, 12) * (Math.random() < .5 ? -1 : 1);
      // A convex walkable rectangle includes the cats' whole sprites, shadows,
      // and hop arcs. Every interpolated step stays clear of foreground props.
      c.x = clamp(c.x + dx, 33, 70); c.y = clamp(c.y + rand(-4, 4), 73, 88); c.dir = dx > 0 ? 1 : -1;
      c.el.classList.remove('hopping'); void c.el.offsetWidth; c.el.classList.add('hopping');
      placeCat(c); c.next = now + rand(1800, 4500);
    }
  }

  /* ---------- HUD and scene rendering ---------- */
  function tutorialStep() {
    const s = state, sc = s.scene, total = G.bottleCount(s), pad = s.ship.find(c => c.id === s.pad);
    const travel = scene => `#travel [data-value="${scene}"]`;
    if (s.tutorial === 'markets' || s.tutorial === 'overview') {
      return sc === 'market'
        ? { text: 'First sale complete! These three stands are your markets. Click any glowing stand for a quick look at trading and upgrades.', target: '.stand' }
        : { text: 'First sale complete! Visit the Market (3), then click any stand for a quick look at trading and upgrades.', target: travel('market') };
    }
    if (total) {
      if (sc !== 'market') return { text: 'One cow, one bottle! Go to the Market (3) to sell your first milk. You can send your tired cow home through the return chute later.', target: travel('market') };
      if (dialog === 'sell' && dialogOpen()) return { text: 'Click Sell 1 or Sell everything to turn your first bottle into coins.', target: '#dialog-content [data-action="sellAll"]' };
      return { text: 'Click the left stand, Galactic Dairy Co., to sell your first bottle.', target: '.stand-sell' };
    }
    if (s.milking) return { text: 'The Moo-Matic is working! Wait for your first bottle. You only need to milk this one cow for the tutorial.', target: sc === 'ship' ? '#milker' : travel('ship') };
    if (s.ship.some(c => !c.milked)) {
      if (sc !== 'ship') return { text: 'Your first cow is aboard! Go to the Ship (2). It steps onto the empty milking pad for you.', target: travel('ship') };
      return pad && !pad.milked
        ? { text: 'Your cow is on the pad. Press MILK on the overhead milker (or M) to make one bottle.', target: '#milk-button' }
        : { text: 'Click a fresh cow in storage to move it onto the milking pad.', target: '.ship-cow:not(.tired)' };
    }
    return sc === 'farm'
      ? { text: "I'm Miso! Move the UFO with your mouse or ← →. When a cow glows, click or press Space to beam up your first cow.", target: '#ufo' }
      : { text: 'Go to the Field (1) and beam up one cow to get started.', target: travel('farm') };
  }
  function renderTutorial() {
    const active = state.started && ['first-sale', 'markets', 'overview'].includes(state.tutorial);
    $('guide').hidden = !active || dialogOpen();
    document.querySelectorAll('.tutorial-target').forEach(el => el.classList.remove('tutorial-target'));
    if (!active) return;
    const step = tutorialStep();
    if ($('guide-text').textContent !== step.text) $('guide-text').textContent = step.text;
    document.querySelectorAll(step.target).forEach(el => el.classList.add('tutorial-target'));
  }
  function marketTutorial() {
    if (state.tutorial === 'first-sale' && G.bottleCount(state)) {
      return `<aside class="market-tutorial" aria-label="Miso's first sale tip"><div class="tutorial-speaker"><span class="alien-portrait" aria-hidden="true"></span><strong>MISO / YOUR FIRST SALE</strong></div><p>Click Sell 1 or Sell everything below to turn your first bottle into coins.</p></aside>`;
    }
    if (state.tutorial !== 'overview') return '';
    return `<aside class="market-tutorial" aria-label="Miso's market and upgrade tutorial">
      <div class="tutorial-speaker"><span class="alien-portrait" aria-hidden="true"></span><strong>MISO / ONE LAST TIP</strong></div>
      <p><b>Left: sell milk.</b> Galactic Dairy Co. pays coins for each bottle.</p>
      <p><b>Middle: upgrade your ship.</b> Choose an upgrade and click Buy for faster milking, more cow or bottle storage, or better stealth.</p>
      <p><b>Right: buy cows and treats.</b> New cows join the field. For better milk, buy a matching treat, go to Ship → Cow storage, and drag the treat onto the cow (or select the treat, then click the cow). Upgrade before milking. Send tired cows home through the return chute to rest.</p>
      <p>That's it! Grow your dairy at your own pace.</p>
      <button class="ui-button gold" data-action="finish-tutorial">Got it — finish tutorial</button></aside>`;
  }
  function render() {
    const s = state;
    $('world').className = `world ${s.scene}${s.started ? '' : ' intro'}${guideHidden ? ' guide-hidden' : ''}`;
    $('location-title').textContent = LOCATIONS[s.scene][0];
    $('location-subtitle').textContent = LOCATIONS[s.scene][1];
    for (const scene of G.SCENES) $(scene + '-scene').hidden = scene !== s.scene;
    for (const id of ['travel', 'supplies-hud', 'hud-right', 'save-mark']) $(id).hidden = !s.started;
    $('suspicion').hidden = !s.started || s.scene !== 'farm';
    $('welcome').hidden = s.started;
    $('coins').textContent = compact(s.coins);
    $('bottles').textContent = `${G.bottleCount(s)}/${G.bottleCap(s)}`;
    $('susp-mask').style.width = (1 - s.suspicion / G.SUSPICION_LIMIT) * 86.44 + '%';
    const blocked = s.suspicion + G.beamSuspicion(s) > G.SUSPICION_LIMIT;
    $('susp-text').textContent = `Ship ${s.ship.length}/${G.cowCap(s)} cows · ${blocked ? 'lay low, Earth is watching!' : s.ship.length >= G.cowCap(s) ? 'ship full' : 'beam ready'}`;
    $('suspicion').classList.toggle('hot', blocked);
    for (const b of document.querySelectorAll('#travel button')) {
      if (b.dataset.value === s.scene) b.setAttribute('aria-current', 'location'); else b.removeAttribute('aria-current');
    }
    if (s.scene === 'farm') syncField();
    if (s.scene === 'ship') renderShip();
    refreshDialog();
    renderTutorial();
    let fresh = false;
    for (const notice of s.notices) {
      if (notice.id <= lastNotice) continue;
      lastNotice = notice.id; toast(notice.text); fresh = true;
      if (notice.kind === 'bottle' && s.scene === 'ship') fly(bottle(notice.type), $('pad-cow'), $('bottles'), 1100);
    }
    if (fresh) save(); // a finished milking is worth saving right away
  }

  /* ---------- dialogs ---------- */
  function openDialog(kind, eyebrow, html) {
    ufo.queued = false; ufo.keys.clear();
    dialog = kind; dialogSig = sig();
    $('dialog-eyebrow').textContent = eyebrow;
    $('dialog-content').innerHTML = html;
    $('world-dialog').dataset.kind = kind;
    if (!dialogOpen()) $('world-dialog').showModal();
    renderTutorial();
  }
  function closeDialog() { $('world-dialog').close(); }
  const sig = () => JSON.stringify([state.tutorial, state.coins, state.bottles, state.items, state.levels, state.ship.map(c => [c.id, c.type, c.milked, c.upgraded]), state.pad, Boolean(state.milking), state.field.map(c => [c.type, G.resting(state, c)]), selectedItem]);
  const builders = { inventory, sell: sellStand, ship: shipStand, cows: cowStand, storage: cowStorage };
  function refreshDialog() {
    if (!dialogOpen() || !builders[dialog] || drag.active) return;
    const now = sig(); if (now === dialogSig) return;
    const active = document.activeElement, key = active?.dataset ? [active.dataset.action, active.dataset.value, active.dataset.extra].join('|') : '';
    const scroll = $('dialog-content').scrollTop;
    builders[dialog]();
    $('dialog-content').scrollTop = scroll;
    if (key) Array.from(document.querySelectorAll('#dialog-content [data-action]')).find(el => [el.dataset.action, el.dataset.value, el.dataset.extra].join('|') === key && !el.disabled)?.focus({ preventScroll: true });
  }
  const priceTag = n => `<span class="price"><span class="coin-token small"></span>${compact(n)}</span>`;
  function inventory() {
    const s = state, resting = s.field.filter(c => G.resting(s, c)).length;
    const typeRow = cows => G.TYPES.filter(t => cows.some(c => c.type === t)).map(t => `<span class="type-count" title="${cowName(t)}">${art(t)}×${cows.filter(c => c.type === t).length}</span>`).join('') || '<small>None</small>';
    openDialog('inventory', 'INVENTORY', `<h2 id="dialog-title">Inventory</h2>
      <h3 class="inv-head">Milk <small>${G.bottleCount(s)} / ${G.bottleCap(s)} bottles on the ship · worth ${compact(G.milkValue(s))} coins</small></h3>
      <div class="slots">${G.TYPES.map(t => `<div class="slot${s.bottles[t] ? '' : ' empty'}" title="${milkName(t)}: sells for ${G.COWS[t].price} coins">${bottle(t)}<b>×${s.bottles[t]}</b><small>${milkName(t)}</small></div>`).join('')}</div>
      <h3 class="inv-head">Upgrade items</h3>
      <div class="slots">${Object.entries(G.ITEMS).map(([k, it]) => `<div class="slot${s.items[k] ? '' : ' empty'}" title="${it.name}: turns a ${cowName(it.from).toLowerCase()} into a ${cowName(it.to).toLowerCase()}">${icon(k)}<b>×${s.items[k]}</b><small>${it.name}</small></div>`).join('')}</div>
      <h3 class="inv-head">Cows <small>${G.herdSize(s)} / ${G.HERD_MAX} in your herd</small></h3>
      <div class="herd-split"><div class="herd-box"><b>Field</b><span>${s.field.length} cows${resting ? ` · ${resting} resting` : ''}</span><div class="type-row">${typeRow(s.field)}</div></div>
      <div class="herd-box"><b>Ship</b><span>${s.ship.length} / ${G.cowCap(s)} cows</span><div class="type-row">${typeRow(s.ship)}</div></div></div>
      <p class="fine">${s.coins.toLocaleString()} coins · ${compact(s.earned)} earned from milk so far</p>`);
  }
  function sellStand() {
    const s = state, total = G.milkValue(s);
    openDialog('sell', 'MARKET / MILK STAND', `<h2 id="dialog-title">Galactic Dairy Co.</h2>${marketTutorial()}<p>We buy every bottle you bring. You have ${G.bottleCount(s)} bottle${G.bottleCount(s) === 1 ? '' : 's'}.</p>
      ${G.TYPES.map(t => `<div class="shop-row">${bottle(t)}<div class="shop-text"><h3>${milkName(t)}</h3><small>From the ${cowName(t).toLowerCase()} · you have ${s.bottles[t]}</small></div>${priceTag(G.COWS[t].price)}<div class="shop-buttons"><button class="ui-button" data-action="sell" data-value="${t}" data-extra="1" ${s.bottles[t] ? '' : 'disabled'}>Sell 1</button><button class="ui-button" data-action="sell" data-value="${t}" data-extra="all" ${s.bottles[t] ? '' : 'disabled'}>Sell all</button></div></div>`).join('')}
      <button class="ui-button wide gold" data-action="sellAll" ${total ? '' : 'disabled'}>Sell everything · +${compact(total)} coins</button>`);
  }
  function shipStand() {
    const s = state;
    openDialog('ship', 'MARKET / SHIP UPGRADES', `<h2 id="dialog-title">Saucer Parts & Upgrades</h2>${marketTutorial()}<p>Make your ship faster, roomier and sneakier. <b>${compact(s.coins)} coins</b> to spend.</p>
      ${Object.entries(G.SHIP).map(([k, u]) => {
        const lv = s.levels[k], max = lv >= u.max, now = u.value(lv), next = max ? null : u.value(lv + 1), cost = G.upgradeCost(s, k);
        return `<div class="shop-row"><span class="lvl">Lv ${lv}</span><div class="shop-text"><h3>${u.name}</h3><small>${u.text}<br><b>${now}${u.unit}</b>${max ? ' · max level' : ` → <b>${next}${u.unit}</b>`}</small></div><div class="shop-buttons"><button class="ui-button" data-action="shipUpgrade" data-value="${k}" ${max || s.coins < cost ? 'disabled' : ''} title="${esc(G.reason(s, 'shipUpgrade', k) || 'Upgrade')}">${max ? 'MAX' : `Buy · ${compact(cost)}`}</button></div></div>`;
      }).join('')}`);
  }
  function cowStand() {
    const s = state, full = G.herdSize(s) >= G.HERD_MAX;
    openDialog('cows', 'MARKET / COWS & TREATS', `<h2 id="dialog-title">Cows & Treats</h2>${marketTutorial()}<p>New cows wait in the field. Treats upgrade a cow one step at a time: ${G.TYPES.map(t => cowName(t).replace(/ cow$/i, '').toLowerCase()).join(' → ')}.</p>
      <div class="shop-row"><span class="mini-cow">${art(G.TYPES[0])}</span><div class="shop-text"><h3>${cowName(G.TYPES[0])}</h3><small>${G.herdSize(s)} / ${G.HERD_MAX} cows in your herd${full ? ' · herd is full' : ''}</small></div>${priceTag(G.COW_PRICE)}<div class="shop-buttons"><button class="ui-button" data-action="buyCow" ${full || s.coins < G.COW_PRICE ? 'disabled' : ''}>Buy cow</button></div></div>
      <h3 class="inv-head">Cow upgrade items</h3>
      ${Object.entries(G.ITEMS).map(([k, it]) => `<div class="shop-row">${icon(k)}<div class="shop-text"><h3>${it.name} <small class="owned">own ${s.items[k]}</small></h3><small class="chain"><span class="mini-cow">${art(it.from)}</span>${cowName(it.from)} → <span class="mini-cow">${art(it.to)}</span>${cowName(it.to)}</small></div>${priceTag(it.cost)}<div class="shop-buttons"><button class="ui-button" data-action="buyItem" data-value="${k}" ${s.coins < it.cost ? 'disabled' : ''}>Buy</button></div></div>`).join('')}
      <p class="fine">You have ${compact(s.coins)} coins.</p>`);
  }
  function cowStorage() {
    const s = state, cap = G.cowCap(s), sel = selectedItem && G.ITEMS[selectedItem];
    const cards = s.ship.map(c => {
      const milking = s.milking && s.milking.cowId === c.id, valid = sel && sel.from === c.type && !c.upgraded && !milking;
      const chips = [milking ? 'Milking…' : '', s.pad === c.id ? 'On pad' : '', c.milked ? 'Milked' : '', c.upgraded ? 'Upgraded' : '', !G.exhausted(c) && !milking ? 'Fresh' : ''].filter(Boolean);
      const next = G.itemFor(c.type);
      return `<div class="cow-card${G.exhausted(c) ? ' tired' : ''}${valid ? ' valid' : ''}" data-drop="cow" data-value="${c.id}">
        <button class="cow-card-art" data-action="card-cow" data-value="${c.id}" aria-label="${esc(c.name)}${sel ? `. Use ${sel.name}` : ''}">${art(c.type)}</button>
        <b>${esc(c.name)}</b><small>${next ? `Needs a ${G.ITEMS[next].name.toLowerCase()}` : 'Fully upgraded'}</small>
        <span class="chips">${chips.map(t => `<i>${t}</i>`).join('')}</span>
        <span class="card-actions"><button class="ui-button" data-action="pad" data-value="${c.id}" ${s.pad === c.id || s.milking ? 'disabled' : ''}>To milker</button><button class="ui-button" data-action="send" data-value="${c.id}" ${milking ? 'disabled' : ''}>Send home</button></span></div>`;
    }).join('') + Array.from({ length: Math.max(0, cap - s.ship.length) }, () => '<div class="cow-card empty"><span>Empty stall</span></div>').join('');
    openDialog('storage', 'SHIP / COW STORAGE', `<h2 id="dialog-title">Cow storage <small>${s.ship.length} / ${cap}</small></h2>
      <p>Drag an upgrade item onto a cow, or pick an item and then click a cow. Each cow can be milked once and upgraded once per trip. After that it's exhausted and must rest on Earth.</p>
      <div class="item-tray">${Object.entries(G.ITEMS).map(([k, it]) => `<button class="slot item${selectedItem === k ? ' selected' : ''}" data-action="select-item" data-value="${k}" data-drag="item" ${s.items[k] ? '' : 'disabled'} aria-pressed="${selectedItem === k}" title="${it.name}: ${cowName(it.from)} → ${cowName(it.to)}">${icon(k)}<b>×${s.items[k]}</b><small>${it.name}</small></button>`).join('')}</div>
      ${Object.values(s.items).some(Boolean) ? '' : '<p class="fine">No upgrade items yet. Buy treats at the market\'s cow stand (right).</p>'}
      <div class="cow-cards">${cards || ''}</div>`);
  }
  function menu() {
    openDialog('menu', 'YOUR POCKET FIELD GUIDE', `<h2 id="dialog-title">How the dairy works</h2>
      <section class="menu-row"><h3>1. Beam a cow up</h3><p>In the field, steer the UFO with the mouse or ← →. Click or press Space to beam up the cow beneath you, one at a time. Each beam raises Earth's suspicion. Your ship holds ${G.cowCap(state)} cows.</p></section>
      <section class="menu-row"><h3>2. Milk it aboard the ship</h3><p>The first cow aboard steps onto an empty milking pad when you enter the ship. Click another cow to swap it in, then press MILK. The milker covers the cow for ${G.milkTime(state)}s and makes one bottle of its milk. Inventory holds ${G.bottleCap(state)} bottles.</p></section>
      <section class="menu-row"><h3>3. Upgrade it, then send it home</h3><p>Use the cow storage monitor to drag treats onto cows. A milked or upgraded cow is exhausted. Send it home through the return chute and watch its pod fly away outside. It rests in the field for ${G.REST}s before it can be beamed again.</p></section>
      <section class="menu-row"><h3>4. Sell, buy, grow</h3><p>At the market, the left stand buys milk, the middle stand upgrades your ship, and the right stand sells new cows and treats. Your herd can hold up to ${G.HERD_MAX} cows.</p></section>
      <section class="menu-row"><h3>Keys</h3><p>1 / 2 / 3 travel · I inventory · M milk · ← → Space in the field · Esc closes windows</p></section>
      <section class="menu-row"><h3>About your dairy</h3><p>${Math.floor(state.totalTime / 60)} minutes played · ${compact(state.earned)} coins earned from milk<br>${storageOK ? 'Progress saves automatically in this browser.' : 'This browser blocked saving. Keep the tab open, or download a backup.'}</p></section>
      <div class="menu-actions"><button class="ui-button" data-action="export">Save a backup</button><button class="ui-button" data-action="import">Restore backup</button></div>
      <button class="ui-button wide" data-action="fullscreen">Toggle fullscreen</button><input id="import-file" type="file" accept=".json,application/json" hidden>
      <button class="ui-button wide danger" data-action="reset">Start completely over</button>`);
  }

  /* ---------- actions ---------- */
  const QUIET = ['travel', 'pad', 'unpad', 'milk', 'start'];
  function perform(action, value, extra, target) {
    const result = G.act(state, action, value, extra);
    if (!result.ok) { toast(result.message); return result; }
    if (action === 'start') {
      state.tutorial = value === 'tutorial' ? 'first-sale' : 'off';
      guideHidden = false;
    }
    if ((action === 'sell' || action === 'sellAll') && state.tutorial === 'first-sale') {
      state.tutorial = 'markets';
      closeDialog();
    }
    if (action === 'send' && state.scene === 'ship') launchPod(result.detail);
    if (action === 'sell' || action === 'sellAll') { float(`+${result.detail.coins} coins`, target); drinkQueue.push(...result.detail.sold.slice(-12)); drinkQueue.splice(0, Math.max(0, drinkQueue.length - 16)); }
    if (action === 'buyCow') float('+1 cow', target);
    if (action === 'buyItem' || action === 'shipUpgrade') float('✓', target);
    if (action === 'upgrade') { selectedItem = null; float('★ ' + cowName(result.detail.type), target); }
    if (action === 'travel') { ufo.queued = false; ufo.keys.clear(); if (dialogOpen()) closeDialog(); }
    render();
    if (!QUIET.includes(action)) toast(result.message); else $('announcement').textContent = result.message || LOCATIONS[state.scene][0];
    save();
    return result;
  }
  function openStand(kind) {
    if (state.tutorial === 'markets') { state.tutorial = 'overview'; save(); }
    builders[kind]();
  }
  function clickAction(el) {
    const action = el.dataset.action, value = el.dataset.value, extra = el.dataset.extra;
    const id = Number(value);
    switch (action) {
      case 'menu': return menu();
      case 'close-dialog': return closeDialog();
      case 'inventory': return inventory();
      case 'cow-storage': return cowStorage();
      case 'stand': return openStand(value);
      case 'finish-tutorial':
        state.tutorial = 'done'; render(); save(); return;
      case 'toggle-guide':
        guideHidden = !guideHidden;
        try { localStorage.setItem('moo-guide-hidden', guideHidden ? '1' : '0'); } catch { /* ignore */ }
        return render();
      case 'select-item': selectedItem = selectedItem === value ? null : value; return cowStorage();
      case 'card-cow':
        if (!selectedItem) return toast('Pick an upgrade item first, or drag one onto the cow.');
        return perform('upgrade', id, selectedItem, el);
      case 'pod': {
        if (state.pad === null) return toast('Drag a cow onto the return chute, or put one on the milking pad first.');
        return perform('send', state.pad, undefined, el);
      }
      case 'pad': case 'send': return perform(action, id, undefined, el);
      case 'sell': return perform('sell', value, extra === 'all' ? 'all' : Number(extra), el);
      case 'import': return $('import-file').click();
      case 'confirm-import':
        if (!pendingImport) return;
        state = pendingImport; pendingImport = null;
        G.offline(state); lastTick = Date.now(); resetVisuals(); lastNotice = state.noticeId;
        closeDialog(); render(); save(); return toast('Your dairy backup is restored.');
      case 'fullscreen': {
        const request = document.fullscreenElement ? document.exitFullscreen() : $('world').requestFullscreen?.();
        return request?.catch(() => toast('Fullscreen is unavailable in this browser.'));
      }
      case 'export': {
        save(); const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'moo-ving-dairy-save.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        return toast('Your dairy backup is downloaded.');
      }
      case 'reset':
        pendingReset = true;
        return openDialog('reset', 'ONE LAST CHECK', '<h2 id="dialog-title">A completely fresh start?</h2><p>This clears your dairy on this device. You can save a backup from the field guide first.</p><div class="menu-actions"><button class="ui-button" data-action="menu">Keep my dairy</button><button class="ui-button danger" data-action="confirm-reset">Start over</button></div>');
      case 'confirm-reset':
        if (!pendingReset) return;
        state = G.createGame(); resetVisuals(); lastNotice = 0; closeDialog(); save(); return render();
      default: return perform(action, value, undefined, el); // travel, start, milk, unpad, sellAll, buyCow, buyItem, shipUpgrade
    }
  }
  function resetVisuals() {
    if (state.tutorial === 'overview') state.tutorial = 'markets';
    for (const v of field.values()) v.el.remove();
    field.clear(); shipSig = ''; targetId = null; beaming = false; selectedItem = null;
    ufo.queued = false; ufo.keys.clear();
    clearTimeout(launchTimer); clearTimeout(flightTimer);
    $('pod').classList.remove('launch'); $('mini-pod').classList.remove('fly');
    $('chute-passenger').innerHTML = '';
  }

  /* ---------- drag and drop (cows to pad/pod, items onto cows) ---------- */
  const drag = { el: null, kind: '', value: '', x0: 0, y0: 0, active: false, ghost: null, over: null };
  const accepts = (kind, target) => target && (kind === 'cow' ? ['pad', 'pod', 'storage'].includes(target.dataset.drop) : target.dataset.drop === 'cow');
  function dropTarget(x, y) { return document.elementFromPoint(x, y)?.closest('[data-drop]') || null; }
  function startDrag() {
    drag.active = true;
    const source = drag.el.querySelector('.cow-art, .item-icon') || drag.el, r = source.getBoundingClientRect();
    drag.ghost = document.createElement('div'); drag.ghost.className = 'drag-ghost' + (drag.el.classList.contains('ship-cow') ? ' hologram' : '');
    drag.ghost.style.width = r.width + 'px'; drag.ghost.style.height = r.height + 'px';
    drag.ghost.append(source.cloneNode(true));
    (dialogOpen() ? $('world-dialog') : $('world')).append(drag.ghost);
    document.body.classList.add('dragging', 'drag-' + drag.kind);
    drag.el.classList.add('drag-source');
    if (drag.kind === 'item') { selectedItem = drag.value; }
  }
  function endDrag() {
    drag.ghost?.remove(); drag.over?.classList.remove('drop-hover');
    drag.el?.classList.remove('drag-source');
    document.body.classList.remove('dragging', 'drag-cow', 'drag-item');
    Object.assign(drag, { el: null, active: false, ghost: null, over: null });
  }
  document.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    // UI takes priority over steering and any pending click-to-beam command.
    if (e.target.closest('[data-action], dialog, input, a')) { ufo.queued = false; ufo.keys.clear(); }
    const src = e.target.closest('[data-drag]');
    if (src && !src.disabled) Object.assign(drag, { el: src, kind: src.dataset.drag, value: src.dataset.value, x0: e.clientX, y0: e.clientY, active: false });
    // Tapping or clicking the field flies the UFO there and beams once it arrives.
    if (state.started && state.scene === 'farm' && !dialogOpen() && e.target.closest('#stage') && !e.target.closest('button')) {
      ufo.target = clamp(stageX(e.clientX), 5, 95); ufo.queued = true;
    }
  });
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && state.started && state.scene === 'farm' && !dialogOpen() && !beaming && e.target.closest('#stage') && !e.target.closest('[data-action]')) ufo.target = clamp(stageX(e.clientX), 5, 95);
    if (!drag.el) return;
    if (!drag.active) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 7) return; startDrag(); }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    const t = dropTarget(e.clientX, e.clientY), ok = accepts(drag.kind, t) ? t : null;
    if (ok !== drag.over) { drag.over?.classList.remove('drop-hover'); ok?.classList.add('drop-hover'); drag.over = ok; }
  });
  document.addEventListener('pointerup', e => {
    if (!drag.el) return;
    if (!drag.active) { drag.el = null; return; }
    const { kind, value } = drag, t = drag.over;
    endDrag();
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (!t) return;
    const zone = t.dataset.drop, id = Number(value);
    if (kind === 'cow' && zone === 'pad') perform('pad', id, undefined, t);
    else if (kind === 'cow' && zone === 'pod') perform('send', id, undefined, t);
    else if (kind === 'cow' && zone === 'storage' && state.pad === id) perform('unpad', undefined, undefined, t);
    else if (kind === 'item' && zone === 'cow') perform('upgrade', Number(t.dataset.value), value, t);
  });
  document.addEventListener('pointercancel', endDrag);

  document.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    ufo.queued = false;
    clickAction(el);
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !state.started) return;
    // Let focused controls handle native Space/Enter activation before game shortcuts.
    if ([' ', 'Spacebar', 'Enter'].includes(event.key) && event.target.closest('button, input, select, textarea, a')) return;
    if (dialogOpen()) { if (event.key.toLowerCase() === 'i' && dialog === 'inventory') { event.preventDefault(); closeDialog(); } return; }
    const k = event.key;
    if (['1', '2', '3'].includes(k)) { event.preventDefault(); perform('travel', G.SCENES[Number(k) - 1]); return; }
    if (k.toLowerCase() === 'i') { event.preventDefault(); inventory(); return; }
    if (state.scene === 'ship' && k.toLowerCase() === 'm') { event.preventDefault(); perform('milk', undefined, undefined, $('milk-button')); return; }
    if (state.scene !== 'farm') return;
    if (k === 'ArrowLeft' || k === 'a') { event.preventDefault(); ufo.keys.add('left'); }
    else if (k === 'ArrowRight' || k === 'd') { event.preventDefault(); ufo.keys.add('right'); }
    else if (k === ' ' || k === 'Spacebar') { event.preventDefault(); if (!event.repeat) tryBeam(); }
  });
  document.addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft' || event.key === 'a') ufo.keys.delete('left');
    if (event.key === 'ArrowRight' || event.key === 'd') ufo.keys.delete('right');
  });
  window.addEventListener('blur', () => ufo.keys.clear());
  document.addEventListener('change', async event => {
    if (event.target.id !== 'import-file') return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1000000) { toast('That backup is too large. Choose a dairy save under 1 MB.'); return; }
    try {
      const restored = G.restore(await file.text());
      if (!restored) { toast('That file is not a compatible dairy save.'); return; }
      pendingImport = restored;
      openDialog('import', 'RESTORE YOUR DAIRY', `<h2 id="dialog-title">Pick up where you left off?</h2><p>This backup has ${compact(restored.coins)} coins and ${restored.field.length + restored.ship.length} cows. Restoring it replaces the current dairy on this device.</p><div class="menu-actions"><button class="ui-button" data-action="close-dialog">Keep this dairy</button><button class="ui-button" data-action="confirm-import">Restore backup</button></div>`);
    } catch { toast('This backup could not be read. Try another save file.'); }
  });
  $('world-dialog').addEventListener('close', () => {
    dialog = ''; pendingReset = false; pendingImport = null; selectedItem = null; endDrag();
    if (state.tutorial === 'overview') { state.tutorial = 'done'; save(); }
    renderTutorial();
  });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  /* ---------- boot ---------- */
  let away;
  try { state = G.restore(localStorage.getItem(KEY)); } catch { storageOK = false; }
  if (state) { lastNotice = state.noticeId; away = G.offline(state); lastNotice = state.noticeId; }
  else state = G.createGame();
  if (state.tutorial === 'overview') state.tutorial = 'markets';
  makeCats(); render(); save();
  if (window.MOO_CONFIG_ERROR) {
    console.error(window.MOO_CONFIG_ERROR);
    setTimeout(() => toast('⚠ game_config.yaml has a mistake, so the game is using the last good settings. ' + window.MOO_CONFIG_ERROR.split('\n').slice(1, 3).join(' ').replace(/•/g, '').trim()), 300);
  } else if (away && away.seconds >= 30 && state.started) toast(`Welcome back! ${Math.floor(away.seconds / 60)} min passed. Your cows had a lovely rest.`);
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    window.MooScenery?.frame(state.scene, now);
    if (state.scene === 'farm') { if (state.started) moveUfo(dt); wander(now); }
    else if (state.scene === 'ship') shipFrame(now);
    else catsFrame(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setInterval(() => {
    const now = Date.now(), elapsed = Math.max(0, (now - lastTick) / 1000); lastTick = now;
    G.advance(state, elapsed); render();
    if (now - lastSave >= 5000) save();
  }, 250);
})();
