// Браузерний тест етапу 6 (кілька вкладок, локальна мережа BroadcastChannel, мапа замінена заглушкою tools/mlstub.js):
//   NODE_PATH=$(npm root -g) node tools/test_browser_team11.js /abs/path/dist/skydominion.html
const { chromium } = require('playwright');
let ok=0,bad=0; const t=(n,c,x)=>{ if(c) ok++; else {bad++; console.log('✗',n,x===undefined?'':JSON.stringify(x));} };
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const ctx=await b.newContext({viewport:{width:1280,height:900}}); const errs=[];
  const mk=async(id,name)=>{ const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+String(e.stack||e).slice(0,500)));
    await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/,r=>r.abort());
    await p.route(/maplibre-gl\.(js|css)/,r=>{const u=r.request().url(); r.fulfill(u.endsWith('.css')?{body:'',contentType:'text/css'}:{path:__dirname+'/mlstub.js',contentType:'application/javascript'});});
    await p.goto('file://'+process.argv[2]+'?net=local#debug'); await p.waitForTimeout(3500);
    await p.evaluate(([i,n])=>BV_EVAL(`PROF.id=${JSON.stringify(i)};PROF.name=${JSON.stringify(n)};1`),[id,name]); p.ev=c=>p.evaluate(x=>BV_EVAL(x),c); return p; };
  const A=await mk('AAAA1111','Alpha'),B=await mk('BBBB2222','Bravo');
  const code=await A.ev('(()=>{const R=roomCreate({mode:"duel",pub:true,side:"ua"});return R&&R.code})()'); await A.waitForTimeout(800);
  await B.ev(`roomJoin("${code}","player",2)`); await B.waitForTimeout(8000);
  if(0)console.log('dbg', await A.ev('JSON.stringify(NET.room.roster.players.map(p=>p.name+p.side))'), await B.ev('JSON.stringify({r:!!NET.room,j:S7.joining,ok:NET.room&&NET.room.ok,open:NET.open})'), await B.evaluate(()=>(document.getElementById('toast')||{}).innerText));
  t('1×1: 2 гравці', (await A.ev('NET.room.roster.players.length'))===2);
  t('1×1: team2 вимкнено', (await A.ev('!!NET.room.team2'))===false);
  await B.ev('chatSend("привіт","team");1'); await A.waitForTimeout(800);
  t('1×1: чат доходить', (await A.ev('JSON.stringify(NET.room.chat.map(m=>m.text))')).includes('привіт'));
  t('1×1: старт', (await A.ev('roomStart()'))===true); await A.waitForTimeout(3000);
  const gA=JSON.parse(await A.ev('JSON.stringify({on:GAME.on,t2:!!(GAME.room&&GAME.room.team2),ctrl:GAME.ctrl,fog:!!GAME.fog})')), gB=JSON.parse(await B.ev('JSON.stringify({on:GAME.on,puppet:!!GAME.puppet,ctrl:GAME.ctrl})'));
  t('1×1: бій у обох', gA.on&&gB.on&&gB.puppet&&!gA.t2, {gA,gB});
  t('1×1: ролі не обмежують', (await B.ev('teamOk("launch")&&teamOk("ad")'))===true);
  await B.ev('HOOKS.route("ready",{});1'); await A.waitForTimeout(500);
  t('1×1: готовність гостя', (await A.ev('GAME.ready.ru||GAME.ready.ua'))===true || (await A.ev('GAME.phase'))!=='prep');
  console.log(errs.slice(0,4)); console.log(`OK ${ok}, FAIL ${bad}`); await b.close(); })();
