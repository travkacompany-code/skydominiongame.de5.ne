// Браузерний тест повітряного бою (етап 7.70): MAPLIBRE=<maplibre-gl/dist/> node tools/test_browser_aircombat.js <abs dist.html>
const { chromium } = require('playwright'); const ML = process.env.MAPLIBRE || '';
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('ok  ', n); } else { bad++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/maplibre-gl\.(js|css)/, r => { const u = r.request().url(); r.fulfill({ path: ML + (u.endsWith('.css') ? 'maplibre-gl.css' : 'maplibre-gl.js'), contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript' }); });
  await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/, r => r.abort());
  await p.goto('file://' + process.argv[2] + '#debug'); await p.waitForTimeout(4000);
  const ev = code => p.evaluate(c => window.BV_EVAL(c), code);
  const st = await ev(`(()=>{ try{ startGame({mode:"duel",ctx:"sandbox",ctrl:{ua:"me",ru:"bot"}}); GAME.phase="run"; SIM.paused=false; SIM.scale=2; HOOKS.adBlock=()=>null;      // тест: економіка/ліміти гри не заважають розстановці
     return { mod: !!window.BV_AIRC, acg: !!window.BV_ACG, hooks: ["acStep","acBrain","acCar","acInit","acH"].every(k=>typeof HOOKS[k]==="function") }; }catch(e){ return "ERR "+e.stack.slice(0,300); } })()`);
  t('модуль, клей і хуки на місці', st && st.mod && st.acg && st.hooks, st);
  /* --- 0. правило туману (стара логіка гри збережена): без картини РЛС ППО по літаку не стріляє; з ДРЛО — стріляє --- */
  const s0 = await ev(`(()=>{ try{
     const P=[36.25,49.95]; const u=HOOKS.adAct("place",{key:"patriot",pos:P,ammo:8}); window.__sam=u.id;
     const out=[[37.4,50.05],[36.3,50.0],[34.0,49.9]];
     const c=spawnCarrier("tu95","kh101",out[0],out,2,{targetFor(){return [30,50]},mode:"x",wps:[],targetName:"t"},{zone:"test"}); c.pos=out[0].slice(); window.__car=c.id;
     return {fog:GAME.fog, need:RAD.need, net:RAD.net.ua}; }catch(e){ return "ERR "+e.stack.slice(0,300); } })()`);
  t('режим туману активний, РЛС немає', s0 && s0.fog && s0.need && s0.net === 0, s0);
  await p.waitForTimeout(9000);
  const z0 = await ev(`(()=>{ const c=units.get(window.__car); return { shots: BV_ACG.stats.ua.shots, d: c? hav(c.pos, ADS.units.get(window.__sam).pos)|0 : null }; })()`);
  t('у тумані без картини РЛС Patriot мовчить (правило гри збережено)', z0 && z0.shots === 0, z0);
  const s0b = await ev(`(()=>{ try{
     const iu=SITES.findIndex(s=>s.t==="ua_air"&&!s.off&&siteSide(s)==="ua"); const pa=SITES[iu].c;
     const pk=(sd,c)=>{ for (const d of [0.3,0.5,0.8,-0.3,-0.5,0.1]) { const q=[c[0]+d,c[1]]; if (patrolOK(sd,q)) return q; } return null; };
     const aw=HOOKS.adAct("takeoff",{site:iu,key:"aew_saab340",ammo:3,patrol:pk("ua",pa)}); if(!aw) return "aew null";
     aw.pos=[36.2,50.0]; aw.state="patrol"; aw.patrol=[36.2,50.0]; aw.fuel=1; aw.sp=5; window.__aewUa=aw.id;
     const c=units.get(window.__car); if(c){ c.s=0; c.pos=[37.6,50.07]; } return {aew:aw.id}; }catch(e){ return "ERR "+e.stack.slice(0,300); } })()`);
  t('Saab 340 AEW у повітрі (дає картину РЛС)', s0b && s0b.aew != null, s0b);
  let z1 = null; var dl0 = Date.now() + 45000;
  while (Date.now() < dl0){
    await p.waitForTimeout(800);
    z1 = await ev(`(()=>{ const c=units.get(window.__car); return { shots: BV_ACG.stats.ua.shots, net: RAD.net.ua, car: !!c && !c.fall, fall: !!(c&&c.fall) }; })()`);
    if (z1.shots > 0 && (z1.fall || !z1.car)) break;
  }
  t('з картиною від ДРЛО Patriot стріляє по Ту-95', z1 && z1.shots > 0, z1);
  /* далі — без туману, чистий сценарій ЗРК/винищувачів */
  await ev(`(()=>{ GAME.fog=false; RAD.need=false; for(const u of [...ADS.units.values()]) if(u.id!==window.__sam) ADS.units.delete(u.id); for(const [id,u] of [...units]) if(u.kind==="c") units.delete(id); BV_ACG.ms.length=0; ADS.shots.length=0; BV_ACG.stats.ua.shots=0; BV_ACG.stats.ru.shots=0; return 1; })()`);
  /* --- 1. ЗРК проти носія --- */
  const s1 = await ev(`(()=>{ try{
     const u=ADS.units.get(window.__sam); if(!u) return "no sam";
     const out=[[37.9,50.1],[36.3,50.0],[34.0,49.9]];
     const c=spawnCarrier("tu95","kh101",out[0],out,2,{targetFor(){return [30,50]},mode:"x",wps:[],targetName:"t"},{zone:"test"});
     c.pos=out[0].slice(); window.__car=c.id; return {sam:u.id,car:c.id}; }catch(e){ return "ERR "+e.stack.slice(0,400); } })()`);
  t('ЗРК розміщено, носій у повітрі', s1 && s1.sam != null && s1.car != null, s1);
  let seen = null, dl = Date.now() + 60000, h = [];
  while (Date.now() < dl){
    await p.waitForTimeout(700);
    seen = await ev(`(()=>{ const c=units.get(window.__car); const A=BV_ACG; return { alive: !!c && !c.fall, fall: !!(c&&c.fall), gone: !c, shots: A.stats.ua.shots, ms: A.ms.length, ents: A.ents.size, hp: (A.st.get("c"+window.__car)||{}).hp, h: (A.st.get("c"+window.__car)||{}).h|0, fl: (A.st.get("c"+window.__car)||{}).fl }; })()`);
    h.push(seen); if (seen.fall || seen.gone) break;
  }
  t('Patriot автоматично пускає ракети по Ту-95', seen && seen.shots > 0, seen);
  t('Ту-95 збито (падіння/видалення) або пошкоджено', seen && (seen.fall || seen.gone || (seen.hp != null && seen.hp < 1)), seen);
  /* --- 2. винищувачі двох сторін --- */
  const s2 = await ev(`(()=>{ try{
     const pickSite=(sd,type)=>{ for (let i=0;i<SITES.length;i++){ const x=SITES[i]; if (x.t!==type||x.off||siteSide(x)!==sd) continue; for (const dd of [[0.3,0],[0.5,0],[0.8,0],[-0.3,0],[-0.5,0],[0,0.3],[0,-0.3],[0.2,0.2]]){ const q=[x.c[0]+dd[0],x.c[1]+dd[1]]; if (patrolOK(sd,q)) return {i,p:q,c:x.c}; } } return null; };
     const su=pickSite("ua","ua_air"), sr=pickSite("ru","fighter"); if(!su||!sr) return {err:"no site",su:!!su,sr:!!sr};
     const iu=su.i, ir=sr.i;
     const a=HOOKS.adAct("takeoff",{site:iu,key:"f16",ammo:6,patrol:su.p}), r=HOOKS.adAct("takeoff",{site:ir,key:"su27",ammo:6,patrol:sr.p});
     if(!a||!r) return {err:"takeoff null",iu,ir,a:!!a,r:!!r};
     const mid=[36.6,50.0];
     for (const [u,dx,hd] of [[a,0,90],[r,0.6,270]]){ u.pos=[mid[0]+dx-0.3,mid[1]]; u.hdg=hd; u.state="patrol"; u.patrol=u.pos.slice(); u.fuel=1; u.sp=7; u.after="patrol"; }
     window.__fid=[a.id,r.id]; return {a:a.id,r:r.id,ia:iu,ir}; }catch(e){ return "ERR "+e.stack.slice(0,400); } })()`);
  t('F-16 і Су-27 у повітрі поруч', s2 && !s2.err && typeof s2 === 'object' && s2.a != null && s2.r != null, s2);
  if (!s2 || s2.err || typeof s2 !== 'object') { console.log('Повітряний бій (браузер): OK', ok, ', помилок', bad); process.exit(1); }
  let f = null; dl = Date.now() + 70000;
  while (Date.now() < dl){
    await p.waitForTimeout(1500);
    f = await ev(`(()=>{ const A=BV_ACG; const fl=window.__fid; return { alive: fl.map(i=>ADS.units.has(i)), shots: A.stats.ua.shots+A.stats.ru.shots, kills: A.stats.ua.kills+A.stats.ru.kills, decoyed: A.stats.ua.decoyed+A.stats.ru.decoyed, acShots: ADS.shots.filter(s=>s.ac).length, cm: fl.map(i=>{const s=A.st.get("f"+i); return s? s.fl+"/"+s.ch:null}) }; })()`);
    if (f.alive.some(x => !x) && f.acShots === 0) break;
  }
  t('винищувачі виявляють один одного й пускають ракети', f && f.shots > 0, f);
  t('використано пастки або є збиття', f && (f.kills > 0 || f.cm.some(c => c && c !== '60/60' && c !== '80/80' && c !== '48/48')) , f);
  /* --- 3. ДРЛО як ціль: А-50У збивається, станція РЛС знімається --- */
  const s3 = await ev(`(()=>{ try{
     const pickSite=(sd,type)=>{ for (let i=0;i<SITES.length;i++){ const x=SITES[i]; if (x.t!==type||x.off||siteSide(x)!==sd) continue; for (const dd of [[0.3,0],[0.5,0],[0.8,0],[-0.3,0],[-0.5,0],[0,0.3],[0,-0.3],[0.2,0.2]]){ const q=[x.c[0]+dd[0],x.c[1]+dd[1]]; if (patrolOK(sd,q)) return {i,p:q,c:x.c}; } } return null; };
     const sr=pickSite("ru","fighter"); if(!sr) return "no ru site";
     const u=HOOKS.adAct("takeoff",{site:sr.i,key:"aew_a50",ammo:3,patrol:sr.p}); if(!u) return "takeoff null";
     const sam=HOOKS.adAct("place",{key:"patriot",pos:[36.30,49.90],ammo:8});
     u.pos=[36.5,49.95]; u.state="patrol"; u.patrol=[36.5,49.95]; u.fuel=1; u.sp=5; window.__aew=u.id; return {id:u.id, sam: sam&&sam.id}; }catch(e){ return "ERR "+e.stack.slice(0,400); } })()`);
  t('А-50У у повітрі поряд із Patriot', s3 && s3.id != null, s3);
  let g = null; dl = Date.now() + 50000;
  while (Date.now() < dl){
    await p.waitForTimeout(1500);
    g = await ev(`(()=>{ const u=ADS.units.get(window.__aew); const sim=RAD.sim; const stn=sim&&sim.stations.some(x=>String(x.id)==="AEW"+window.__aew); return { alive: !!u, hp: (BV_ACG.st.get("f"+window.__aew)||{}).hp, station: !!stn, shots: BV_ACG.ms.length, st: u&&u.state }; })()`);
    if (!g.alive) break;
  }
  t('А-50У збивається або пошкоджена (повертається)', g && (!g.alive || (g.hp != null && g.hp < 1) || g.st === 'rtb'), g);
  if (g && !g.alive) { await p.waitForTimeout(2500); const g2 = await ev(`(()=>{ const sim=RAD.sim; return { station: !!(sim&&sim.stations.some(x=>String(x.id)==="AEW"+window.__aew)) }; })()`); t('станція ДРЛО знята з РЛС після збиття', g2 && !g2.station, g2); }
  /* --- 4. гра йде далі --- */
  const fin = await ev(`(()=>({ t: SIM.t, units: units.size, ads: ADS.units.size }))()`); await p.waitForTimeout(3000);
  const fin2 = await ev(`(()=>({ t: SIM.t }))()`);
  t('симуляція не зависла', fin2.t > fin.t, [fin, fin2]);
  t('помилок сторінки немає', errs.length === 0, errs.slice(0, 3));
  console.log('Повітряний бій (браузер): OK', ok, ', помилок', bad); await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 400)); process.exit(1); });
