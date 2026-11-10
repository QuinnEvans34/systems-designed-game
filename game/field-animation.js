/* Field animation has real depth layers and a small stem rig. All moving
   sprites have transparency; their former positions contain restored scenery. */
(() => {
  'use strict';
  const W = 1672, H = 941;
  const cloudSpecs = [
    [480,27,238,103,480,27,4.8], [1367,30,282,136,1367,30,4.1],
    [1120,125,92,41,1120,125,6], [1291,165,80,40,1291,165,5.2],
    [258,146,76,40,258,146,5.5], [236,194,264,103,236,194,4.5],
    [513,311,79,34,513,311,5.8], [1342,345,186,86,1342,345,3.7],
    [623,462,170,56,623,462,3], [1018,461,148,53,1018,461,3.4],
    // These complete clouds replace partially hidden shapes at the frame edge.
    [236,194,264,103,-145,218,4.3], [258,146,76,40,1575,455,3.2]
  ];
  const flowers = [
    { sprite:2, root:[28,864], tip:[92,706], phase:0, sway:5.5 },
    { sprite:0, root:[28,864], tip:[73,737], phase:.22, sway:5 },
    { sprite:1, root:[28,864], tip:[61,775], phase:.4, sway:4.2 },
    { sprite:5, root:[28,864], tip:[84,814], phase:.55, sway:3.5 },
    { sprite:2, root:[1644,867], tip:[1586,709], phase:1.1, sway:5.5, mirror:true },
    { sprite:1, root:[1644,867], tip:[1597,740], phase:1.35, sway:5, mirror:true },
    { sprite:0, root:[1644,867], tip:[1616,778], phase:1.55, sway:4, mirror:true },
    { sprite:5, root:[1644,867], tip:[1586,818], phase:1.75, sway:3.5, mirror:true },
    { sprite:3, root:[585,902], tip:[585,869], phase:2, sway:2.2 },
    { sprite:4, root:[1091,902], tip:[1092,871], phase:2.5, sway:2.2 }
  ];
  const load = name => new Promise((resolve,reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Missing field layer: '+name));
    img.src = 'assets/scenery/'+name+'.png';
  });
  async function prepare(s) {
    const [world,foreground,clouds,leftTree,rightTree,heads] = await Promise.all([
      'field-world','field-foreground','field-clouds','field-tree-left','field-tree-right','field-flower-heads'
    ].map(load));
    s.field = { world,foreground,clouds,leftTree,rightTree,heads };
    s.field.frontCtx = s.canvas.id === 'farm-scenery' ? document.getElementById('farm-foreground')?.getContext('2d') : null;
    // Pre-render the clean sky once. There are no sampled patches or old clouds
    // under the sprites, including behind the entire windmill rotor.
    s.field.sky = document.createElement('canvas'); s.field.sky.width=W; s.field.sky.height=H;
    const ctx=s.field.sky.getContext('2d'), gradient=ctx.createLinearGradient(0,0,0,600);
    gradient.addColorStop(0,'#62b4f4'); gradient.addColorStop(.55,'#66b8f3'); gradient.addColorStop(1,'#70bdf1');
    ctx.fillStyle=gradient; ctx.fillRect(0,0,W,H);
    // Each cloud is cached separately, so interpolation cannot sample adjacent
    // textures in the atlas when the cloud moves a fraction of a pixel.
    s.field.cloudSprites=cloudSpecs.map(([sx,sy,w,h,x,y,speed])=>{
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(clouds,sx,sy,w,h,0,0,w,h);
      return {canvas,w,h,x,y,speed};
    });
    s.ctx.imageSmoothingEnabled=true;
    s.ctx.imageSmoothingQuality='high';
  }
  function line(ctx,points,color,width) {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for(let i=1;i<points.length;i++) ctx.lineTo(...points[i]);
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
  }
  function drawWindmill(ctx,t) {
    ctx.save(); ctx.lineJoin='round';
    // Fixed support behind the hub, joining the original lower tower.
    for(const color of ['#1b201c','#a57043']) {
      const width=color==='#1b201c'?8:4;
      line(ctx,[[1291,454],[1282,512]],color,width);
      line(ctx,[[1301,454],[1310,512]],color,width);
      line(ctx,[[1288,480],[1307,500],[1284,502],[1304,480]],color,width*.65);
    }
    ctx.translate(1296,455); ctx.rotate(t*.28);
    ctx.lineJoin='miter'; ctx.strokeStyle='#171c1d'; ctx.fillStyle='#c8baa0'; ctx.lineWidth=3.5;
    for(let i=0;i<8;i++) {
      ctx.rotate(Math.PI/4);
      ctx.beginPath(); ctx.moveTo(-2,-10); ctx.lineTo(-6,-27); ctx.lineTo(-7,-39);
      ctx.lineTo(7,-39); ctx.lineTo(6,-27); ctx.lineTo(2,-10); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle='#b27b49'; ctx.fillRect(-7,-7,14,14); ctx.strokeRect(-7,-7,14,14);
    ctx.fillStyle='#30271f'; ctx.fillRect(-2,-2,4,4); ctx.restore();
  }
  function branchPoint(f,u,bend) {
    return [f.root[0]+(f.tip[0]-f.root[0])*u+bend*u*u, f.root[1]+(f.tip[1]-f.root[1])*u];
  }
  function drawFlower(ctx,heads,f,t,headOnly=false) {
    // Wind bends a quadratic stem, with zero displacement at the root. The
    // flower head follows the tip and its tangent instead of moving a rectangle.
    const bend=(Math.sin(t*.85+f.phase)+.16*Math.sin(t*1.55+f.phase))*f.sway;
    const tip=branchPoint(f,1,bend), control=branchPoint(f,.5,0);
    if(headOnly) {
      const sx=f.sprite%3*64,sy=Math.floor(f.sprite/3)*64;
      ctx.save();ctx.translate(...tip);ctx.rotate(bend*.009);
      if(f.mirror)ctx.scale(-1,1);
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(heads,sx,sy,64,64,-32,-32,64,64);ctx.restore();return;
    }
    ctx.lineCap='round'; ctx.lineJoin='round';
    for(const [color,width] of [['#161e13',10],['#8fa940',5]]) {
      ctx.beginPath(); ctx.moveTo(...f.root); ctx.quadraticCurveTo(...control,...tip); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
    }
    const u=f.sway>3?.38:.55, leaf=branchPoint(f,u,bend), direction=f.tip[0]<f.root[0]?-1:1;
    ctx.save(); ctx.translate(...leaf); ctx.rotate(bend*.008);
    ctx.beginPath(); ctx.moveTo(0,1); ctx.lineTo(direction*7,-13); ctx.lineTo(direction*16,-18);
    ctx.lineTo(direction*13,-7); ctx.lineTo(direction*5,2); ctx.closePath();
    ctx.fillStyle='#769740'; ctx.strokeStyle='#26321c'; ctx.lineWidth=3; ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawTree(ctx,img,x,y,pivot,angle) {
    ctx.save(); ctx.translate(...pivot); ctx.rotate(angle); ctx.translate(-pivot[0],-pivot[1]);
    ctx.drawImage(img,x,y); ctx.restore();
  }
  function draw(s,t) {
    const ctx=s.ctx,f=s.field;
    ctx.clearRect(0,0,W,H); ctx.drawImage(f.sky,0,0);
    for(const c of f.cloudSprites) {
      const x=((c.x+t*c.speed+c.w)%(W+c.w)+W+c.w)%(W+c.w)-c.w;
      // Fractional positions at requestAnimationFrame cadence provide continuous
      // motion. Pixel textures retain their detail without coordinate snapping.
      ctx.drawImage(c.canvas,x,c.y);
    }
    ctx.drawImage(f.world,0,0);
    drawTree(ctx,f.leftTree,0,0,[0,289],Math.sin(t*.5)*.005);
    drawTree(ctx,f.rightTree,1490,190,[1672,525],Math.sin(t*.5+1.1)*.006);
    drawWindmill(ctx,t);
    const front=f.frontCtx;
    if(front){
      front.clearRect(0,0,W,H);front.drawImage(f.foreground,0,0);
    }
    // Paint each plant once, above the herd in the live scene. A standalone
    // field canvas still contains the complete illustration.
    const plants=front||ctx;
    for(const flower of flowers)drawFlower(plants,f.heads,flower,t);
    // Heads cover every stem, including those from neighbouring branches.
    for(const flower of flowers)drawFlower(plants,f.heads,flower,t,true);
  }
  window.MooFieldAnimation={prepare,draw};
})();
