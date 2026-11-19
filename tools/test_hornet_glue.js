/* Інтеграційний тест «склейки» ІІ-Хорнета з грою. Запуск: node tools/test_hornet_glue.js
   Бере РЕАЛЬНИЙ код із dist/game_ultra.html (блок склейки, hav, offKm) і виконує його з мінімальними заглушками гри.
   Це НЕ запуск самої гри в браузері: рендер, карта, мережа й справжні ППО-юніти тут не беруть участі. */
"use strict";
const fs = require("fs"), path = require("path");
const H = require("../src/js/02b_hornet_ai.js");
const dist = fs.readFileSync(path.join(__dirname, "../dist/game_ultra.html"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c){ pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ ПРОВАЛ: " + m); } };

console.log("A. Патч у dist застосовано на всіх 5 місцях");
const start = dist.indexOf("/* ---------- етап 7.52: «Хорнет» з ІІ"), end = dist.indexOf("/* ---------- етап 7.14: розвідувальний БпЛА кружляє");
ok(start > 0 && end > start, "блок склейки знайдено в dist");
ok(/hornet:\s*\{[^}]*ai: true/.test(dist), "WEAPONS.hornet має ai: true");
ok(dist.includes("if (W.ai) u.onEnd = r => hornetBegin(r, W);"), "spawnWeapon: onEnd → hornetBegin");
ok(dist.includes("if (u.ai){ hornetStep(u, sd); return; }"), "stepUnit: диспетчер hornetStep");
ok(dist.includes("else if (u.ai) h = u.ai.h;"), "renderUnits: висота ІІ-дрона");
ok(dist.includes('<script id="bvHornetAI">') && dist.indexOf('id="bvHornetAI"') < dist.indexOf('<script id="bvBoot">'), "модуль ІІ завантажується до гри");
const glue = dist.slice(start, end);
const hav = dist.match(/function hav\(a, b\)\{[\s\S]*?\n\}/)[0];
const offKm = dist.match(/const offKm = [^\n]+/)[0];

/* ---------- заглушки гри ---------- */
function world(o){
  const w = { units: new Map(), toasts: [], strikes: [], impacts: [], leaks: 0 };
  const src = `
    const D2R = Math.PI / 180;
    ${hav}
    ${offKm}
    const other = sd => sd === "ua" ? "ru" : "ua";
    const WEAPONS = { hornet: { km: 125, ad: "tac", ai: true } };
    const OBJS = W.objs, GAME = W.GAME, ADS = W.ADS, AD_TYPES = W.AD_TYPES, HOOKS = W.HOOKS, units = W.units;
    const gameClock = () => GAME.clock;
    const objDead = i => i != null && GAME.on && GAME.mode !== "free" && GAME.obj[i] <= 0;
    const impact = (p, k) => W.impacts.push([p, k]);
    const toast = m => W.toasts.push(m);
    ${glue}
    return { hornetBegin, hornetStep, W: WEAPONS.hornet };
  `;
  w.objs = o.objs || [];
  w.GAME = Object.assign({ on: true, mode: "ready", clock: 12 * 60, obj: w.objs.map(() => 10) }, o.GAME || {});
  w.ADS = { units: new Map() }; w.AD_TYPES = { s: { r: 3 } };
  w.HOOKS = { onLeak: () => { w.leaks++; }, onStrike: u => w.strikes.push(u.pos.slice()) };
  global.window = global.window || {}; window.BV_HORNET_AI = H;
  const api = new Function("W", src)(w);
  w.api = api;
  return w;
}
const C0 = [35.0, 48.0];                                             // «центр району» (умовна точка)
const kx = 111.32 * Math.cos(C0[1] * Math.PI / 180), ky = 110.574;
const at = (e, n) => [C0[0] + e / kx, C0[1] + n / ky];
const obj = (i, e, n, t, nm, side) => ({ i, n: nm || ("Об'єкт " + i), side: side || "ru", t: t || "launch", c: at(e, n) });
function mkUnit(w, id, sd, L){
  const u = { id, kind: "w", key: "hornet", sd: sd || "ua", pos: C0.slice(), hdg: 90, spd: 3.04, L: L || 60, s: L || 60, meta: { target: "x" } };
  w.units.set(id, u); return u;
}
function run(w, u, maxSteps = 6000, dt = 0.1){
  w.api.hornetBegin(u, w.api.W);
  let n = 0; while (w.units.has(u.id) && !u.fall && n++ < maxSteps) w.api.hornetStep(u, dt);
  return u;
}

console.log("B. Хорнет сам знаходить військовий об'єкт; міста ігнорує; удар іде через onStrike");
{
  let hit = 0, near = 0, cityHit = 0, N = 40;
  for (let s = 1; s <= N; s++){
    const w = world({ objs: [obj(0, 2, 1.5, "launch", "Рубіж Т1"), obj(1, 0.5, 0.5, "city", "Місто"), obj(2, 60, 0, "launch", "Далекий")] });
    const u = run(w, mkUnit(w, s * 31 + 7));
    if (w.strikes.length){ hit++; const p = w.strikes[0], d = Math.hypot((p[0] - C0[0]) * kx - 2, (p[1] - C0[1]) * ky - 1.5); if (d < 4) near++; }
    if (w.toasts.some(m => /Місто/.test(m))) cityHit++;
  }
  console.log("     ударів: " + hit + "/" + N + ", у радіусі ураження (4 км) від об'єкта: " + near);
  ok(hit >= N * 0.9, "знаходить і вражає ≥ 90% польотів");
  ok(near >= hit * 0.9, "точка влучання — біля самого об'єкта (onStrike отримує коректну позицію)");
  ok(cityHit === 0, "місто ніколи не обирається ціллю");
}

console.log("C. Нічого немає → дрон падає, тост із поясненням, onStrike не викликано");
{
  const w = world({ objs: [obj(0, 60, 0, "launch")] });
  const u = run(w, mkUnit(w, 5));
  ok(!!u.fall && w.strikes.length === 0, "u.fall задано, ударів немає");
  ok(w.toasts.some(m => /ціль не знайдено/.test(m)), "гравець бачить причину");
  ok(u.ai === null && u.meta.lo === 0, "ІІ-стан очищено");
}

console.log("D. Знищений об'єкт ігнорується");
{
  const w = world({ objs: [obj(0, 2, 1.5, "launch")] }); w.GAME.obj[0] = 0;
  const u = run(w, mkUnit(w, 9));
  ok(w.strikes.length === 0 && !!u.fall, "по вже знищеному об'єкту удару немає");
}

console.log("E. Свої об'єкти не атакуються (сторона дрона = ua → шукає лише ru)");
{
  const w = world({ objs: [obj(0, 2, 1.5, "launch", "Свій", "ua")] });
  const u = run(w, mkUnit(w, 11, "ua"));
  ok(w.strikes.length === 0, "об'єкт своєї сторони не є ціллю");
}

console.log("F. Час доби з ігрового годинника потрапляє у видимість ІІ (детерміновано)");
{
  const visAt = clock => { const w = world({ objs: [obj(0, 2, 1.5)], GAME: { clock } }); const u = mkUnit(w, 3); w.api.hornetBegin(u, w.api.W); w.api.hornetStep(u, 0.1); return u.ai.env.vis; };
  const noon = visAt(12 * 60), night = visAt(2 * 60), dusk = visAt(20.5 * 60);
  console.log("     vis: полудень " + noon + " · сутінки " + dusk.toFixed(2) + " · ніч " + night);
  ok(noon === 1 && night === 0.55 && dusk > night && dusk < noon, "полудень 1.0 → сутінки → ніч 0.55");
  const wf = world({ objs: [obj(0, 2, 1.5)], GAME: { on: false, mode: "free" } }); const uf = mkUnit(wf, 4); wf.api.hornetBegin(uf, wf.api.W);
  ok(uf.ai.env.vis === 1, "у вільному полігоні видимість завжди 1.0");
}

console.log("G. ППО противника потрапляє в оцінку загрози (детерміновано)");
{
  const w = world({ objs: [obj(0, 2.2, 0.3, "launch", "Прикрита"), obj(1, -2.2, -0.3, "launch", "Вільна")] });
  w.ADS.units.set(1, { side: "ru", key: "s", pos: at(2.2, 0.3), mag: 10 });
  const u = mkUnit(w, 8); w.api.hornetBegin(u, w.api.W);
  const e = u.ai.env, th1 = e.threat([2.2, 0.3]), th2 = e.threat([-2.2, -0.3]);
  console.log("     загроза: прикрита " + th1.toFixed(2) + " · вільна " + th2.toFixed(2));
  ok(th1 > 0.4 && th2 === 0, "біля ППО загроза висока, далеко — нульова");
  w.ADS.units.set(1, { side: "ua", key: "s", pos: at(2.2, 0.3), mag: 10 });
  ok(e.threat([2.2, 0.3]) === 0, "своє ППО загрозою не вважається");
  w.ADS.units.set(1, { side: "ru", key: "s", pos: at(2.2, 0.3), mag: 0 });
  ok(e.threat([2.2, 0.3]) === 0, "ППО без боєкомплекту не загрожує");
}

console.log("H. Налагодження: BV_HORNET.explain повертає журнал рішень");
{
  const w = world({ objs: [obj(0, 2, 1.5, "launch", "Рубіж Т1")] });
  const u = mkUnit(w, 21); w.api.hornetBegin(u, w.api.W);
  for (let i = 0; i < 60; i++) w.api.hornetStep(u, 0.1);
  const log = H.explain(u.ai.brain);
  ok(log.length >= 1 && /Початок пошуку/.test(log[0].msg), "є запис «Початок пошуку» з параметрами району");
  ok(/ІІ-пошук|Супровід|Розпізнавання|Атака/.test(u.meta.target), "підпис стану в u.meta.target: «" + u.meta.target + "»");
}

console.log("\nПідсумок: " + pass + " пройдено, " + fail + " провалено");
process.exit(fail ? 1 : 0);
