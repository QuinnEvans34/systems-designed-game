/* Asset preparation only. The game loads the resulting PNG layers directly,
   so animations also work from file:// without canvas pixel readback. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.GAME_URL || 'http://localhost:4173');
    const layers = await page.evaluate(async () => {
      const W = 1672, H = 941;
      const load = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
      const [original, clean] = await Promise.all([load('assets/FieldBg.png'), load('assets/scenery/field-ground-clean.png')]);
      const surface = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const src = surface(), source = src.getContext('2d', { willReadFrequently: true });
      source.drawImage(original, 0, 0, W, H);
      const originalPixels = source.getImageData(0, 0, W, H);
      const data = originalPixels.data;
      const world = surface(), ctx = world.getContext('2d');
      ctx.drawImage(original, 0, 0, W, H);
      // Use the clean plate only behind the four moving plants. A soft boundary
      // joins the restored grass/fence to the original, unchanged painting.
      const restored=surface(), restoredCtx=restored.getContext('2d');
      restoredCtx.drawImage(clean,0,0,W,H);
      const ground=restoredCtx.getImageData(0,0,W,H), base=ctx.getImageData(0,0,W,H);
      for(const [x,y,w,h] of [[13,680,103,189],[1554,680,101,197],[548,838,78,65],[1055,838,78,65]]){
        for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++){
          const i=((y+cy)*W+x+cx)*4;
          const alpha=Math.min(1,Math.min(cx,cy,w-1-cx,h-1-cy)/6);
          for(let k=0;k<3;k++)base.data[i+k]=Math.round(base.data[i+k]*(1-alpha)+ground.data[i+k]*alpha);
        }
      }
      ctx.putImageData(base,0,0);
      const foreground = ctx.getImageData(0, 0, W, H);
      const cloudRects = [[480,27,238,103],[1367,30,282,136],[1120,125,92,41],[1291,165,80,40],[258,146,76,40],[236,194,264,103],[513,311,79,34],[1342,345,186,86],[623,462,170,56],[1018,461,148,53],[5,217,158,77],[1535,455,137,42],[0,395,48,40]];
      const candidates = new Uint8Array(W * H), sky = new Uint8Array(W * H), queue = new Int32Array(W * H);
      let tail = 0;
      for (let y = 0; y < 600; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x, i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        const blue = b > 205 && b > g * 1.035 && b > r * 1.14 && g > 135;
        const cloud = r > 145 && g > 175 && b > 165 && cloudRects.some(([cx,cy,cw,ch]) => x >= cx && x < cx + cw && y >= cy && y < cy + ch);
        if (blue || cloud) candidates[p] = 1;
        // Seeding all blue sky also clears sky visible through tree branches.
        if (blue) { sky[p] = 1; queue[tail++] = p; }
      }
      for (let head = 0; head < tail; head++) {
        const p = queue[head], x = p % W;
        for (const n of [x ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
          if (n < 0 || n >= W * H || !candidates[n] || sky[n]) continue;
          sky[n] = 1; queue[tail++] = n;
        }
      }
      for (let p = 0; p < W * H; p++) if (sky[p]) foreground.data[p * 4 + 3] = 0;
      // Remove the complete original rotor, including antialiased edge pixels.
      // Nothing sampled from a neighbouring piece of scenery is painted here.
      for (let y = 396; y < 512; y++) for (let x = 1238; x < 1354; x++) {
        if (Math.hypot(x - 1296, y - 455) < 55) foreground.data[(y * W + x) * 4 + 3] = 0;
      }
      const treeLeft = surface(336, 290), treeRight = surface(182, 344);
      const left = treeLeft.getContext('2d').createImageData(336,290), right = treeRight.getContext('2d').createImageData(182,344);
      for (let y = 0; y < 534; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const isLeft = x < 336 && y < 290;
        const isRight = x >= 1490 && y >= 190 && (y < 470 || x > 1635 && y < 531);
        if (!isLeft && !isRight) continue;
        const dst = isLeft ? left : right, j = isLeft ? (y * 336 + x) * 4 : ((y - 190) * 182 + x - 1490) * 4;
        dst.data.set(foreground.data.subarray(i, i + 4), j);
        foreground.data[i + 3] = 0;
      }
      treeLeft.getContext('2d').putImageData(left,0,0); treeRight.getContext('2d').putImageData(right,0,0);
      ctx.putImageData(foreground, 0, 0);
      // Trace only the near fence/foliage silhouette, leaving pasture above it
      // transparent. This layer belongs in front of the walking herd.
      const near=surface(),nearCtx=near.getContext('2d');
      const outlines=[
        [[0,751],[12,780],[26,788],[146,807],[150,781],[169,767],[190,767],[208,782],[211,815],[351,838],[354,821],[379,809],[397,813],[416,830],[417,877],[440,869],[464,866],[479,879],[480,900],[503,902],[522,924],[540,941]],
        [[1119,941],[1145,914],[1142,880],[1166,877],[1186,886],[1198,861],[1223,860],[1243,877],[1248,834],[1264,813],[1286,811],[1304,822],[1309,840],[1457,811],[1460,782],[1478,765],[1500,765],[1517,779],[1520,807],[1636,791],[1650,769],[1671,754]]
      ];
      nearCtx.beginPath();
      for(const points of outlines){
        nearCtx.moveTo(...points[0]);
        // Snap the guide to each native dark contour, rather than leaving a
        // triangular strip of grass over a cow at a sloping rail edge.
        for(let j=1;j<points.length;j++){
          const [ax,ay]=points[j-1],[bx,by]=points[j];
          for(let x=ax;x<=bx;x++){
            const guide=ay+(by-ay)*(x-ax)/Math.max(1,bx-ax);
            let edge=Math.round(guide);
            for(let y=Math.max(0,edge-9);y<=Math.min(H-1,edge+9);y++){
              const i=(y*W+x)*4;
              if(Math.max(foreground.data[i],foreground.data[i+1],foreground.data[i+2])<65){edge=y;break;}
            }
            nearCtx.lineTo(x,edge);
          }
        }
        nearCtx.lineTo(points.at(-1)[0],H);nearCtx.lineTo(points[0][0],H);nearCtx.closePath();
      }
      nearCtx.clip();nearCtx.drawImage(world,0,0);
      const clouds = surface(), cloudCtx = clouds.getContext('2d'), atlas = cloudCtx.createImageData(W, H);
      for (const [x,y,w,h] of cloudRects.slice(0,10)) {
        const alpha = new Float32Array(w * h), seen = new Uint8Array(w * h);
        for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
          const i = ((y + cy) * W + x + cx) * 4;
          const bg = (Math.min(y + cy, 515) * W + 900) * 4;
          alpha[cy * w + cx] = data[i + 1] > 175 && data[i + 2] > 175 ? Math.max(0, Math.min(1, (data[i] - data[bg] - 12) / 40)) : 0;
        }
        for (let start = 0; start < w * h; start++) {
          if (seen[start] || alpha[start] < .08) continue;
          const component = [start]; seen[start] = 1;
          for (let cursor = 0; cursor < component.length; cursor++) {
            const p = component[cursor], cx = p % w;
            for (const n of [cx ? p-1 : -1, cx<w-1 ? p+1 : -1,p-w,p+w]) if(n>=0 && n<w*h && !seen[n] && alpha[n]>=.08) { seen[n]=1;component.push(n); }
          }
          if (component.length < 40) continue;
          for (const p of component) {
            const cx = p % w, cy = Math.floor(p / w), i = ((y+cy)*W+x+cx)*4;
            const bg = ((y+cy)*W+900)*4, a = alpha[p];
            for(let k=0;k<3;k++) atlas.data[i+k] = Math.max(0,Math.min(255,(data[i+k]-data[bg+k]*(1-a))/a));
            atlas.data[i+3] = Math.round(a*255);
          }
        }
      }
      cloudCtx.putImageData(atlas,0,0);
      // Blossom sprites are prepared separately by build-ambient-art.cjs.
      return Object.fromEntries(Object.entries({ 'field-world':world,'field-foreground':near,'field-clouds':clouds,'field-tree-left':treeLeft,'field-tree-right':treeRight }).map(([name,c])=>[name,c.toDataURL('image/png').split(',')[1]]));
    });
    for(const [name,bytes] of Object.entries(layers)) fs.writeFileSync(path.resolve('assets/scenery',name+'.png'),Buffer.from(bytes,'base64'));
    console.log('Prepared field layers:',Object.keys(layers).join(', '));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
