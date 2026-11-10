/* Registered art layers keep stars, trains and liquid inside the painted props.
   Preparation happens offline: runtime also works without file:// pixel access. */
(() => {
  'use strict';
  const W = 1672, H = 941;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = {};
  let lastScene = '', dirty = true, sceneNow = null;
  const sceneTime = { farm:0, ship:0, market:0 };
  const surface = (w = W, h = H) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    return canvas;
  };
  function polygon(ctx, points) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  }
  const shipStars = [[463,247,13],[408,296,12],[615,345,14],[642,279,7],[648,397,6],[1029,254,13],[1052,280,8],[1083,237,7],[1042,334,7],[1061,386,13]];
  const marketStars = [[392,157,13],[419,130,9],[551,170,14],[531,197,8],[646,92,6],[742,79,9],[760,114,9],[866,99,15],[909,140,12],[915,80,9],[877,168,9],[1329,177,12],[1302,167,7],[1505,185,10]];
  function twinkle(ctx, atlas, stars, t) {
    stars.forEach(([x, y, r], i) => {
      // Independent long periods dim AND brighten the actual painted stars.
      // No extra crosses, synchronized flashes, or glow over window frames.
      ctx.globalAlpha = .28 + .72 * (.5 + .5 * Math.sin(t * (.72 + i % 4 * .13) + i * 2.399));
      ctx.drawImage(atlas,x-r-1,y-r-1,r*2+3,r*2+3,x-r-1,y-r-1,r*2+3,r*2+3);
    });
    ctx.globalAlpha = 1;
  }
  function milkSurface(x,t) {
    return 377 + Math.sin((x-105)*.061+t*1.7)*4 + Math.sin(x*.11-t*1.1)*1.7;
  }
  function bubble(ctx,x,y,r,alpha) {
    // Tiny stepped rings share the background's chunky pixel vocabulary.
    x=Math.round(x);y=Math.round(y);r=Math.round(r);
    ctx.globalAlpha=alpha;ctx.fillStyle='#d3ad8b';
    ctx.fillRect(x-r,y-r+2,2,r*2-3);ctx.fillRect(x+r-2,y-r+2,2,r*2-3);
    ctx.fillRect(x-r+2,y-r,r*2-4,2);ctx.fillRect(x-r+2,y+r-2,r*2-4,2);
    ctx.fillStyle='#fff5dc';ctx.fillRect(x-r+2,y-r,Math.max(2,r-1),2);ctx.fillRect(x-r,y-r+2,2,Math.max(2,r-1));
  }
  function drawTank(ctx,t) {
    ctx.save(); polygon(ctx,[[105,309],[279,309],[284,316],[284,452],[279,456],[105,456]]);ctx.clip();
    const glass=ctx.createLinearGradient(105,310,284,455);
    glass.addColorStop(0,'#315361');glass.addColorStop(1,'#366276');
    ctx.fillStyle=glass;ctx.fillRect(104,308,182,150);
    const milk=ctx.createLinearGradient(110,372,280,456);
    milk.addColorStop(0,'#ffe9cb');milk.addColorStop(.65,'#f8d8b9');milk.addColorStop(1,'#f0cba9');
    ctx.beginPath();ctx.moveTo(103,458);ctx.lineTo(103,milkSurface(103,t));
    for(let x=105;x<=287;x+=3)ctx.lineTo(x,Math.round(milkSurface(x,t)));
    ctx.lineTo(287,458);ctx.closePath();ctx.fillStyle=milk;ctx.fill();
    // Cream foam follows the same surface; there is no stationary old wave.
    ctx.beginPath();ctx.moveTo(103,milkSurface(103,t));
    for(let x=105;x<=287;x+=3)ctx.lineTo(x,Math.round(milkSurface(x,t)));
    ctx.strokeStyle='#fff7e4';ctx.lineWidth=7;ctx.lineJoin='round';ctx.stroke();
    for(let i=0;i<17;i++){
      const phase=(t*(.17+(i%4)*.018)+i*.618)%1;
      const x=118+(i*43%153)+Math.sin(t*1.3+i)*3;
      const surface=milkSurface(x,t),y=450-phase*(450-surface-5);
      bubble(ctx,x,y,3+(i%3)+phase,Math.min(1,phase*7)*.68);
    }
    // Small surface domes grow, collapse and leave a short foam ripple.
    for(let i=0;i<6;i++){
      const p=(t*.55+i*.371)%1,x=122+i*29,y=milkSurface(x,t);
      ctx.globalAlpha=Math.sin(p*Math.PI)*.8;
      ctx.strokeStyle='#fff8e8';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(x,y+1,2+p*5,Math.sin(p*Math.PI)*4,0,Math.PI,Math.PI*2);ctx.stroke();
    }
    // Vapour in the headspace, rather than milk bubbles floating above liquid.
    for(let i=0;i<4;i++){
      const p=(t*.18+i*.27)%1,x=121+i*45+Math.sin(t+i)*3;
      ctx.globalAlpha=Math.sin(p*Math.PI)*.35;ctx.fillStyle='#b8dfd8';
      ctx.fillRect(Math.round(x),Math.round(367-p*46),3,4);
    }
    // Fixed reflections belong to the glass, in front of all moving contents.
    ctx.globalAlpha=.85;ctx.fillStyle='#f2fff4';
    polygon(ctx,[[136,310],[146,307],[141,317],[141,345],[131,348],[131,318]]);ctx.fill();
    ctx.fillRect(153,307,7,25);ctx.fillRect(153,342,7,11);
    ctx.globalAlpha=.64;ctx.fillStyle='#fff9e9';
    polygon(ctx,[[132,389],[138,389],[138,432],[145,441],[136,441],[131,434]]);ctx.fill();
    ctx.fillRect(154,396,6,13);ctx.restore();
  }
  function prepareTrain() {
    const canvas=surface(314,36),ctx=canvas.getContext('2d');
    // Four individually outlined carriages and a rounded driving cab. This is
    // an independent sprite, not a sliding rectangle of the window painting.
    for(let i=0;i<4;i++){
      const x=i*77;
      ctx.fillStyle='#242744';polygon(ctx,[[x+4,4],[x+66,4],[x+74,12],[x+74,29],[x+3,29],[x,24],[x,11]]);ctx.fill();
      ctx.fillStyle='#737baf';polygon(ctx,[[x+5,7],[x+65,7],[x+70,13],[x+70,25],[x+4,25],[x+4,12]]);ctx.fill();
      ctx.fillStyle='#a0a0cd';ctx.fillRect(x+8,7,55,3);
      ctx.fillStyle='#484c7e';ctx.fillRect(x+4,25,66,4);
      ctx.fillStyle='#363a61';ctx.fillRect(x+9,12,54,12);
      for(let j=0;j<3;j++){
        ctx.fillStyle='#dc933c';ctx.fillRect(x+12+j*17,14,13,8);
        ctx.fillStyle='#ffce67';ctx.fillRect(x+13+j*17,14,11,5);
        ctx.fillStyle='#ffe5a0';ctx.fillRect(x+13+j*17,14,10,2);
      }
      ctx.fillStyle='#292e51';ctx.fillRect(x+13,29,10,3);ctx.fillRect(x+57,29,10,3);
      if(i<3){ctx.fillStyle='#333653';ctx.fillRect(x+74,19,4,6);}
    }
    ctx.fillStyle='#ffdf8b';ctx.fillRect(300,20,3,4);
    return canvas;
  }
  function drawTrain(ctx,train,t) {
    ctx.save();
    // Inner glass boundary; the train disappears behind the stone surround.
    // Trace the actual arch: the old inset diagonal sliced through carriage
    // roofs and windows well before the train reached the stone surround.
    polygon(ctx,[[829,59],[908,59],[968,68],[1022,83],[1067,103],[1103,130],[1130,160],[1151,192],[1158,211],[1143,222],[837,222],[830,212]]);ctx.clip();
    const distance=(t*54+220)%900-340;
    ctx.transform(1,-.259,0,1,864,220);
    ctx.drawImage(train,distance,-35);ctx.restore();
  }
  const lightPolygons = [
    [[249, 40], [285, 54], [311, 86], [294, 90], [247, 61]],
    [[320, 88], [381, 100], [380, 119], [320, 105]],
    [[405, 119], [503, 135], [503, 150], [408, 139]],
    [[568, 151], [662, 160], [662, 176], [568, 170]],
    [[1001, 155], [1094, 151], [1094, 166], [1002, 174]],
    [[1169, 121], [1264, 104], [1261, 124], [1169, 139]],
    [[1332, 77], [1421, 33], [1432, 49], [1338, 94]],
    [[660, 71], [696, 58], [922, 59], [992, 78], [990, 94], [922, 77], [697, 76], [661, 91]],
    [[672, 516], [720, 516], [720, 524], [672, 524]],
    [[996, 518], [1044, 518], [1044, 526], [996, 526]]
  ];
  function drawShip(s, t) {
    const ctx = s.ctx;
    ctx.drawImage(s.base, 0, 0);
    twinkle(ctx, s.stars, shipStars, t);
    for (let i = 0; i < lightPolygons.length; i++) {
      ctx.globalAlpha = .04 + .15 * (.5 + .5 * Math.sin(t * .7 - i * .7));
      ctx.fillStyle = '#ddfff1'; polygon(ctx, lightPolygons[i]); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawTank(ctx,t);
    // Repaint the hologram's glass and spin the bottle inside its fixed frame.
    ctx.save(); polygon(ctx, [[1180, 361], [1285, 361], [1297, 373], [1297, 497], [1285, 507], [1180, 507]]); ctx.clip();
    const screen = ctx.createLinearGradient(1175, 360, 1300, 510);
    screen.addColorStop(0, '#2e5666'); screen.addColorStop(1, '#387d82');
    ctx.fillStyle = screen; ctx.fillRect(1175, 360, 130, 150);
    const glow = .1 + .06 * Math.sin(t * 1.1);
    ctx.globalAlpha = glow; ctx.fillStyle = '#a6ffe0'; ctx.fillRect(1175, 360, 130, 150); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(1234, 436); ctx.scale(Math.cos(t * .45) * .78 + .22, 1);
    ctx.drawImage(s.bottle, -36, -60); ctx.restore();
    ctx.fillStyle = '#b2ffe2'; ctx.globalAlpha = .65;
    for (const [x, y] of [[1190, 383], [1280, 383], [1190, 493], [1280, 493]]) {
      ctx.fillRect(x - 2, y - 6, 4, 12); ctx.fillRect(x - 6, y - 2, 12, 4);
    }
    ctx.restore();
    // A slow orbit sells the rotation without flashing the whole display.
    ctx.save(); ctx.strokeStyle = '#aaffdf'; ctx.lineWidth = 3; ctx.globalAlpha = .6;
    ctx.beginPath(); ctx.ellipse(1236, 450, 93, 17, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d6ffec'; ctx.globalAlpha = .85;
    ctx.fillRect(1234 + Math.cos(t * .45) * 91, 448 + Math.sin(t * .45) * 17, 4, 4); ctx.restore();
  }
  function drawMarket(s, t) {
    const ctx = s.ctx;
    ctx.drawImage(s.base,0,0);
    twinkle(ctx,s.stars,marketStars,t);
    drawTrain(ctx,s.train,t);
    // Upgrade capsule: restrained moving scan bands, clipped to its glass.
    ctx.save(); ctx.beginPath(); ctx.rect(899, 435, 32, 35); ctx.clip();
    const y = 435 + (t * 9 % 35);
    const scan = ctx.createLinearGradient(0, y - 7, 0, y + 3);
    scan.addColorStop(0, '#9ffaff00'); scan.addColorStop(.8, '#c3ffff66'); scan.addColorStop(1, '#e7ffff00');
    ctx.fillStyle = scan; ctx.fillRect(899, y - 7, 32, 10);
    ctx.fillStyle = '#c3ffff88'; ctx.fillRect(901, y, 28, 1);
    ctx.restore();
    const pulse = .5 + .5 * Math.sin(t * 1.1);
    const glow = ctx.createRadialGradient(597, 436, 1, 597, 436, 24);
    glow.addColorStop(0, `rgba(139,255,250,${.12 + pulse * .25})`); glow.addColorStop(1, 'rgba(79,255,240,0)');
    ctx.fillStyle = glow; ctx.fillRect(573, 412, 48, 48);
    ctx.globalAlpha = .1 + pulse * .25; ctx.fillStyle = '#cbffed'; ctx.fillRect(593, 432, 8, 8); ctx.globalAlpha = 1;
  }
  const load = file => new Promise((resolve,reject) => {
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Missing scenery: '+file));img.src='assets/scenery/'+file+'.png';
  });
  for (const [name, file] of Object.entries({ farm: 'FieldBg.png', ship: 'InShipBg-return-chute.png', market: 'scenery/market-painted.png' })) {
    const canvas = document.getElementById(name + '-scenery');
    const s = scenes[name] = { canvas, ctx: canvas.getContext('2d'), img: new Image(), ready: false };
    s.ctx.imageSmoothingEnabled = false;
    s.img.onload = async () => {
      try {
        if (name === 'farm') await window.MooFieldAnimation.prepare(s);
        else [s.base,s.stars]=await Promise.all([load(name+'-ambient-base'),load(name+'-stars')]);
        if (name === 'market') s.train=prepareTrain();
        if (name === 'ship') {
          s.bottle = surface(72, 120);
          const ctx = s.bottle.getContext('2d');
          polygon(ctx, [[14, 2], [58, 2], [58, 22], [69, 42], [69, 108], [57, 119], [13, 119], [2, 108], [2, 42], [14, 22]]);
          ctx.clip(); ctx.drawImage(s.img, -1198, -376);
        }
        s.ready = true; dirty = true;
      } catch { s.canvas.hidden = true; }
    };
    s.img.src = 'assets/' + file;
  }
  motion.addEventListener('change', () => { dirty = true; });
  window.MooScenery = {
    frame(scene, now) {
      if (document.hidden) { sceneNow = null; return; }
      const changed = scene !== lastScene;
      if (!dirty && !changed && motion.matches) return;
      const s = scenes[scene]; if (!s?.ready) return;
      // Advance only the visible scene. Tab changes and returning from a hidden
      // browser never teleport a train or jump the surface of the milk.
      if (!changed && sceneNow !== null && now-sceneNow<120 && !motion.matches) sceneTime[scene]+=(now-sceneNow)/1000;
      sceneNow=motion.matches?null:now;
      if (motion.matches && scene !== 'farm') s.ctx.clearRect(0,0,W,H);
      else if (scene === 'farm') window.MooFieldAnimation.draw(s,motion.matches?0:sceneTime.farm);
      else if (scene === 'ship') drawShip(s,sceneTime.ship);
      else drawMarket(s,sceneTime.market);
      lastScene = scene; dirty = false;
    }
  };
})();
