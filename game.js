(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const W = 38, H = 38, TW = 64, TH = 32, EH = 22;
  const types = {
    grass: {name:'Grass', top:'#82b85f', side:'#678f4b', dark:'#52763e', icon:['#8fc76a','#6f9f4f','#5a8040']},
    dirt: {name:'Dirt', top:'#b98a59', side:'#916544', dark:'#754d36', icon:['#c69b6b','#9e7149','#805737']},
    stone: {name:'Stone', top:'#a9b5ae', side:'#798980', dark:'#5e7068', icon:['#b8c2bb','#929e96','#727f76']},
    wood: {name:'Wood', top:'#bd8950', side:'#93653b', dark:'#734a2c', icon:['#c9985c','#9c6e40','#79502f']},
    leaves: {name:'Leaves', top:'#78a84f', side:'#527c3e', dark:'#406333', icon:['#91bd63','#699447','#4d7337']},
    flower: {name:'Flower', top:'#e8c96a', side:'#79a752', dark:'#5a813e', icon:['#f0d477','#8fb55c','#6e9148']}
  };
  const inventory = ['grass','dirt','stone','wood','leaves','flower'];
  const count = {grass:24,dirt:12,stone:8,wood:8,leaves:12,flower:5};
  const world = Array.from({length:W},()=>Array(H));
  let seed = 4821, selected = 0, playing = false, paused = false;
  let player = {x:18.5,y:18.5,faceX:1,faceY:0};
  let camera = {x:0,y:0};
  let target = {x:18,y:18};
  let lastTime = 0, toastTimer = 0, soundOn = false;
  const keys = new Set(), mouse = {x:innerWidth/2,y:innerHeight/2,down:false};
  const moveStick = document.querySelector('#move-stick');
  const stickKnob = document.querySelector('#stick-knob');
  const stick = {pointerId:null,x:0,y:0};
  const random = (()=>{let s=seed;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}})();
  function heightAt(x,y){
    const hills = Math.sin(x*.31)*.72 + Math.cos(y*.25)*.66 + Math.sin((x+y)*.19)*.55 + Math.cos((x-y)*.14)*.3;
    return Math.max(0,Math.min(3,Math.floor((hills+1.6)*.79)));
  }
  function makeWorld(){
    for(let x=0;x<W;x++) for(let y=0;y<H;y++){
      const h=heightAt(x,y), r=random();
      const type=r<.11?'stone':'grass';
      world[x][y]={h,type,blocks:[],decor:null};
      if(type==='grass' && r>.28 && r<.34) world[x][y].decor='flower';
      if(type==='grass' && r>.68 && r<.735 && h>0) world[x][y].decor='bush';
      if(type==='grass' && r>.84 && h<3) world[x][y].blocks.push('wood','wood','leaves','leaves');
      if(type==='grass' && r>.795 && r<.815) world[x][y].blocks.push('stone');
    }
    // Keep a generous clearing around the spawn point.
    for(let x=15;x<22;x++) for(let y=15;y<22;y++){
      const t=world[x][y]; t.blocks=[]; t.decor=null; t.type='grass'; t.h=heightAt(x,y);
    }
    world[19][17].blocks=['wood','wood','leaves','leaves'];
    world[16][20].blocks=['stone'];
    world[21][20].decor='flower';
  }
  makeWorld();
  const project=(x,y,z=0)=>({x:(x-y)*TW/2,y:(x+y)*TH/2-z*EH});
  function resize(){const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*d);canvas.height=Math.floor(innerHeight*d);canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(d,0,0,d,0,0)}
  addEventListener('resize',resize);resize();
  function screenPoint(x,y,z=0){const p=project(x,y,z);return{x:p.x+innerWidth/2-camera.x,y:p.y+innerHeight*.49-camera.y}}
  function setTargetFromMouse(){
    // Invert the isometric projection at the player's ground plane, then bias toward the nearest tile.
    const sx=mouse.x-innerWidth/2+camera.x, sy=mouse.y-innerHeight*.49+camera.y;
    let gx=(sx/(TW/2)+sy/(TH/2))/2, gy=(sy/(TH/2)-sx/(TW/2))/2;
    gx=Math.round(gx);gy=Math.round(gy);
    if(gx<0||gy<0||gx>=W||gy>=H){target={x:-1,y:-1};return}
    target={x:gx,y:gy};
  }
  function color(hex,alpha=1){ctx.globalAlpha=alpha;return hex}
  function poly(points,fill,stroke){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
  function cube(x,y,z,type,scale=1){
    const t=types[type]||types.grass, p=screenPoint(x+.5,y+.5,z), hw=TW*.25*scale, hh=TH*.25*scale, eh=EH*scale;
    // Two shaded sides and a diamond top, like a chunky voxel block.
    poly([[p.x,p.y-eh+hh],[p.x+hw,p.y-eh],[p.x+hw,p.y+hh],[p.x,p.y+eh+hh]],t.side);
    poly([[p.x,p.y-eh+hh],[p.x-hw,p.y-eh],[p.x-hw,p.y+hh],[p.x,p.y+eh+hh]],t.dark);
    poly([[p.x,p.y-eh-hh],[p.x+hw,p.y-eh],[p.x,p.y-eh+hh],[p.x-hw,p.y-eh]],t.top);
    // Tiny, restrained pixel flecks make block faces read as textured.
    if(type==='stone'||type==='dirt'||type==='grass'){
      ctx.fillStyle=type==='stone'?'rgba(255,255,255,.17)':'rgba(255,255,255,.12)';
      ctx.fillRect(p.x-5*scale,p.y-eh-3*scale,3*scale,2*scale);
    }
  }
  function groundTile(x,y,t){
    const p=screenPoint(x+.5,y+.5,t.h), hw=TW/2,hh=TH/2;
    const south=world[x][Math.min(H-1,y+1)].h, east=world[Math.min(W-1,x+1)][y].h;
    if(t.h>south) poly([[p.x,p.y],[p.x+hw,p.y+hh],[p.x+hw,p.y+hh+(t.h-south)*EH],[p.x,p.y+(t.h-south)*EH]],types[t.type].side);
    if(t.h>east) poly([[p.x,p.y],[p.x-hw,p.y+hh],[p.x-hw,p.y+hh+(t.h-east)*EH],[p.x,p.y+(t.h-east)*EH]],types[t.type].dark);
    poly([[p.x,p.y-TH/2],[p.x+hw,p.y],[p.x,p.y+hh],[p.x-hw,p.y]],types[t.type].top);
  }
  function decoration(x,y,t){
    const p=screenPoint(x+.5,y+.5,t.h);
    if(t.decor==='flower'){
      ctx.fillStyle='#47713d';ctx.fillRect(p.x-1,p.y-14,2,13);
      ctx.fillStyle='#f6d17b';ctx.beginPath();ctx.arc(p.x,p.y-17,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff0c7';ctx.beginPath();ctx.arc(p.x-4,p.y-17,2,0,Math.PI*2);ctx.arc(p.x+4,p.y-17,2,0,Math.PI*2);ctx.fill();
    } else if(t.decor==='bush'){
      ctx.fillStyle='rgba(40,70,42,.16)';ctx.beginPath();ctx.ellipse(p.x,p.y-2,15,5,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#5e9348';ctx.beginPath();ctx.arc(p.x-5,p.y-13,8,0,Math.PI*2);ctx.arc(p.x+4,p.y-14,9,0,Math.PI*2);ctx.arc(p.x,p.y-19,7,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#8dbb5e';ctx.beginPath();ctx.arc(p.x-4,p.y-17,3,0,Math.PI*2);ctx.fill();
    }
  }
  function drawPlayer(){
    const gx=Math.floor(player.x),gy=Math.floor(player.y),ground=world[gx]?.[gy]?.h||0;
    const p=screenPoint(player.x+.5,player.y+.5,ground);
    ctx.fillStyle='rgba(36,60,37,.22)';ctx.beginPath();ctx.ellipse(p.x,p.y+1,13,6,0,0,Math.PI*2);ctx.fill();
    // Little adventurer: boots, tunic, sleeves, and a sunny hairdo.
    ctx.fillStyle='#73543b';ctx.fillRect(p.x-7,p.y-10,5,10);ctx.fillRect(p.x+2,p.y-10,5,10);
    ctx.fillStyle='#f3d9a8';ctx.fillRect(p.x-10,p.y-27,20,17);
    ctx.fillStyle='#5f8c70';ctx.fillRect(p.x-9,p.y-27,18,16);
    ctx.fillStyle='#f3d9a8';ctx.fillRect(p.x-13,p.y-25,4,11);ctx.fillRect(p.x+9,p.y-25,4,11);
    ctx.fillStyle='#dca75f';ctx.fillRect(p.x-10,p.y-37,20,12);ctx.fillRect(p.x-8,p.y-41,15,6);
    ctx.fillStyle='#405d49';ctx.fillRect(p.x+3,p.y-33,2,2);
    ctx.fillStyle='rgba(255,255,255,.32)';ctx.fillRect(p.x-6,p.y-24,3,8);
  }
  function drawTarget(){
    if(target.x<0||target.y<0)return;
    const t=world[target.x]?.[target.y];if(!t)return;
    const p=screenPoint(target.x+.5,target.y+.5,t.h),hw=TW/2,hh=TH/2;
    ctx.beginPath();ctx.moveTo(p.x,p.y-hh);ctx.lineTo(p.x+hw,p.y);ctx.lineTo(p.x,p.y+hh);ctx.lineTo(p.x-hw,p.y);ctx.closePath();
    ctx.strokeStyle='rgba(255,231,157,.9)';ctx.lineWidth=2;ctx.stroke();
  }
  function drawWorld(){
    const sky=ctx.createLinearGradient(0,0,0,innerHeight);sky.addColorStop(0,'#91d5e0');sky.addColorStop(.58,'#b8e4ce');sky.addColorStop(1,'#c7dfa9');ctx.fillStyle=sky;ctx.fillRect(0,0,innerWidth,innerHeight);
    // Faraway soft hills keep the horizon from feeling empty.
    ctx.fillStyle='rgba(124,175,132,.18)';ctx.beginPath();ctx.moveTo(0,innerHeight*.43);for(let x=0;x<=innerWidth;x+=40)ctx.lineTo(x,innerHeight*.39+Math.sin(x*.009)*19+Math.cos(x*.004)*13);ctx.lineTo(innerWidth,innerHeight);ctx.lineTo(0,innerHeight);ctx.fill();
    camera.x=(player.x-player.y)*TW/2;camera.y=(player.x+player.y)*TH/2-(world[Math.floor(player.x)]?.[Math.floor(player.y)]?.h||0)*EH;
    const entries=[];
    for(let x=0;x<W;x++)for(let y=0;y<H;y++)entries.push({x,y,d:x+y});
    entries.sort((a,b)=>a.d-b.d||a.x-b.x);
    let playerDrawn=false;
    for(const e of entries){
      const {x,y}=e, t=world[x][y], pp=project(player.x+.5,player.y+.5);
      if(!playerDrawn && e.d>player.x+player.y){drawPlayer();playerDrawn=true}
      groundTile(x,y,t);
      for(let i=0;i<t.blocks.length;i++)cube(x,y,t.h+i,t.blocks[i]);
      if(t.decor)decoration(x,y,t);
    }
    if(!playerDrawn)drawPlayer();
    drawTarget();
  }
  function updateTarget(){
    const sx=mouse.x-innerWidth/2+camera.x, sy=mouse.y-innerHeight*.49+camera.y;
    let best=null, bestDist=Infinity;
    for(let h=0;h<=3;h++){
      const gx=Math.round((sx/(TW/2)+(sy+h*EH)/(TH/2))/2);
      const gy=Math.round(((sy+h*EH)/(TH/2)-sx/(TW/2))/2);
      if(gx<0||gy<0||gx>=W||gy>=H)continue;
      const t=world[gx][gy],p=screenPoint(gx+.5,gy+.5,t.h);
      const d=Math.hypot(p.x-mouse.x,p.y-mouse.y);
      if(d<bestDist){bestDist=d;best={x:gx,y:gy}}
    }
    target=best&&bestDist<85?best:{x:-1,y:-1};
  }
  function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1500)}
  function resetStick(){
    stick.pointerId=null;stick.x=0;stick.y=0;
    stickKnob.style.transform='translate(-50%,-50%)';
    moveStick.classList.remove('dragging');
  }
  function updateStick(e){
    const base=moveStick.querySelector('.stick-base'),rect=base.getBoundingClientRect();
    const radius=rect.width/2-stickKnob.offsetWidth/2-4;
    let x=e.clientX-(rect.left+rect.width/2),y=e.clientY-(rect.top+rect.height/2);
    const length=Math.hypot(x,y);
    if(length>radius){x=x/length*radius;y=y/length*radius}
    stick.x=x/radius;stick.y=y/radius;
    stickKnob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
  }
  moveStick.addEventListener('pointerdown',e=>{
    if(!playing||paused||stick.pointerId!==null)return;
    e.preventDefault();stick.pointerId=e.pointerId;moveStick.classList.add('dragging');
    moveStick.setPointerCapture(e.pointerId);updateStick(e);
  });
  moveStick.addEventListener('pointermove',e=>{if(e.pointerId===stick.pointerId){e.preventDefault();updateStick(e)}});
  moveStick.addEventListener('pointerup',e=>{if(e.pointerId===stick.pointerId)resetStick()});
  moveStick.addEventListener('pointercancel',e=>{if(e.pointerId===stick.pointerId)resetStick()});
  moveStick.addEventListener('lostpointercapture',e=>{if(e.pointerId===stick.pointerId)resetStick()});
  function blockDistance(x,y){return Math.hypot(x+.5-player.x-.5,y+.5-player.y-.5)}
  function mine(){
    const {x,y}=target;if(x<0||blockDistance(x,y)>4.2){toast('Move a little closer to that block');return}
    const t=world[x][y];
    if(t.blocks.length){const type=t.blocks.pop();count[type]=(count[type]||0)+1;toast(`+1 ${types[type].name}`)}
    else if(t.decor){const type=t.decor==='flower'?'flower':'leaves';t.decor=null;count[type]++;toast(`+1 ${types[type].name}`)}
    else if(t.type==='grass'){t.type='dirt';count.grass++;toast('+1 Grass')}
    else if(t.type==='dirt'){t.type='stone';count.dirt++;toast('+1 Dirt')}
    else {count.stone++;toast('+1 Stone')}
    updateInventory();
  }
  function place(){
    const {x,y}=target;if(x<0||blockDistance(x,y)>4.2){toast('Move a little closer to build');return}
    if(x===Math.floor(player.x)&&y===Math.floor(player.y)){toast('You need a little room to place that');return}
    const type=inventory[selected],t=world[x][y];
    if(count[type]<=0){toast(`You're out of ${types[type].name.toLowerCase()}`);return}
    if(t.blocks.length>=5){toast('That stack is already pretty tall');return}
    t.blocks.push(type);count[type]--;updateInventory();toast(`${types[type].name} placed`);
  }
  function updateInventory(){
    const bar=document.querySelector('#hotbar');
    bar.innerHTML=inventory.map((type,i)=>`<button class="slot ${i===selected?'selected':''}" data-slot="${i}" title="${types[type].name} · ${count[type]}"><span class="slot-num">${i+1}</span><svg class="block-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 29 10 16 17 3 10z" fill="${types[type].icon[0]}"/><path d="M3 10 16 17 16 30 3 23z" fill="${types[type].icon[1]}"/><path d="M29 10 16 17 16 30 29 23z" fill="${types[type].icon[2]}"/></svg><span class="count">${count[type]}</span></button>`).join('');
    bar.querySelectorAll('.slot').forEach(el=>el.addEventListener('click',()=>{selected=Number(el.dataset.slot);updateInventory()}));
  }
  function updateHUD(){
    const x=Math.floor(player.x),y=Math.floor(player.y);
    document.querySelector('#coords').textContent=`X ${String(x-18).padStart(2,'0')} · Y ${String(y-18).padStart(2,'0')}`;
    const tile=world[x]?.[y];document.querySelector('#biome').textContent=tile?.type==='stone'?'HIGHLANDS':tile?.h>=2?'SUNNY MEADOW':'MEADOW';
  }
  function tick(now){
    const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;
    if(playing&&!paused){
      let dx=stick.x,dy=stick.y;
      if(Math.hypot(dx,dy)<.14){dx=0;dy=0}
      if(keys.has('w')||keys.has('arrowup'))dy--;
      if(keys.has('s')||keys.has('arrowdown'))dy++;
      if(keys.has('a')||keys.has('arrowleft'))dx--;
      if(keys.has('d')||keys.has('arrowright'))dx++;
      if(dx||dy){const len=Math.hypot(dx,dy);dx/=len;dy/=len;player.faceX=dx;player.faceY=dy;const speed=4.2;const nx=Math.max(.15,Math.min(W-.85,player.x+dx*speed*dt)),ny=Math.max(.15,Math.min(H-.85,player.y+dy*speed*dt));
        const blocked=(px,py)=>{const t=world[Math.floor(px)]?.[Math.floor(py)];return !t||t.blocks.some(b=>b==='wood'||b==='stone')};
        if(!blocked(nx,player.y))player.x=nx;if(!blocked(player.x,ny))player.y=ny;
      }
      updateHUD();updateTarget();
    }
    drawWorld();requestAnimationFrame(tick);
  }
  function enterWorld(){playing=true;paused=false;document.querySelector('#welcome').classList.add('hidden');document.querySelector('#pause-overlay').classList.remove('visible');moveStick.classList.add('active');toast('Welcome to your little corner of the world')}
  document.querySelector('#play-button').addEventListener('click',enterWorld);
  document.querySelector('#resume-button').addEventListener('click',()=>{paused=false;document.querySelector('#pause-overlay').classList.remove('visible');moveStick.classList.add('active')});
  document.querySelector('#sound-button').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?'♫':'♪';toast(soundOn?'Sound is on':'Sound is off')});
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
    if(k==='escape'&&playing){paused=!paused;document.querySelector('#pause-overlay').classList.toggle('visible',paused);moveStick.classList.toggle('active',!paused);if(paused){keys.clear();resetStick()}return}
    if(!playing||paused)return;
    if('123456'.includes(k)){selected=Number(k)-1;updateInventory();}
    if(k==='e')mine();
    if(k==='q')place();
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(k)&&playing&&!paused)keys.add(k)});
  addEventListener('blur',()=>{keys.clear();resetStick()});
  canvas.addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;updateTarget()});
  canvas.addEventListener('mousedown',e=>{if(!playing||paused)return;e.preventDefault();if(e.button===0)mine();if(e.button===2)place()});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('touchstart',e=>{if(!playing||paused)return;const t=e.touches[0];mouse.x=t.clientX;mouse.y=t.clientY;updateTarget();mine()},{passive:true});
  canvas.addEventListener('touchend',e=>{if(!playing||paused)return;const t=e.changedTouches[0];mouse.x=t.clientX;mouse.y=t.clientY;updateTarget();place()},{passive:true});
  document.querySelector('#mobile-mine').addEventListener('click',mine);
  document.querySelector('#mobile-place').addEventListener('click',place);
  updateInventory();
  document.querySelector('#seed-label').textContent='#'+String(seed).padStart(5,'0');
  requestAnimationFrame(tick);
})();
