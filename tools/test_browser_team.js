// Браузерний тест етапу 6 (кілька вкладок, локальна мережа BroadcastChannel, мапа замінена заглушкою tools/mlstub.js):
//   NODE_PATH=$(npm root -g) node tools/test_browser_team.js /abs/path/dist/skydominion.html
const { chromium } = require('playwright');
let ok=0,bad=0; const t=(n,c,x)=>{ if(c) ok++; else {bad++; console.log('✗',n,x===undefined?'':JSON.stringify(x));} };
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const errs=[]; const mk=async(id,name)=>{ const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+String(e.stack||e).slice(0,700)));
    await p.route(/maplibre-gl\.(js|css)/,r=>{const u=r.request().url(); r.fulfill(u.endsWith('.css')?{body:'',contentType:'text/css'}:{path:__dirname+'/mlstub.js',contentType:'application/javascript'});}); await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/,r=>r.abort());
    await p.goto('file://'+process.argv[2]+'?net=local#debug'); await p.waitForTimeout(3500);
    await p.evaluate(([i,n])=>{ BV_EVAL(`PROF.id=${JSON.stringify(i)};PROF.name=${JSON.stringify(n)};1`); },[id,name]); p.ev=c=>p.evaluate(x=>BV_EVAL(x),c); return p; };
  const A=await mk('AAAA1111','Alpha'),B=await mk('BBBB2222','Bravo'),C=await mk('CCCC3333','Charlie'),D=await mk('DDDD4444','Delta');
  t('мережа local', (await A.ev('NET.kind+":"+NET.open'))==='local:true', await A.ev('NET.kind+":"+NET.open'));
  const code=await A.ev('(()=>{const R=roomCreate({mode:"duel",pub:true,side:"ua",team2:true});return R&&R.code})()');
  t('кімната 2×2 створена',/^[A-Z0-9]{6}$/.test(code),code); await A.waitForTimeout(800);
  for(const [p,r] of [[B,'player'],[C,'player'],[D,'player']]){ await p.ev(`roomJoin("${code}","player",2)`); await p.waitForTimeout(3500); console.log('roster', await A.ev('JSON.stringify(NET.room.roster.players.map(p=>p.id+":"+p.name+":"+p.side))'), 'toast:', await p.evaluate(()=>(document.getElementById('toast')||{}).innerText), 'errs', errs.length); }
  await A.waitForTimeout(1000);
  for(const [n,p] of [['B',B],['C',C],['D',D]]) console.log(n, await p.ev('JSON.stringify({room:!!NET.room,ok:NET.room&&NET.room.ok,info:NET.room&&NET.room.info&&NET.room.info.players.length,j:S7.joining,id:PROF.id})'));
  const pl=JSON.parse(await A.ev('JSON.stringify(roomInfo(NET.room).players.map(p=>[p.name,p.side,p.role]))'));
  t('4 гравці', pl.length===4, pl);
  t('по 2 в команді', pl.filter(p=>p[1]==='ua').length===2 && pl.filter(p=>p[1]==='ru').length===2, pl);
  const sideOf=n=>pl.find(p=>p[0]===n)[1]; const pg={Alpha:A,Bravo:B,Charlie:C,Delta:D};
  const mate=['Bravo','Charlie','Delta'].find(n=>sideOf(n)==='ua'), foes=['Bravo','Charlie','Delta'].filter(n=>sideOf(n)==='ru');
  // ролі
  const mid=await A.ev(`roomInfo(NET.room).players.find(p=>p.name==="${mate}").id`);
  await A.ev(`teamSend({t:"role",id:${JSON.stringify(mid)},role:"pvo"});1`); await A.waitForTimeout(800);
  const rm=JSON.parse(await pg[mate].ev('JSON.stringify(myPlayer(NET.room))'));
  t('роль ППО застосована у гостя', rm.role==='pvo'&&rm.er==='pvo', rm);
  t('роль ППО: пуски заборонені', (await pg[mate].ev('(()=>{GAME.on=true;GAME.room={team2:true};GAME.spec=false;const a=teamOk("launch"),b=teamOk("ad");GAME.on=false;GAME.room=null;return a+":"+b})()'))==='false:true');
  const ar=JSON.parse(await A.ev('JSON.stringify(roomInfo(NET.room).players.filter(p=>p.name!=="Alpha").map(p=>[p.name,p.side,p.role]))'));
  // ворог не бачить ролей
  const fr=JSON.parse(await pg[foes[0]].ev('JSON.stringify(NET.room.info.players.map(p=>[p.name,p.side,p.role]))'));
  t('ворог бачить склад без ролей чужої команди', fr.filter(p=>p[1]!==sideOf(foes[0])).every(p=>!p[2]), fr);
  t('ворог бачить свої ролі', fr.filter(p=>p[1]===sideOf(foes[0])).every(p=>!!p[2]), fr);
  // чат: команда / усі
  await pg[mate].ev('chatSend("тільки наші","team");1'); await pg[mate].ev('chatSend("для всіх","all");1'); await A.waitForTimeout(1200);
  const chat=async n=>JSON.parse(await pg[n].ev('JSON.stringify(NET.room.chat.map(m=>m.text))'));
  const ca=await chat('Alpha'), cf=await chat(foes[0]);
  t('союзник бачить командний чат', ca.includes('тільки наші'), ca);
  t('ворог не бачить командного чату', !cf.includes('тільки наші'), cf);
  t('ворог бачить загальний чат', cf.includes('для всіх'), cf);
  // переведення (хост)
  const fid=await A.ev(`roomInfo(NET.room).players.find(p=>p.name==="${foes[0]}").id`);
  await A.ev(`teamSend({t:"move",id:${JSON.stringify(fid)},side:"ua"});1`); await A.waitForTimeout(600);
  const pl2=JSON.parse(await A.ev('JSON.stringify(roomInfo(NET.room).players.map(p=>[p.name,p.side]))'));
  t('переведення відхилено при повній команді', pl2.filter(p=>p[1]==='ua').length===2, pl2);

  await A.ev('(()=>{BV7.UI.scr="room";BV7.menuOpen("room");1})()'); await A.waitForTimeout(800);
  const html=await A.evaluate(()=>document.body.innerText);
  const mm=await A.evaluate(()=>{const e=document.getElementById('mmScroll');return e?e.dataset.scr+'|'+e.innerText.slice(0,400):'none'}); t('екран кімнати: команди 2×2', /Команди 2×2/i.test(mm), mm);
  t('екран кімнати: кнопка старту активна', await A.evaluate(()=>{const b=document.querySelector('[data-s7="rstart"]');return !!b&&!b.disabled}));
  // розрив у лобі: слот звільняється; повернення — знову в кімнату
  const cn=foes[1], cid=await A.ev(`roomInfo(NET.room).players.find(p=>p.name==="${cn}").id`);
  await A.ev(`(()=>{const E=[...NET.room.conns].find(E=>E.prof&&E.prof.id===${JSON.stringify(cid)}); E.c.close(); return 1})()`); await A.waitForTimeout(1500);
  t('розрив у лобі: слот звільнено', (await A.ev('NET.room.roster.players.length'))===3);
  await pg[cn].ev(`(()=>{NET.room=null;roomJoin("${code}","player",2);1})()`); await A.waitForTimeout(3500);
  t('повернення в лобі: 4 гравці', (await A.ev('NET.room.roster.players.length'))===4);
  // старт
  for(const n of Object.keys(pg)) await pg[n].ev('(()=>{window.__pg=0; const o=S7.team.ping; S7.team.ping=p=>{window.__pg++;o(p)}; 1})()');
  t('roomStart', (await A.ev('roomStart()'))===true); await A.waitForTimeout(3500);
  for(const n of Object.keys(pg)){ const g=JSON.parse(await pg[n].ev('JSON.stringify({on:GAME.on,puppet:!!GAME.puppet,t2:!!(GAME.room&&GAME.room.team2),ctrl:GAME.ctrl,fog:!!GAME.fog,phase:GAME.phase})'));
    t(n+': бій запущено у 2×2', g.on&&g.t2, g); if(n!=='Alpha') t(n+': гість-puppet', g.puppet, g); }
  const gB=JSON.parse(await pg[foes[0]].ev('JSON.stringify({me:Object.keys(GAME.ctrl).filter(k=>GAME.ctrl[k]==="me"),stk:GAME.stock,eco:GAME.eco&&Object.fromEntries(Object.entries(GAME.eco).map(([k,v])=>[k,v.money]))})'));
  const foeSide=sideOf(foes[0])==='ua'?'ru':'ua';
  t('гість: запас ворога прихований', !gB.stk[foeSide]||Object.keys(gB.stk[foeSide]).length===0, gB.stk&&Object.keys(gB.stk[foeSide]||{}).length);
  t('гість: бюджет ворога прихований', !gB.eco||gB.eco[foeSide]===0, gB.eco);
  t('гість: власний запас видно', Object.keys(gB.stk[sideOf(foes[0])]||{}).length>0, gB.stk);
  // ролі в бою: командувач/ППО
  const cmdG=Object.keys(pg).find(n=>n!=='Alpha'&&sideOf(n)==='ua'); // ППО
  const rr=await pg[mate].ev('(()=>{ HOOKS.route("launch",{}); return document.getElementById("toast")?document.getElementById("toast").innerText:"" })()');
  t('ППО-гравець: пуск заблоковано з поясненням', /роль/i.test(rr), rr);
  await pg[mate].ev('nsend(NET.room.conn,{t:"cmd",k:"launch",p:{siteIdx:0,weapon:"x"}});1'); await A.waitForTimeout(800);
  const rr2=await pg[mate].evaluate(()=>document.getElementById('toast').innerText);
  t('хост відхиляє пуск від ППО-гравця', /роль/i.test(rr2), rr2);
  // позначка
  await pg[mate].ev('teamSend({t:"ping",pos:[31,49],k:"warn"});1'); await A.waitForTimeout(900);
  const got={}; for(const n of Object.keys(pg)) got[n]=await pg[n].evaluate(()=>window.__pg);
  t('позначку бачить команда', got.Alpha>=1&&got[mate]>=1, got);
  t('ворог не бачить позначку', foes.every(f=>!got[f]), got);
  // КП
  await pg[mate].ev('S7.team.open(true);1'); await pg[mate].waitForTimeout(500);
  t('КП відкривається', await pg[mate].evaluate(()=>document.getElementById('cpPanel')&&document.getElementById('cpPanel').classList.contains('on')));
  t('КП: вміст є', (await pg[mate].evaluate(()=>document.getElementById('cpPanel').innerText.length))>20);
  // капітуляція не-командира
  await pg[mate].ev('nsend(NET.room.conn,{t:"surr"});1'); await A.waitForTimeout(600);
  t('не-командир не може здатися', (await A.ev('GAME.over'))!==true);
  // розрив у бою: слот утримується (away), повернення відновлює сторону й роль
  const rid=await A.ev(`NET.room.roster.players.find(p=>p.name==="${cn}").id`), rside=sideOf(cn)==='ua'?'ua':'ru';
  const before=JSON.parse(await A.ev(`JSON.stringify(NET.room.roster.get(${JSON.stringify(rid)}))`));
  await A.ev('(()=>{const r=NET.room.roster,o=r.setAway.bind(r),b=r.setReady.bind(r); window.__aw=0; r.setAway=(...a)=>{window.__aw++;return o(...a)}; 1})()');
  await A.ev(`(()=>{const E=[...NET.room.conns].find(E=>E.prof&&E.prof.id===${JSON.stringify(rid)}); E.c.close(); return 1})()`); await A.waitForTimeout(300);
  t('розрив у бою: гравця позначено away (слот утримується)', (await A.evaluate(()=>window.__aw))>=1, await A.evaluate(()=>window.__aw));
  await A.waitForTimeout(9000);
  const aw2=JSON.parse(await A.ev(`JSON.stringify(NET.room.roster.get(${JSON.stringify(rid)}))`));
  t('авто-відновлення: away знято, сторона й роль ті самі', aw2&&!aw2.away&&aw2.side===before.side&&aw2.role===before.role, aw2);
  const gr=JSON.parse(await pg[cn].ev('JSON.stringify({on:GAME.on,puppet:!!GAME.puppet})'));
  t('повернувся гравець знову в бою (повний знімок)', gr.on&&gr.puppet, gr);
  console.log('помилки сторінок:',errs.slice(0,6));
  console.log(`OK ${ok}, FAIL ${bad}`); await b.close();
})();
