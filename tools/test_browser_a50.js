// Браузерний тест ДРЛО А-50У (Росія, етап 8б): node tools/test_browser_a50.js <abs dist.html>  (без MAPLIBRE — заглушка tools/mlstub.js)
const { chromium } = require('playwright'); const ML = process.env.MAPLIBRE || '';
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/maplibre-gl\.(js|css)/, r => { const u = r.request().url(); r.fulfill(ML ? { path: ML + (u.endsWith('.css') ? 'maplibre-gl.css' : 'maplibre-gl.js'), contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript' } : (u.endsWith('.css') ? { body: '', contentType: 'text/css' } : { path: __dirname + '/mlstub.js', contentType: 'application/javascript' })); });
  await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/, r => r.abort());
  await p.goto('file://' + process.argv[2] + '#debug'); await p.waitForTimeout(5000);
  const ev = code => p.evaluate(c => window.BV_EVAL(c), code);
  const st = await ev(`(()=>{ try{ startGame({mode:"duel",ctx:"sandbox",ctrl:{ru:"me",ua:"bot"}}); GAME.phase="run"; SIM.paused=false; SIM.scale=60;
     const T=AD_TYPES.aew_a50; return { type: !!T && T.aew===true, inKeys: AIR_KEYS.ru.includes("aew_a50"), hasSprite: !!SPRITES.aew_a50 }; }catch(e){ return "ERR "+e.stack.slice(0,300); } })()`);
  t('тип А-50У зареєстровано у ППО Росії', st && st.type && st.inKeys && st.hasSprite, st);
  // аеродром України й точка патрулювання над своєю територією
  const pick = await ev(`(()=>{ const i=SITES.findIndex(s=>s.t==="fighter"&&!s.off&&siteSide(s)==="ru"); if(i<0) return null; const c=SITES[i].c;
     let p=null; for (const d of [0.3,0.5,0.8,-0.3,-0.5]) { const q=[c[0]+d,c[1]]; if (patrolOK("ru",q)) { p=q; break; } } return {i, n:SITES[i].n, p}; })()`);
  t('є аеродром Росії й точка патрулювання', pick && pick.i >= 0 && pick.p, pick);
  const tk = await ev(`(()=>{ try{ const u=HOOKS.adAct("takeoff",{site:${pick.i}, key:"aew_a50", ammo:3, patrol:${JSON.stringify(pick.p)}});
     if(!u) return "null"; window.__aew=u.id; return {id:u.id, state:u.state, reserve:u.reserve, mag:u.mag, fuel:u.fuel}; }catch(e){return "ERR "+e.stack.slice(0,300)} })()`);
  t('виліт ДРЛО прийнято', tk && tk.id != null, tk);
  t('з запасу 3 вильоти лишилось 2 (перший виліт)', tk && tk.reserve === 2, tk);
  // спостереження за польотом
  const seen = new Set(); let station = null, fuelMin = 1, maxRange = 0, air = 0; const dl = Date.now() + 120000;
  while (Date.now() < dl){
    const s = await ev(`(()=>{ const u=ADS.units.get(window.__aew); if(!u) return {gone:true};
      const sim=RAD.sim, stn=sim && sim.stations.find(x=>x.id===u.rsid);
      const cov = stn && BV_RADAR.coverage(sim, stn.id);
      return { state: u.state, fuel: u.fuel, rsid: u.rsid||null, h: stn?stn.h:null, rKm: cov?cov.rKm:0, status: stn?stn.status:null,
        x: stn?stn.x:null, t: SIM.t, contacts: sim? sim.pic[u.side].air.length : 0 }; })()`);
    if (s.gone) break;
    seen.add(s.state); if (s.fuel != null) fuelMin = Math.min(fuelMin, s.fuel);
    if (s.rKm) maxRange = Math.max(maxRange, s.rKm);
    if (s.rsid) station = s; air = Math.max(air, s.contacts);
    if (s.state === "patrol" && seen.has("patrol") && station && maxRange > 0 && Date.now() - (dl - 120000) > 25000) break;
    await p.waitForTimeout(1500);
  }
  t('ДРЛО пройшло фази: транзит → патрулювання', seen.has("transit") && seen.has("patrol"), [...seen]);
  t('на патрулюванні є станція РЛС з дальністю огляду', !!station && maxRange > 100, { station, maxRange });
  t('станція на висоті ешелону А-50У (10 км)', station && station.h === 10000, station);
  t('пальне витрачається', fuelMin < 1, fuelMin);
  // зона обнаруження: радіус покриття станції ДРЛО і її видимість на карті (малювання — шар radz; стиль карти в тесті без тайлів не вантажиться)
  const zone = await ev(`(()=>{ try{ const u=ADS.units.get(window.__aew); const sim=RAD.sim; const stn=sim&&sim.stations.find(x=>x.id===u.rsid);
      const m=stn&&RAD.meta.get(stn.id), cov=stn&&BV_RADAR.coverage(sim,stn.id);
      return { rKm: cov?cov.rKm:0, visible: m?radVisible(m):false, nominal: cov?cov.nominalKm:0 }; }catch(e){ return {err:String(e)}; } })()`);
  t('зона обнаруження ДРЛО: радіус ≈ дальність на висоті, станція видима', zone && zone.rKm > 400 && zone.visible === true, zone);
  // виявлення: за час польоту РЛС ДРЛО бачить цілі противника (контакти у спільній картині)
  const dl3 = Date.now() + 150000; let detected = 0;
  while (Date.now() < dl3 && detected === 0){
    const d = await ev(`(()=>{ const u=ADS.units.get(window.__aew); if(!u||u.state==="base") return -1; const sim=RAD.sim; return sim? sim.pic.ru.air.filter(c=>c.state!=="lost").length : 0; })()`);
    if (d < 0) break; detected = d; await p.waitForTimeout(2000);
  }
  console.log('  ℹ контактів ДРЛО у спільній картині ua:', detected);
  // повернення на базу → посадка → станція зникає
  await ev(`(()=>{ HOOKS.adAct("rtb",{id:window.__aew}); return 1; })()`);
  const dl2 = Date.now() + 120000; let landed = false;
  while (Date.now() < dl2){
    const s = await ev(`(()=>{ const u=ADS.units.get(window.__aew); if(!u) return {gone:true}; const stn=RAD.sim && RAD.sim.stations.find(x=>x.id===u.rsid); return {state:u.state, station: !!stn}; })()`);
    if (s.gone) { landed = 'gone'; break; }
    if (s.state === "base" || s.state === "reload"){ landed = s; break; }
    await p.waitForTimeout(1500);
  }
  t('після RTB ДРЛО сідає (база/перезарядка) і станція знімається з РЛС', landed && (landed === 'gone' || landed.station === false), landed);
  t('немає помилок JS під час сценарію', errs.length === 0, errs.slice(0, 3));
  console.log(`ДРЛО (браузер): OK ${ok}, помилок ${bad}`);
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
