/* Live DOM depth and foreground occlusion, with deterministic herd positions. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const G=require('../game/engine.js');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    fs.mkdirSync(path.resolve('test-results'),{recursive:true});
    const page=await browser.newPage({viewport:{width:1672,height:941}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const fixture=G.createGame(42);G.act(fixture,'start');fixture.coins=10000;
    G.act(fixture,'travel','market');
    while(fixture.field.length<5)assert.equal(G.act(fixture,'buyCow').ok,true);
    G.act(fixture,'travel','farm');
    fixture.bottles[G.TYPES[0]]=1;
    await page.addInitScript(s=>{
      localStorage.setItem('moo-ving-v3',JSON.stringify(s));
      window.requestAnimationFrame=()=>0;
      const positions=[[12,88],[40,66],[60,77],[88,88],[45,88]];
      const values=Array(8).fill(.5); // market cats are constructed first
      positions.forEach(([x,y])=>values.push((x-9)/82,(y-66)/22,.75,.5));
      Math.random=()=>values.length?values.shift():.5;
    },fixture);
    await page.goto(process.env.GAME_URL||'http://localhost:4173');
    await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.locator('.field-cow').first().evaluate(el=>getComputedStyle(el).transitionProperty.includes('transform')),'depth scale animates alongside movement');
    await page.addStyleTag({content:'.world > :not(#stage), #ufo {visibility:hidden!important} * {animation:none!important;transition:none!important}'});
    await page.evaluate(()=>MooScenery.frame('farm',0));
    const herd=await page.locator('.field-cow').evaluateAll(els=>els.map(el=>{
      const r=el.getBoundingClientRect();
      return {y:parseFloat(el.style.top),width:r.width,feet:r.bottom,depth:Number(el.style.getPropertyValue('--depth'))};
    }));
    assert.equal(herd.length,5);
    assert.ok(herd[0].width>herd[1].width*4,'near cows visibly grow with painted field perspective');
    assert.ok(herd[2].width>herd[1].width&&herd[2].width<herd[0].width);
    for(const cow of herd)assert.ok(Math.abs(cow.feet-cow.y/100*941)<.1,'scaling keeps hooves on their ground position');
    const regions=[{x:170,y:790,width:25,height:20},{x:1480,y:790,width:25,height:20}];
    const covered=await Promise.all(regions.map(clip=>page.screenshot({clip})));
    const visible=await page.screenshot({clip:{x:145,y:720,width:80,height:35}});
    await page.screenshot({path:path.resolve('test-results/field-depth-and-occlusion.png')});
    await page.locator('#field-cows').evaluate(el=>el.hidden=true);
    for(let i=0;i<regions.length;i++)assert.ok(covered[i].equals(await page.screenshot({clip:regions[i]})),'both near fence posts cover the cow behind them');
    assert.ok(!visible.equals(await page.screenshot({clip:{x:145,y:720,width:80,height:35}})),'cow remains visible in the pasture above the fence');
    await page.locator('#field-cows').evaluate(el=>el.hidden=false);
    await page.evaluate(()=>document.querySelector('[data-action="travel"][data-value="market"]').click());
    await page.evaluate(()=>{MooScenery.frame('market',16);for(let i=1;i<=75;i++)MooScenery.frame('market',16+i*1000/60);});
    assert.equal(await page.locator('#sell-badge, .stand-badge').count(),0,'milk stock no longer adds a floating market label');
    // Inspect a carriage near the old false diagonal. Its far-right window
    // remains intact in open glass, before the real stone arch occludes it.
    const carriage=await page.evaluate(()=>{
      const data=document.querySelector('#market-scenery').getContext('2d').getImageData(1088,136,14,12).data;
      let warm=0;for(let i=0;i<data.length;i+=4)if(data[i]>180&&data[i+1]>120&&data[i+2]<145)warm++;
      return warm;
    });
    assert.ok(carriage>20,'leading carriage window is not sliced off inside the glass');
    await page.screenshot({path:path.resolve('test-results/market-train-unclipped.png')});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>MooScenery.frame('farm',32));
    assert.ok(await page.locator('#farm-foreground').evaluate(el=>el.getContext('2d').getImageData(180,800,1,1).data[3]===255),'foreground depth survives reduced motion');
    assert.deepEqual(errors,[]);
    console.log('Perspective, anchored feet, both foreground fences, market label, and unclipped train passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
