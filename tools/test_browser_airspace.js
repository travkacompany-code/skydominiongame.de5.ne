// Браузерний тест «Повітряний простір» (етап 7.73): node tools/test_browser_airspace.js <abs dist.html>
const { chromium } = require('playwright'); const path = require('path');
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/maplibre-gl\.(js|css)/, r => { const u = r.request().url(); r.fulfill(u.endsWith('.css') ? { path: path.join(__dirname, 'maplibre-gl.css'), contentType: 'text/css' } : { path: path.join(__dirname, 'mlstub.js'), contentType: 'application/javascript' }); });
  await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/, r => r.abort());
  await p.goto('file://' + process.argv[2] + '#debug'); await p.waitForTimeout(4000);
  const ev = code => p.evaluate(c => { try { return window.BV_EVAL(c); } catch (e) { return 'ERR ' + e.stack.slice(0, 400); } }, code);

  const st = await ev(`(()=>{ startGame({mode:"duel",ctx:"sandbox",ctrl:{ua:"me",ru:"bot"}}); GAME.phase="run"; SIM.paused=false;
    const X=window.BV_DIP._; return { on: !!X.D, avail: window.BV_DIP.available(), air: !!X.D.air, st: X.AIRST }; })()`);
  t('старт: дипломатія й стан неба є', st && st.avail && st.air, st);

  // --- умови доступності
  const g1 = await ev(`(()=>{ const X=BV_DIP._; X.setR("ua","pl",70); X.D.air.cool={};
    const a=X.evalAir("ua","pl","corr"); X.setR("ua","pl",10); const b=X.evalAir("ua","pl","corr"); X.setR("ua","pl",70);
    const c=X.evalAir("ua","by","corr"), d=X.evalAir("ua","hu","corr"), e=X.evalAir("ua","us","corr");
    return { a:{blk:a.blk,g:a.gates,p:a.p,rk:a.rk.v,cm:a.cm.v}, b:{blk:b.blk,g:b.gates}, c:c.blk, d:d.blk, e:e.blk }; })()`);
  t('УА→PL: усі три умови виконано, запит доступний', !g1.a.blk && g1.a.g.rel && g1.a.g.cmp && g1.a.g.rsk && g1.a.p > 0.2, g1.a);
  t('низькі відносини блокують запит', /відносини/i.test(g1.b.blk || '') && !g1.b.g.rel, g1.b);
  t('УА→BY заблоковано (відносини)', !!g1.c, g1.c); t('УА→HU заблоковано', !!g1.d, g1.d); t('УА→США: немає неба на мапі', /немає неба/.test(g1.e || ''), g1.e);
  const g2 = await ev(`(()=>{ const X=BV_DIP._; X.setR("ua","pl",70); const ide=X.D.ide.pl; X.D.ide.pl=0.95; X.D.tr=X.D.tr.filter(q=>!((q.a==="ua"&&q.b==="pl")||(q.a==="pl"&&q.b==="ua")));
    const a=X.evalAir("ua","pl","corr"); X.D.ide.pl=ide; X.D.air.inc.pl=9; const b=X.evalAir("ua","pl","wide"); X.D.air.inc.pl=0; return { a:{blk:a.blk,cm:a.cm.v}, b:{blk:b.blk,rk:b.rk.v} }; })()`);
  t('політична несумісність блокує запит', /сумісність/.test(g2.a.blk || ''), g2.a);
  t('високий ризик ескалації блокує запит', /Ризик/.test(g2.b.blk || ''), g2.b);

  // --- відправка, очікування, три результати
  const out = await ev(`(()=>{ const X=BV_DIP._, r={deny:0,full:0,cond:0,wait:0,dec:0}; let sample=null;
    for (let i=0;i<260;i++){
      X.fresh(); X.D.ai=false; X.D.st["ru|ua"]={s:"war",since:0}; X.setR("ua","pl",85); X.D.tr.push({id:9001,type:"military",a:"ua",b:"pl",t0:0});
      const E=ecoE("ua"); if(E) E.money=500;
      X.airSend("pl","corr"); const rq=X.D.air.req[0]; if(!rq) return {err:"no request", blk:X.evalAir("ua","pl","corr").blk};
      if (i===0) r.wait = rq.dec - X.D.t;
      X.airTick(); if (X.D.air.req.length!==1) return {err:"request resolved before time", n:X.D.air.req.length};
      X.D.t = rq.dec; X.airTick();
      const pm=X.permsOf("ua"), of=X.D.pend.filter(q=>q.type==="airc");
      if (pm.length){ r.full++; sample=sample||{kind:"full",q:pm[0]}; } else if (of.length){ r.cond++; if(!r.condSample) r.condSample=of[0].air; } else { r.deny++; r.dec++; }
    }
    return r; })()`);
  t('запит створює очікування рішення', out && out.wait >= 5 && out.wait <= 90, out);
  t('трапляються повний дозвіл, умовна пропозиція і відмова', out.full > 0 && out.cond > 0 && out.deny > 0, out);
  t('умовна пропозиція має обмеження й термін', out.condSample && out.condSample.t.dur > 0 && (out.condSample.t.cap > 0) && out.condSample.t.fee > 0, out.condSample);

  // --- відмова: відносини й кулдаун; прийняття умов: гроші, репутація, відносини
  const eff = await ev(`(()=>{ const X=BV_DIP._; let res={};
    for (let i=0;i<400 && !(res.den&&res.cond);i++){
      X.fresh(); X.D.ai=false; X.D.st["ru|ua"]={s:"war",since:0}; X.setR("ua","pl",85); X.D.tr.push({id:9001,type:"military",a:"ua",b:"pl",t0:0}); const E=ecoE("ua"); E.money=500;
      const r0=X.R("ua","pl"), rp0=X.D.rep.ua, rr0=X.R("ru","pl"); X.airSend("pl","corr"); const rq=X.D.air.req[0]; X.D.t=rq.dec; X.airTick();
      const of=X.D.pend.find(q=>q.type==="airc");
      if (!res.den && !X.permsOf("ua").length && !of){ res.den={dr:X.R("ua","pl")-r0, cool:X.D.air.cool["ua>pl"]-X.D.t, stat:X.D.air.stat.ua.den, again:X.evalAir("ua","pl","corr").blk}; }
      if (!res.cond && of){ const m0=E.money; X.answerPend(of.id,true); const q=X.permFor("ua","pl");
        res.cond={ granted:!!q, paid:+(m0-E.money).toFixed(1), fee:of.air.t.fee, dRel:X.R("ua","pl")-r0, dRep:X.D.rep.ua-rp0, foe:X.R("ru","pl")-rr0, pendLeft:X.D.pend.filter(z=>z.type==="airc").length, stat:X.D.air.stat.ua.cond, until:q&&q.until-X.D.t, km:q&&q.km, cap:q&&q.cap }; }
    } return res; })()`);
  t('відмова: відносини падають, є перерва на повторний запит', eff.den && eff.den.dr < 0 && eff.den.cool > 0 && eff.den.stat === 1 && /через/.test(eff.den.again || ''), eff.den);
  t('умовний дозвіл: сплачено плату, дозвіл із терміном і лімітом', eff.cond && eff.cond.granted && Math.abs(eff.cond.paid - eff.cond.fee) < 0.01 && eff.cond.until > 0 && eff.cond.cap > 0 && eff.cond.pendLeft === 0, eff.cond);
  t('дозвіл покращує відносини, піднімає репутацію й псує відносини противника з країною', eff.cond && eff.cond.dRel > 0 && eff.cond.dRep > 0 && eff.cond.foe < 0, eff.cond);

  // --- вплив на маршрути: Росія через Білорусь
  const rt = await ev(`(()=>{ const X=BV_DIP._; X.fresh(); X.D.st["ru|ua"]={s:"war",since:0}; const a=[32.0,54.6], bb=[24.0,49.84];
    const len=P=>{let s=0;for(let i=1;i<P.length;i++)s+=hav(P[i-1],P[i]);return s;}, geoOf=P=>{const g=X.airGeo(FOREIGN);let n=0;for(const q of P){const ix=Math.floor((q[0]-g.F.lon0)/g.F.step),iy=Math.floor((q[1]-g.F.lat0)/g.F.step);const i=iy*g.F.nx+ix;if(g.cid[i]===4&&g.dist[i]>5)n++;}return n;};
    const route=side=>{ safeCache.clear(); ROUTE_SIDE=side; try{ return avoidForeign(densify(buildRoute(a,bb,"direct",[]),4)); } finally { ROUTE_SIDE=null; } };
    const n0=route("ru"), g0=window.BV_DIP.airGrid("ru",transitInit(),FOREIGN);
    X.setR("ru","by",80); X.D.air.cool={}; X.D.air.perm.push({id:9100,sd:"ru",st:"by",scope:"corr",t0:X.D.t,until:X.D.t+200,km:90,cap:0,noBal:false,fee:0,uses:0,viol:0}); X.D.air.ver++;
    const nR=route("ru"), nU=route("ua"), gR=window.BV_DIP.airGrid("ru",transitInit(),FOREIGN), gU=window.BV_DIP.airGrid("ua",transitInit(),FOREIGN);
    X.D.air.perm.length=0; X.D.air.ver++; const nA=route("ru");
    return { base:len(n0), withPermit:len(nR), uaWith:len(nU), after:len(nA), inBYbase:geoOf(n0), inBYpermit:geoOf(nR), inBYua:geoOf(nU), noGridBefore:g0===null, ruGrid:!!gR, uaGrid:gU===null }; })()`);
  t('без дозволів сітка не підміняється (стара поведінка)', rt.noGridBefore === true, rt);
  t('дозвіл відкриває коридор: маршрут РФ коротший і йде над Білоруссю', rt.withPermit < rt.base - 20 && rt.inBYpermit > 0 && rt.inBYbase === 0, rt);
  t('дозвіл діє лише для своєї сторони', rt.uaGrid === true && Math.abs(rt.uaWith - rt.base) < 1 && rt.inBYua === 0, rt);
  t('після завершення дозволу маршрут повертається', Math.abs(rt.after - rt.base) < 1, rt);

  // --- використання: ліміт пусків і порушення умов
  const use = await ev(`(()=>{ const X=BV_DIP._; X.fresh(); X.D.st["ru|ua"]={s:"war",since:0}; X.setR("ru","by",80); GAME.ctrl.ru="bot";
    const a=[32.0,54.6], bb=[24.0,49.84]; const E=ecoE("ru"); const rep0=X.D.rep.ru;
    X.D.air.perm.push({id:9101,sd:"ru",st:"by",scope:"corr",t0:X.D.t,until:X.D.t+200,km:90,cap:3,noBal:true,fee:0,uses:0,viol:0}); X.D.air.ver++;
    const n0=units.size; spawnWeapon("kh101",0,a,bb,"direct",[],{}); const u1=X.permFor("ru","by").uses;
    spawnWeapon("kh101",0,a,bb,"direct",[],{}); const u2=X.permFor("ru","by").uses; const r0=X.R("ru","by");
    spawnWeapon("iskander",0,a,bb,"direct",[],{}); const gone=!X.permFor("ru","by");
    const out={ u1,u2,spawned:units.size-n0, gone, dRel:X.R("ru","by")-r0, dRep:X.D.rep.ru-rep0, viol:X.D.air.stat.ru.viol, inc:X.D.air.inc.by, cool:X.D.air.cool["ru>by"]-X.D.t, blk:X.evalAir("ru","by","corr").blk };
    X.D.air.perm.push({id:9102,sd:"ru",st:"by",scope:"corr",t0:X.D.t,until:X.D.t+200,km:90,cap:2,noBal:false,fee:0,uses:0,viol:0}); X.D.air.ver++;
    spawnWeapon("kh101",0,a,bb,"direct",[],{}); spawnWeapon("kh101",0,a,bb,"direct",[],{}); out.capEnded=!X.permFor("ru","by"); out.hist=X.D.air.hist.map(h=>h.how);
    return out; })()`);
  t('використання дозволу рахується, ракети летять', use.u1 === 1 && use.u2 === 2 && use.spawned >= 2, use);
  t('порушення умов: дозвіл знято, відносини/репутація падають, інцидент і перерва', use.gone && use.dRel <= -10 && use.dRep <= -7 && use.viol === 1 && use.inc === 1 && use.cool > 100, use);
  t('ліміт пусків вичерпує дозвіл', use.capEnded === true && use.hist.includes('limit'), use);

  // --- термін, попередження, відкликання, ІІ
  const ex = await ev(`(()=>{ const X=BV_DIP._; X.fresh(); X.D.st["ru|ua"]={s:"war",since:0}; X.setR("ua","pl",70); const o={};
    X.D.air.perm.push({id:9201,sd:"ua",st:"pl",scope:"corr",t0:X.D.t,until:X.D.t+20,km:90,cap:0,noBal:false,fee:0,uses:4,viol:0}); X.D.air.ver++;
    const tr0=X.D.air.trust["ua>pl"]||0; X.airTick(); o.warned=X.D.air.perm[0]&&X.D.air.perm[0].warned; BV_DIP.step(25); o.gone=!X.permFor("ua","pl"); o.trust=(X.D.air.trust["ua>pl"]||0)-tr0; o.hist=X.D.air.hist.map(h=>h.how);
    X.D.air.perm.push({id:9202,sd:"ua",st:"pl",scope:"corr",t0:X.D.t,until:X.D.t+500,km:90,cap:0,noBal:false,fee:0,uses:0,viol:0}); X.D.air.ver++; X.setR("ua","pl",-40); X.D.base["pl|ua"]=-40; X.airTick();
    o.revoked=!X.permFor("ua","pl"); o.hist2=X.D.air.hist.map(h=>h.how); o.logBad=X.D.log.some(l=>/відкликала/.test(l.x));
    return o; })()`);
  t('попередження перед завершенням, штатне завершення підвищує довіру', ex.warned === true && ex.gone === true && ex.trust > 0 && ex.hist.includes('expired'), ex);
  t('погіршення відносин → країна відкликає дозвіл', ex.revoked && ex.hist2.includes('revoked') && ex.logBad, ex);

  // --- UI
  const ui = await ev(`(()=>{ const X=BV_DIP._; X.fresh(); X.D.st["ru|ua"]={s:"war",since:0}; X.setR("ua","pl",70); X.D.air.perm.push({id:9301,sd:"ua",st:"ro",scope:"corr",t0:X.D.t,until:X.D.t+120,km:90,cap:8,noBal:true,fee:2,uses:1,viol:0,cond:true}); X.D.air.ver++;
    X.D.pend.push({id:9302,from:"pl",to:"ua",type:"airc",exp:X.D.t+50,t0:X.D.t,air:{scope:"corr",t:{km:70,cap:6,noBal:true,fee:3,dur:90}}});
    document.getElementById("gmDip")||X.mountUi(); BV_DIP.toggle(true); const o={};
    X.UI.tab="c"; X.UI.sel="pl"; X.render(true); o.c=document.getElementById("gmDip").innerText; o.gates=document.querySelectorAll("#gmDip .dp-gate").length; o.tag=!!document.querySelector("#gmDip .dp-t.air");
    X.UI.tab="a"; X.render(true); o.a=document.getElementById("gmDip").innerText; X.UI.tab="e"; X.render(true); o.e=document.getElementById("gmDip").innerText; X.UI.tab="t"; X.render(true); X.UI.tab="w"; X.render(true);
    return o; })()`);
  t('картка країни: умови-чіпи й кнопка запиту', ui.gates === 3 && /Запросити небо/.test(ui.c) && /Відносини/.test(ui.c) && /Ризик/.test(ui.c), ui.c && ui.c.slice(0, 300));
  t('вкладка «Небо»: дозвіл, умови, історія', /Діючі дозволи/.test(ui.a) && /без балістики/.test(ui.a) && /пусків 1\/8/.test(ui.a) && /Кому можна написати/.test(ui.a), ui.a && ui.a.slice(0, 300));
  t('вкладка «Події»: картка умовної пропозиції', /умовах/.test(ui.e) && /Прийняти/.test(ui.e), ui.e && ui.e.slice(0, 200));

  // --- збереження/завантаження
  const sv = await ev(`(()=>{ const X=BV_DIP._; X.D.air.trust["ua>pl"]=12; X.save(true); const n=X.permsOf("ua").length; X.load(); return { n, n2:X.permsOf("ua").length, tr:X.D.air.trust["ua>pl"], statOK: !!X.D.air.stat.ua && !!X.D.air.stat.ru }; })()`);
  t('стан неба переживає збереження', sv.n2 === sv.n && sv.tr === 12 && sv.statOK, sv);
  const old = await ev(`(()=>{ const X=BV_DIP._; const o=JSON.parse(localStorage.getItem(X.SK())); delete o.air; localStorage.setItem(X.SK(), JSON.stringify(o)); X.load(); return { ok: !!X.D.air && Array.isArray(X.D.air.perm) && !!X.D.air.stat.ua }; })()`);
  t('старе збереження без неба завантажується', old.ok === true, old);

  // --- ІІ-сторона просить небо; регрес: звичайна гра крутиться без помилок
  const ai = await ev(`(()=>{ const X=BV_DIP._; X.fresh(); X.D.st["ru|ua"]={s:"war",since:0}; GAME.ctrl.ru="bot"; X.D.ai=true; let asked=0; for(let i=0;i<400;i++){ X.airTick(); } return { asked:(X.D.log.filter(l=>/запросила небо/.test(l.x)).length), perms:X.D.air.perm.length, hist:X.D.air.hist.length }; })()`);
  t('ІІ-сторона (РФ) надсилає запити на небо', ai.asked > 0, ai);
  await ev(`SIM.scale=30; 1`); await p.waitForTimeout(6000);
  t('без помилок сторінки', errs.length === 0, errs.slice(0, 5));
  console.log(`\n${ok} ✓  ${bad} ✗`); await b.close(); process.exit(bad ? 1 : 0);
})();
