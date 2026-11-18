/* Offline art preparation. Runtime only loads PNGs: no pixel readback, including
   file:// play. Keep source art so the atlas and star layers are reproducible. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.GAME_URL || 'http://localhost:4173');
    const output = await page.evaluate(async () => {
      const W = 1672, H = 941;
      const surface = (w = W, h = H) => Object.assign(document.createElement('canvas'), { width:w, height:h });
      const load = async file => { const img = new Image(); img.src = 'assets/' + file; await img.decode(); return img; };
      const ship = await load('InShipBg-return-chute.png');
      const market = await load('scenery/market-painted.png');
      const flowers = await load('FieldBg.png');
      const results = {};
      const starSpecs = {
        ship:[[463,247,13],[408,296,12],[615,345,14],[642,279,7],[648,397,6],[1029,254,13],[1052,280,8],[1083,237,7],[1042,334,7],[1061,386,13]],
        market:[[392,157,13],[419,130,9],[551,170,14],[531,197,8],[646,92,6],[742,79,9],[760,114,9],[866,99,15],[909,140,12],[915,80,9],[877,168,9],[1329,177,12],[1302,167,7],[1505,185,10]]
      };
      for (const [name,img] of [['ship',ship],['market',market]]) {
        const base=surface(), ctx=base.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0,W,H);
        const pixels=ctx.getImageData(0,0,W,H), original=new Uint8ClampedArray(pixels.data);
        const stars=surface(), starCtx=stars.getContext('2d'), atlas=starCtx.createImageData(W,H);
        for (const [cx,cy,radius] of starSpecs[name]) {
          // Extract the actual painted star, including its antialiasing, rather
          // than drawing another plus on top. Interpolate its tiny sky footprint.
          const mask=new Set();
          for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
            const i=(y*W+x)*4;
            if(original[i]>180 && original[i+1]>170 && original[i+2]>100) mask.add(y*W+x);
          }
          const expanded=new Set(mask);
          for(const p of mask)for(const d of [-W,W,-1,1])expanded.add(p+d);
          for(const p of expanded){
            const x=p%W,y=Math.floor(p/W),i=p*4;
            let left=x-1,right=x+1;
            while(expanded.has(y*W+left))left--;
            while(expanded.has(y*W+right))right++;
            const u=(x-left)/(right-left), bg=[];
            for(let k=0;k<3;k++)bg[k]=Math.round(original[(y*W+left)*4+k]*(1-u)+original[(y*W+right)*4+k]*u);
            // Store the whole original pixel; the transparent atlas preserves
            // the painted silhouette without a mismatched procedural star.
            atlas.data.set(original.subarray(i,i+4),i);
            for(let k=0;k<3;k++)pixels.data[i+k]=bg[k];
          }
        }
        ctx.putImageData(pixels,0,0); starCtx.putImageData(atlas,0,0);
        results[name+'-ambient-base']=base; results[name+'-stars']=stars;
      }
      // Keep the painting's original daisies; pink flowers use complete,
      // isolated artwork rather than clipping petals out of the landscape.
      const source=surface(flowers.width,flowers.height), sc=source.getContext('2d',{willReadFrequently:true}); sc.drawImage(flowers,0,0);
      const src=sc.getImageData(0,0,source.width,source.height).data;
      const atlas=surface(192,128), ac=atlas.getContext('2d'), atlasPixels=ac.createImageData(192,128);
      const crops=[[45,707,54,49,73,737],[33,744,54,47,61,775],[73,684,36,44,92,706],
        [558,844,56,53,585,869],[1064,845,56,52,1092,871],[56,792,48,40,84,814]];
      crops.forEach(([left,top,w,h,anchorX,anchorY],cell)=>{
        if(cell!==3&&cell!==4)return;
        const core=new Uint8Array(w*h), mask=new Uint8Array(w*h);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=((top+y)*W+left+x)*4,r=src[i],g=src[i+1],b=src[i+2];
          core[y*w+x]=r>185&&g>165&&b>115;
        }
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const p=y*w+x,i=((top+y)*W+left+x)*4;
          if(core[p]) { mask[p]=1;continue; }
          if(Math.max(src[i],src[i+1],src[i+2])>95)continue;
          for(let dy=-5;dy<=5&&!mask[p];dy++)for(let dx=-5;dx<=5;dx++){
            if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&core[(y+dy)*w+x+dx]) {mask[p]=1;break;}
          }
        }
        // Fill enclosed pixels, preserving solid petals and centres.
        const exterior=new Uint8Array(w*h),queue=[];
        const seed=p=>{if(!mask[p]&&!exterior[p]){exterior[p]=1;queue.push(p);}};
        for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}
        for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
        for(let j=0;j<queue.length;j++){
          const p=queue[j],x=p%w;
          for(const n of [x?p-1:-1,x<w-1?p+1:-1,p-w,p+w])if(n>=0&&n<w*h)seed(n);
        }
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          if(!mask[y*w+x]&&exterior[y*w+x])continue;
          const i=((top+y)*W+left+x)*4;
          const dx=cell%3*64+32+left+x-anchorX,dy=Math.floor(cell/3)*64+32+top+y-anchorY;
          atlasPixels.data.set(src.subarray(i,i+4),(dy*192+dx)*4);
        }
      });
      ac.putImageData(atlasPixels,0,0);
      const repaired=await load('scenery/flower-heads-repaired-source.png');
      const sheet=surface(repaired.width,repaired.height),sheetCtx=sheet.getContext('2d',{willReadFrequently:true});
      sheetCtx.drawImage(repaired,0,0);
      const cellW=repaired.width/3,cellH=repaired.height/2;
      for(const cell of [0,1,2,5]){
        const pixels=sheetCtx.getImageData(cell%3*cellW,Math.floor(cell/3)*cellH,cellW,cellH);
        let left=cellW,top=cellH,right=0,bottom=0;
        for(let y=0;y<cellH;y++)for(let x=0;x<cellW;x++){
          const i=(y*cellW+x)*4;
          // Discard the source's soft fringe, keeping solid pixel silhouettes.
          const opaque=pixels.data[i+3]>=128;
          pixels.data[i+3]=opaque?255:0;
          if(opaque){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
        }
        const sprite=surface(cellW,cellH);sprite.getContext('2d').putImageData(pixels,0,0);
        const [, ,maxW,maxH]=crops[cell],w=right-left+1,h=bottom-top+1;
        const scale=Math.min(maxW/w,maxH/h),dw=Math.round(w*scale),dh=Math.round(h*scale);
        ac.imageSmoothingEnabled=false;
        ac.drawImage(sprite,left,top,w,h,cell%3*64+Math.floor((64-dw)/2),Math.floor(cell/3)*64+Math.floor((64-dh)/2),dw,dh);
      }
      results['field-flower-heads']=atlas;
      return Object.fromEntries(Object.entries(results).map(([name,c])=>[name,c.toDataURL().split(',')[1]]));
    });
    for(const [name,data] of Object.entries(output))fs.writeFileSync(path.resolve('assets/scenery',name+'.png'),Buffer.from(data,'base64'));
    console.log('Prepared ambient layers:',Object.keys(output).join(', '));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
