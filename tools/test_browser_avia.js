// Браузерний тест авіації, етап 4 («BANGVECTOR 2 · етап 4»):
//   MAPLIBRE=<maplibre-gl/dist/> node tools/test_browser_avia.js <abs dist.html>
const { chromium } = require('playwright'); const ML = process.env.MAPLIBRE || '';
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/maplibre-gl\.(js|css)/, r => { const u = r.request().url(); r.fulfill({ path: ML + (u.endsWith('.css') ? 'maplibre-gl.css' : 'maplibre-gl.js'), contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript' }); });
  await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/, r => r.abort());
  await p.goto('file://' + process.argv[2] + '#debug'); await p.waitForTimeout(5000);
  const ev = (code) => p.evaluate(c => window.BV_EVAL(c), code);

  // 1) старт бою, стоянки за парком
  const st = await ev(`(()=>{try{
    startGame({mode:"duel",ctx:"sandbox",ctrl:{ua:"me",ru:"bot"}}); GAME.phase="run"; SIM.paused=false;
    const B=window.BV_AVIA, E=ecoE("ru"), A=B.list();
    return { airfields: A.length, alive: A.filter(a=>B.alive(a)).length, ruTu95: B.parkedSide("ru","tu95"),
      fleetTu95: E&&E.fleet?E.fleet.tu95:null, uaSu24: B.parkedSide("ua","su24"), fleetSu24: ecoE("ua")&&ecoE("ua").fleet?ecoE("ua").fleet.su24:null,
      hasApi: !!window.BV_AVIA_API, dist: typeof HOOKS.avia }
    }catch(e){return "ERR "+e.stack.slice(0,300)}})()`);
  t('старт: авіабаза побудована', st && st.airfields > 0, st);
  t('стоянки = парк сторони (Ту-95)', st.ruTu95 === st.fleetTu95, st);
  t('стоянки = парк сторони (Су-24)', st.uaSu24 === st.fleetSu24, st);
  t('API авіації доступний', st.hasApi === true);

  // 2) пуск: Ту-95 з Енгельса, 8 ракет Х-101 (1 носій) по Києву
  const pick = await ev(`(()=>{ const i=SITES.findIndex(s=>s.n&&s.t==="strat"&&siteSide(s)==="ru"); return {i, n: SITES[i]&&SITES[i].n}; })()`);
  t('є російський аеродром дальньої авіації', pick.i >= 0, pick);
  const sendLaunch = async (siteIdx, count, mode) => ev(`(()=>{ try{ const ok = HOOKS.launchCfg({siteIdx:${siteIdx}, weapon:"kh101", variant:0, count:${count}, mode:"direct", wps:[], target:[30.52,50.45], targetName:"Київ", spread:0, pointMode:"random", cityIdx:-1, side:"ru", seaTgt:null, seaMode:"patrol", seaPt:null, pl:null, fpvPt:null, tk:null, pt:null, sel:null });
      return { ok: !!ok, queue: window.BV_AVIA.list().reduce((s,a)=>s+a.q.length,0), parked: window.BV_AVIA.parkedSide("ru","tu95") }; }catch(e){ return "ERR "+e.stack.slice(0,300); } })()`);
  await ev(`(()=>{ window.__wlog=[]; const _sw=spawnWeapon; spawnWeapon=(...a)=>{ if(a[6]&&/Ту-95/.test(a[6].from||'')) window.__wlog.push(SIM.t); return _sw(...a); }; SIM.scale=60; return 1; })()`);
  const L1 = await sendLaunch(pick.i, 6);
  t('пуск прийнято', L1 && L1.ok === true, L1);
  t('літак зі стоянки пішов у чергу зльоту (стоянка −1)', L1.parked === st.ruTu95 - 1 && L1.queue === 1, L1);

  // 3) спостереження за політом: зліт, поетапні пуски, повернення, посадка, підготовка
  const seen = { takeoff: 0, phases: new Set(), wpn: [] };
  const deadline = Date.now() + 270000; let landedPrep = false; let wpnMax = 0;
  while (Date.now() < deadline){
    const s = await ev(`(()=>{ const B=window.BV_AVIA, U=[...units.values()].filter(u=>u.avia);
      const ws=[...units.values()].filter(u=>u.kind==="w" && u.sd==="ru" && /Енгельс/.test((u.meta&&u.meta.from)||""));
      return { t: SIM.t, air: U.map(u=>({ph:u.meta.phase, load:u.meta.load, key:u.key})), prep: B.count("ru","tu95").prep, queue: B.count("ru","tu95").queue, parked: B.parkedSide("ru","tu95"), w: ws.length }; })()`);
    if (s.air.length) { seen.takeoff = seen.takeoff || 1; s.air.forEach(a => seen.phases.add(a.ph.split(' ')[0] + ' ' + (a.ph.split(' ')[1] || ''))); }
    wpnMax = Math.max(wpnMax, s.w);
    if (s.prep > 0) landedPrep = true;
    if (landedPrep && !s.air.length && s.parked === st.ruTu95) break;
    await p.waitForTimeout(1000);
  }
  t('зліт: літак з’явився в небі', seen.takeoff === 1);
  t('етап зльоту: «Розгін на смузі» показано', [...seen.phases].some(x => x.startsWith('Розгін')), [...seen.phases]);
  const wl = await ev(`window.__wlog.slice()`);
  t('ракети пішли: усі 6 ракет Х-101', wl.length === 6, wl);
  const distinct = new Set(wl.map(x => Math.round(x * 10))).size, span = wl.length ? Math.max(...wl) - Math.min(...wl) : 0;
  t('пуски поетапні: не одним залпом (ракети в різні моменти)', distinct >= 4 && span >= 6, { distinct, span: +span.toFixed(1), wl: wl.map(x => +x.toFixed(1)) });
  t('після посадки літак на підготовці, далі — знову на стоянці', landedPrep && (await ev(`window.BV_AVIA.parkedSide("ru","tu95")`)) === st.ruTu95, { landedPrep });
  const fin = await ev(`(()=>{ const E=ecoE("ru"); const B=window.BV_AVIA; return { fleet: E.fleet.tu95, parked: B.parkedSide("ru","tu95"), prep: B.count("ru","tu95").prep, queue: B.count("ru","tu95").queue, air: [...units.values()].filter(u=>u.avia&&u.key==="tu95").length }; })()`);
  t('баланс парку: стоянка+підготовка+черга+повітря = парку', fin.parked + fin.prep + fin.queue + fin.air === fin.fleet, fin);

  // 4) пошкодження: половина смуг; знищення аеродрому з літаками на стоянці
  const dmg = await ev(`(()=>{ const B=window.BV_AVIA, a=B.list().find(x=>x.ref===SITES[${pick.i}]), oi=a.ref._oi;
    GAME.obj[oi]=OBJS[oi].hp*0.5; HOOKS.avTick("ru"); const k=a.k, alive=a.alive;
    return {rw:a.rw, k, alive}; })()`);
  t('пошкоджений аеродром: менше робочих смуг', dmg.k < dmg.rw && dmg.alive, dmg);
  const kill = await ev(`(()=>{ const B=window.BV_AVIA, E=ecoE("ru"), a=B.list().find(x=>x.ref===SITES[${pick.i}]), oi=a.ref._oi;
    const before={fleet:E.fleet.tu95, parked:B.parkedSide("ru","tu95")}; GAME.obj[oi]=0; HOOKS.avTick("ru");
    return {before, after:{fleet:E.fleet.tu95, parked:B.parkedSide("ru","tu95")}, dead:a.dead, alive:B.alive(a)}; })()`);
  t('знищено аеродром: закрито', kill.dead === true && kill.alive === false, kill);
  t('знищено аеродром: з парку втрачено літаки стоянки', kill.after.fleet === kill.before.fleet - (kill.before.parked - kill.after.parked) && kill.after.fleet <= kill.before.fleet, kill);

  // 5) другий пуск з іншого аеродрому: авіація не злітає з закритого
  const L2 = await sendLaunch(pick.i, 4);
  t('пуск з знищеного аеродрому відхилено', L2 && L2.ok === false, L2);

  // 6) гравець обрав базування: strict без літаків — відмова
  await ev(`(()=>{ HOOKS.avia.AVX.pick.base = null; })()`);
  console.log('errors', errs.slice(0, 5));
  t('немає помилок JS', errs.length === 0, errs.slice(0, 3));
  console.log(bad === 0 ? `OK: ${ok} перевірок` : `Провалено: ${bad} (пройдено ${ok})`);
  if (bad) process.exitCode = 1;
  await b.close();
})();
