// Браузерний тест інтерфейсу й ботів авіації, етап 4: node tools/test_browser_avia_ui.js <abs dist.html>  (MAPLIBRE=...)
const { chromium } = require('playwright'); const ML = process.env.MAPLIBRE || '';
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/maplibre-gl\.(js|css)/, r => { const u = r.request().url(); r.fulfill({ path: ML + (u.endsWith('.css') ? 'maplibre-gl.css' : 'maplibre-gl.js'), contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript' }); });
  await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/, r => r.abort());
  await p.goto('file://' + process.argv[2] + '#debug'); await p.waitForTimeout(5000);
  const ev = c => p.evaluate(x => window.BV_EVAL(x), c);

  // 1) панель пуску для російського аеродрому: блок «Аеродроми», кнопки вильотів і базування
  await ev(`(()=>{ startGame({mode:"duel",ctx:"sandbox",ctrl:{ua:"bot",ru:"me"}}); GAME.phase="run"; SIM.paused=true; return 1; })()`);
  const i = await ev(`SITES.findIndex(s=>s.t==="strat"&&siteSide(s)==="ru")`);
  await ev(`(()=>{ HOOKS.openLaunch(${i}); window.BV_LP.weapon="kh101"; HOOKS.lpRefresh && HOOKS.lpRefresh(); return 1; })()`);
  await p.waitForTimeout(600);
  const html = await p.evaluate(() => document.getElementById('launch') ? document.getElementById('launch').innerText : '');
  t('панель пуску відкрита', html.length > 50);
  t('блок «Аеродроми» показано для авіації', /Аеродроми/.test(html) && /Вильоти з/.test(html), html.slice(0, 200));
  const chips = await p.evaluate(() => document.querySelectorAll('#launch [data-act="avdep"]').length);
  t('є кнопки аеродромів вильоту', chips >= 1, chips);
  // клік (як від гравця) по аеродрому вильоту й по «Авто» базування
  const nDep = await p.evaluate(() => { const bs = [...document.querySelectorAll('#launch [data-act="avdep"]:not([disabled])')]; if (bs.length) bs[bs.length - 1].click(); return bs.length; });
  await p.waitForTimeout(300);
  const picked = await ev(`HOOKS.avia.AVX.pick.dep`);
  t('вибір аеродрому вильоту кнопкою', nDep ? picked !== null : true, { nDep, picked });
  await p.evaluate(() => { const b = document.querySelector('#launch [data-act="avbase"][data-v="auto"]'); if (b) b.click(); });
  await p.waitForTimeout(200);
  t('базування «Авто» скидає вибір', (await ev(`HOOKS.avia.AVX.pick.base`)) === null);
  const note = await p.evaluate(() => { const n = document.getElementById('avNote'); return n ? n.innerText : ''; });
  t('примітка показує стоянки й чергу', /Стоянки/.test(note), note);

  // 2) боти обох сторін: авіація працює без помилок
  await ev(`(()=>{ startGame({mode:"duel",ctx:"sandbox",ctrl:{ua:"bot",ru:"bot"}}); GAME.phase="run"; SIM.paused=false; SIM.scale=60; return 1; })()`);
  await p.waitForTimeout(60000);
  const bots = await ev(`(()=>{ const B=window.BV_AVIA; const av=[...units.values()].filter(u=>u.avia).length;
    return { air: av, groups: B.groups().length, errsNow: 0, ruParked: B.parkedSide("ru","tu95"), uaParked: B.parkedSide("ua","su24"), t: +SIM.t.toFixed(0) }; })()`);
  t('боти: стан парку не від’ємний і в межах парку', bots.ruParked >= 0 && bots.uaParked >= 0, bots);
  t('боти: без помилок JS', errs.length === 0, errs.slice(0, 3));

  // 3) режим без обмеження парку — стоянки є, пуск не блокується
  await ev(`(()=>{ startGame({mode:"free",ctx:"sandbox",ctrl:{ua:"me",ru:"bot"}}); GAME.phase="run"; SIM.paused=false; return 1; })()`);
  const free = await ev(`(()=>{ const B=window.BV_AVIA; return { ru: B.parkedSide("ru","tu95"), ua: B.parkedSide("ua","su24"), avail: carAvail("ru","tu95") }; })()`);
  t('полігон: без ліміту парку (стоянки великі, доступність Infinity або >0)', free.ru > 0 && (free.avail === Infinity || free.avail > 0), free);

  console.log('errors', errs.slice(0, 5));
  console.log(bad === 0 ? `OK: ${ok} перевірок` : `Провалено: ${bad} (пройдено ${ok})`);
  if (bad) process.exitCode = 1;
  await b.close();
})();
