/* Rendered regressions for twinkling stars, the passing train, boiling milk,
   and opaque flower sprites. Run against the local server with Playwright. */
const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1672,height:941}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    // Freeze only the app clock; exercise the actual public scenery renderer
    // at deterministic 60Hz without adding a production-only test API.
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto(process.env.GAME_URL || 'http://localhost:4173');
    await page.waitForLoadState('networkidle');
    const result=await page.evaluate(async()=>{
      let now=0;
      const frame=scene=>MooScenery.frame(scene,now+=1000/60);
      const advance=(scene,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)frame(scene);};
      const ctx=scene=>document.querySelector('#'+scene+'-scenery').getContext('2d');
      const pixels=(scene,x,y,w,h)=>ctx(scene).getImageData(x,y,w,h).data;
      const equal=(a,b)=>a.every((v,i)=>v===b[i]);
      const mean=(scene,x,y)=>{const a=pixels(scene,x-2,y-2,5,5);return a.reduce((s,v,i)=>s+(i%4===0?v:0),0)/25;};
      const range=a=>Math.max(...a)-Math.min(...a);
      const starRanges={};
      for(const [scene,positions] of [['ship',[[463,247],[615,345]]],['market',[[551,170],[866,99]]]]){
        const brightness=positions.map(()=>[]);
        for(let i=0;i<90;i++){
          advance(scene,.1);positions.forEach(([x,y],j)=>brightness[j].push(mean(scene,x,y)));
        }
        starRanges[scene]=brightness.map(range);
      }
      advance('market',.1);
      const staticMarket=pixels('market',100,225,1450,700);
      const rail=pixels('market',1034,198,15,20);
      const marketBase=new Image();marketBase.src='assets/scenery/market-ambient-base.png';await marketBase.decode();
      const baseCanvas=document.createElement('canvas');baseCanvas.width=1672;baseCanvas.height=941;
      const baseCtx=baseCanvas.getContext('2d');baseCtx.drawImage(marketBase,0,0);
      const basePixels=baseCtx.getImageData(830,120,320,100).data;
      // Track only warm train windows, excluding the planet and the rail.
      const train=()=>{
        const a=pixels('market',830,120,320,100),mask=new Uint8Array(320*100);let n=0,sum=0;
        for(let y=0;y<100;y++)for(let x=0;x<320;x++){
          const i=(y*320+x)*4;
          if(a[i]>180&&a[i+1]>120&&a[i+2]<145&&[0,1,2].some(k=>Math.abs(a[i+k]-basePixels[i+k])>5)){n++;sum+=x;mask[y*320+x]=1;}
        }
        return {count:n,x:sum/n,mask};
      };
      for(let i=0;i<100&&train().count<200;i++)advance('market',.15);
      const trainA=train();advance('market',.5);const trainB=train();
      let trainTravel={overlap:0,x:0,y:0};
      for(let dy=-9;dy<=0;dy++)for(let dx=0;dx<=30;dx++){
        let overlap=0;
        for(let y=9;y<96;y++)for(let x=0;x<290;x++)if(trainA.mask[y*320+x]&&trainB.mask[(y+dy)*320+x+dx])overlap++;
        if(overlap>trainTravel.overlap)trainTravel={overlap,x:dx,y:dy};
      }
      delete trainA.mask;delete trainB.mask;
      const railFixed=equal(rail,pixels('market',1034,198,15,20));
      // Skip the tiny equipment scan/glow regions in the static market crop.
      const marketAfter=pixels('market',100,225,1450,700);let marketLeaks=0;
      for(let y=0;y<700;y++)for(let x=0;x<1450;x++){
        if(x+100>=570&&x+100<=625&&y+225>=410&&y+225<=465)continue;
        if(x+100>=895&&x+100<=935&&y+225>=430&&y+225<=475)continue;
        const i=(y*1450+x)*4;if([0,1,2,3].some(k=>staticMarket[i+k]!==marketAfter[i+k]))marketLeaks++;
      }
      const trainCounts=[];
      for(let i=0;i<55;i++){advance('market',1);trainCounts.push(train().count);}
      const shipOutside=pixels('ship',75,290,235,190);
      advance('ship',.1);const milkA=pixels('ship',108,367,171,84);
      advance('ship',1.3);const milkB=pixels('ship',108,367,171,84);
      let milkChanges=0;for(let i=0;i<milkA.length;i+=4)if(milkA[i]!==milkB[i]||milkA[i+1]!==milkB[i+1])milkChanges++;
      const shipAfter=pixels('ship',75,290,235,190);let tankLeaks=0;
      for(let y=0;y<190;y++)for(let x=0;x<235;x++){
        if(x+75>=104&&x+75<=285&&y+290>=308&&y+290<=457)continue;
        const i=(y*235+x)*4;if([0,1,2,3].some(k=>shipOutside[i+k]!==shipAfter[i+k]))tankLeaks++;
      }
      // Every blossom must be one connected silhouette with no enclosed holes,
      // no translucent fringe, and no clipping against its sprite-cell bounds.
      const img=new Image();img.src='assets/scenery/field-flower-heads.png';await img.decode();
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
      const c=canvas.getContext('2d');c.drawImage(img,0,0);const blossoms=[];
      for(let cell=0;cell<6;cell++){
        const a=c.getImageData(cell%3*64,Math.floor(cell/3)*64,64,64).data;
        const opaque=Array.from({length:4096},(_,p)=>a[p*4+3]===255),seen=new Set();let components=0,fringe=0,edge=0;
        const neighbours=p=>[p%64?p-1:-1,p%64<63?p+1:-1,p-64,p+64].filter(n=>n>=0&&n<4096);
        for(let p=0;p<4096;p++){
          if(a[p*4+3]!==0&&!opaque[p])fringe++;
          if(opaque[p]&&(p%64===0||p%64===63||p<64||p>=4032))edge++;
          if(!opaque[p]||seen.has(p))continue;components++;const queue=[p];seen.add(p);
          for(let j=0;j<queue.length;j++)for(const n of neighbours(queue[j]))if(opaque[n]&&!seen.has(n)){seen.add(n);queue.push(n);}
        }
        const exterior=new Set([0]),queue=[0];
        for(let j=0;j<queue.length;j++)for(const n of neighbours(queue[j]))if(!opaque[n]&&!exterior.has(n)){exterior.add(n);queue.push(n);}
        const holes=opaque.filter((v,p)=>!v&&!exterior.has(p)).length;
        blossoms.push({components,fringe,edge,holes});
      }
      return {starRanges,trainA,trainB,trainTravel,railFixed,marketLeaks,trainCounts,milkChanges,tankLeaks,blossoms};
    });
    fs.writeFileSync(path.resolve('test-results/ambient-art-checks.json'),JSON.stringify(result,null,2));
    for(const [scene,ranges] of Object.entries(result.starRanges))assert.ok(ranges.every(n=>n>70),`${scene} stars visibly dim and brighten: ${ranges}`);
    assert.ok(result.trainA.count>50&&result.trainB.count>50,'a real train sprite passes the window');
    assert.ok(result.trainTravel.x>=26&&result.trainTravel.x<=28&&result.trainTravel.y===-7,`train windows travel faster along the rail: ${JSON.stringify(result.trainTravel)}`);
    assert.ok(result.trainCounts.some(n=>n===0)&&result.trainCounts.some(n=>n>150),'train leaves a quiet interval between passes');
    assert.equal(result.railFixed,true);assert.equal(result.marketLeaks,0,'train never moves the window frame, stalls or walkway');
    assert.ok(result.milkChanges>600,'milk surface and bubbles animate together');
    assert.equal(result.tankLeaks,0,'tank rim, pipes and surrounding artwork stay fixed');
    for(const flower of result.blossoms)assert.deepEqual(flower,{components:1,fringe:0,edge:0,holes:0});
    assert.deepEqual(errors,[]);
    console.log('Ambient art regressions passed:',JSON.stringify(result));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
