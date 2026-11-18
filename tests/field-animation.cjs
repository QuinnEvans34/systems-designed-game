/* Pixel and timing regressions for the four field animation defects.
   Start the server; use PLAYWRIGHT_MODULE for an existing Playwright install. */
const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1672,height:941},recordVideo:{dir:path.resolve('test-results/field-motion'),size:{width:1672,height:941}}});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(process.env.GAME_URL || 'http://localhost:4173');
    await page.locator('[data-action="start"]:not([data-value])').click();
    await page.waitForFunction(()=>window.MooFieldAnimation);
    // Measure the real game's renderer against rAF, rather than a synthetic
    // loop that could pass even if the live game were still throttled to 20fps.
    const cadence=await page.evaluate(async()=>{
      let paints=0,raf=0;
      const method=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...args){
        if(this.canvas.id==='farm-scenery' && args.length===3 && args[0].width===238)paints++;
        return method.apply(this,args);
      };
      await new Promise(resolve=>{
        const start=performance.now();
        function tick(now){raf++;if(now-start>1000)resolve();else requestAnimationFrame(tick);}
        requestAnimationFrame(tick);
      });
      CanvasRenderingContext2D.prototype.drawImage=method;
      return {paints,raf};
    });
    assert.ok(cadence.paints>=cadence.raf*.85,`field renders at animation-frame cadence: ${JSON.stringify(cadence)}`);
    await page.addStyleTag({content:'.world > :not(#stage), #ufo, #field-cows, #farm-tag {visibility:hidden!important}'});
    const result=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=1672;canvas.height=941;canvas.className='scenery';
      const s={canvas,ctx:canvas.getContext('2d')};await MooFieldAnimation.prepare(s);
      window.fieldReview=s;document.getElementById('farm-scenery').replaceWith(canvas);
      const draw=t=>MooFieldAnimation.draw(s,t);
      const pixels=(x,y,w,h)=>s.ctx.getImageData(x,y,w,h).data;
      const same=(a,b)=>a.every((v,i)=>v===b[i]);
      // The old rotor's complete perimeter must reveal the clean sky, including
      // antialiased pixels beyond the former blades' black outlines.
      draw(0);
      const sky=s.field.sky.getContext('2d').getImageData(1238,397,116,90).data;
      const actual=pixels(1238,397,116,90);
      let rotorNoise=0;
      for(let y=0;y<90;y++)for(let x=0;x<116;x++){
        const radius=Math.hypot(x+1238-1296,y+397-455);
        if(radius<44||radius>53||y+397>480)continue;
        const i=(y*116+x)*4;
        if([0,1,2].some(k=>Math.abs(actual[i+k]-sky[i+k])>1))rotorNoise++;
      }
      // Force a bright cloud to pass across the complete right canopy. Opaque
      // leaf interiors must be identical with and without a cloud behind them.
      const clouds=s.field.cloudSprites;s.field.cloudSprites=[];draw(0);
      const baseline=pixels(1495,235,177,225);
      const white=document.createElement('canvas');white.width=1672;white.height=600;
      const wc=white.getContext('2d');wc.fillStyle='white';wc.fillRect(0,0,1672,600);
      s.field.cloudSprites=[{canvas:white,w:1672,h:600,x:0,y:0,speed:0}];draw(0);
      const clouded=pixels(1495,235,177,225);
      let leafPixels=0,treeLeaks=0;
      const green=i=>baseline[i+1]>baseline[i]*1.08&&baseline[i+1]>baseline[i+2]*1.15&&baseline[i+1]>50;
      for(let y=1;y<224;y++)for(let x=1;x<176;x++){
        const i=(y*177+x)*4;
        if(![i,i-4,i+4,i-177*4,i+177*4].every(green))continue;
        leafPixels++;if([0,1,2].some(k=>Math.abs(baseline[i+k]-clouded[i+k])>2))treeLeaks++;
      }
      s.field.cloudSprites=clouds;
      // Inspect actual rendered cloud pixels at 60Hz. The intensity centroid
      // must move a fraction of a pixel each frame, with no whole-pixel jumps.
      const centroids=[];
      for(let frame=0;frame<8;frame++){
        draw(frame/60);const data=pixels(470,20,300,120);let total=0,weighted=0;
        for(let y=0;y<120;y++)for(let x=0;x<300;x++){
          const i=(y*300+x)*4,weight=Math.max(0,data[i]-130);
          total+=weight;weighted+=weight*x;
        }
        centroids.push(weighted/total);
      }
      const steps=centroids.slice(1).map((x,i)=>x-centroids[i]);
      // Flower roots and the adjacent fence/daisy remain fixed while the top
      // blossom moves. This rejects shifting a patch containing its background.
      draw(1.8);const rootA=pixels(28,865,1,1),backgroundA=pixels(108,745,30,35);
      const headCentre=()=>{const a=pixels(65,682,60,31);let mass=0,sum=0;
        for(let y=0;y<31;y++)for(let x=0;x<60;x++){const i=(y*60+x)*4;
          if(a[i]>180&&a[i+1]>95&&a[i+2]>95&&a[i]>a[i+1]*1.06){sum+=x;mass++;}}
        return sum/mass;};
      const tipA=headCentre();draw(5.5);const tipB=headCentre();
      return {rotorNoise,leafPixels,treeLeaks,steps,rootsFixed:same(rootA,pixels(28,865,1,1)),backgroundFixed:same(backgroundA,pixels(108,745,30,35)),flowerTravel:Math.abs(tipB-tipA)};
    });
    assert.equal(result.rotorNoise,0,'clean sky behind every old blade edge');
    assert.ok(result.leafPixels>5000);
    assert.equal(result.treeLeaks,0,'clouds remain behind the opaque tree canopy');
    assert.ok(result.steps.every(step=>step>.025&&step<.15),`continuous subpixel cloud travel: ${result.steps}`);
    assert.equal(result.rootsFixed,true,'flower stems stay anchored');
    assert.equal(result.backgroundFixed,true,'grass and fence pixels do not shimmer with the flowers');
    assert.ok(result.flowerTravel>5,`flower head follows its bending stem: ${result.flowerTravel}`);
    // Save a real-time recording and representative full-resolution frames.
    await page.evaluate(async()=>{
      await new Promise(resolve=>{const start=performance.now();function frame(now){
        MooFieldAnimation.draw(fieldReview,(now-start)/1000);
        if(now-start<6500)requestAnimationFrame(frame);else resolve();
      }requestAnimationFrame(frame);});
    });
    for(const t of [0,2,5]){
      await page.evaluate(t=>MooFieldAnimation.draw(fieldReview,t),t);
      await page.screenshot({path:path.resolve('test-results',`field-fixed-${t}.png`)});
    }
    assert.deepEqual(errors,[]);
    console.log('Field animation regressions passed:',JSON.stringify({cadence,...result}));
    const video=page.video();await context.close();
    await video.saveAs(path.resolve('test-results/field-animation.webm'));
    fs.writeFileSync(path.resolve('test-results/field-animation-checks.json'),JSON.stringify({cadence,...result},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
