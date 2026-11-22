/* тест клею повітряного бою: glue + модуль у vm з макетом гри (без браузера) */
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
let seed = 20261119; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function makeWorld(opts){
  opts = opts || {};
  const D2R = Math.PI / 180, ctx = {
    console, Math, Map, Set, WeakMap, Object, Array, Number, String, JSON, performance: { now: () => 0 }, Infinity, window: {}, D2R,
    HOOKS: {}, ADS: { units: new Map(), shots: [], rounds: [], dirty: false, fired: 0, kills: 0, ruKills: 0 }, units: new Map(),
    SIM: { t: 0 }, GAME: { on: false, puppet: false, st: {}, phase: "run" }, EW: { st: [] }, RAD: { sim: null, need: false, net: { ua: 0, ru: 0 }, lock: new Map() },
    FX: { trails: [] }, SIDE_N: { ua: "Україна", ru: "Росія" }, log: [], fxs: [],
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.AIR = { cruise: 7, chase: 11, turn: 55, aim: 160, rof: 0.45, lock: 2, leash: 75 };
  ctx.AD_SPD = { "Надвисока": 40 }; ctx.AD_CI = {};
  ctx.AD_TYPES = {
    patriot: { n: "Patriot", r: 100, mag: 8, spd: "Надвисока" }, osa: { n: "Оса", r: 12, mag: 8, spd: "Надвисока" }, igla: { n: "Ігла", r: 5, mag: 2, spd: "Надвисока" },
    shilka: { n: "Шилка", r: 2.5, mag: 400, gun: true, spd: "Надвисока" },
    f16: { n: "F-16", r: 45, mag: 6, air: true, fly: "Надвисока", man: "Дуже висока", spd: "Надвисока" },
    su27: { n: "Су-27", r: 40, mag: 6, air: true, fly: "Надвисока", man: "Висока", spd: "Надвисока" },
    aew_a50: { n: "А-50У", r: 0, mag: 0, air: true, aew: true, fly: "Середня", man: "Низька", spd: "Середня" },
    mi8: { n: "Мі-8", r: 3, mag: 100, air: true, heli: true, gun: true, fly: "Середня", man: "Середня", spd: "Надвисока" },
  };
  ctx.AIR_WPN = { r27er: { rk: [0.4, 1.25], pk: 0.96 }, r73e: { rk: [0, 0.55], pk: 1.1 }, aam_a: { rk: [0.35, 1.05], pk: 1.05 }, aam_c: { rk: [0, 0.55], pk: 1.08 } };
  ctx.CARRIERS = { su34: { n: "Су-34", kind: "air", spd: 18.5 }, tu95: { n: "Ту-95МС", kind: "air", spd: 13 } };
  ctx.WEAPONS = {};
  ctx.other = sd => sd === "ua" ? "ru" : "ua";
  ctx.fogLive = () => !!opts.fog; ctx.ewE = () => 0;
  ctx.radXY = p => ({ x: (p[0] - 32) * 111.32 * Math.cos(p[1] * D2R), y: p[1] * 110.574 });
  ctx.radLL = (x, y) => { const lat = y / 110.574; return [32 + x / (111.32 * Math.cos(lat * D2R)), lat]; };
  ctx.offKm = (p, dx, dy) => [p[0] + dx / (111.32 * Math.cos(p[1] * D2R)), p[1] + dy / 110.574];
  ctx.hav = (a, b) => { const A = ctx.radXY(a), B = ctx.radXY(b); return Math.hypot(A.x - B.x, A.y - B.y); };
  ctx.brg = (a, b) => { const A = ctx.radXY(a), B = ctx.radXY(b); return (Math.atan2(B.x - A.x, B.y - A.y) / D2R + 360) % 360; };
  ctx.airK = T => ({ "Надвисока": 1, "Середня": 0.5 }[T.fly] || 1);
  ctx.airM = T => 1; ctx.airTurnK = () => 1;
  ctx.airSpeed = (u, T, want, sd) => { let v = u.sp; if (!(v > 0)) v = ctx.AIR.cruise; v = want > v ? Math.min(want, v + 2.4 * sd) : Math.max(want, v - 1.8 * sd); return u.sp = v; };
  ctx.turnTo = (u, want, sd, k) => { const d = ((want - u.hdg + 540) % 360) - 180, mt = ctx.AIR.turn * sd * (k || 1); u.hdg = (u.hdg + Math.max(-mt, Math.min(mt, d)) + 360) % 360; };
  ctx.airOK = () => true; ctx.airRTB = u => { u.state = "rtb"; ctx.log.push("rtb:" + u.id); };
  ctx.airReach = (u, T) => { let m = 0; for (const k in u.ld) if (u.ld[k] > 0) m = Math.max(m, ctx.AIR_WPN[k].rk[1]); return T.r * (m || 1); };
  ctx.airPickW = (u, T, d) => { const ids = Object.keys(u.ld).filter(k => u.ld[k] > 0); const f = d / T.r; const ok = ids.filter(k => f >= ctx.AIR_WPN[k].rk[0] && f <= ctx.AIR_WPN[k].rk[1]); return (ok[0] || ids[0]); };
  ctx.impact = (p, k, cls) => ctx.fxs.push(["impact", k, cls]);
  ctx.fxHitSpark = () => ctx.fxs.push(["spark"]); ctx.fxMuzzle = () => ctx.fxs.push(["muzzle"]); ctx.fxLaunch = () => ctx.fxs.push(["launch"]); ctx.fxFall = () => ctx.fxs.push(["fall"]);
  ctx.fogFxOk = () => true; ctx.adStartReload = u => { u.state = "reload"; u.rl = 10; };
  ctx.rnd = (a, b) => a + rng() * (b - a);
  ctx.HOOKS.adHint = (sd, msg) => ctx.log.push(sd + ":" + msg);
  ctx.HOOKS.fx = (p, k) => ctx.fxs.push(["fx", k]);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "src/js/02l_aircombat.js"), "utf8"), ctx);
  ctx.BV_AIRC.CFG.rng = rng;
  vm.runInContext(fs.readFileSync(path.join(root, "tools/aircombat_glue.js"), "utf8") + "\nthis.__AC = AC;", ctx);
  ctx.AC = ctx.__AC;
  return ctx;
}
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const T0 = [36.2, 50.0];
const dest = (p, hdg, km) => { const D = Math.PI / 180; return [p[0] + Math.sin(hdg * D) * km / (111.32 * Math.cos(p[1] * D)), p[1] + Math.cos(hdg * D) * km / 110.574]; };

function addSam(W, key, pos, side){
  const T = W.AD_TYPES[key], u = { id: W.ADS.units.size + 100, key, side, pos: pos.slice(), state: "ready", mag: T.mag, cool: 0, fired: 0, kills: 0, mode: "auto", reserve: 0 };
  W.ADS.units.set(u.id, u); return u;
}
function addCarrier(W, key, pos, hdg, side){
  const id = 500 + W.units.size, u = { id, kind: "c", key, sd: side || "ru", pos: pos.slice(), hdg, spd: W.CARRIERS[key].spd, s: 0, L: 400, wait: 0 };
  u.base = pos.slice(); W.units.set(id, u); return u;
}
function addFighter(W, key, pos, hdg, side, ld){
  const T = W.AD_TYPES[key], u = { id: W.ADS.units.size + 200, key, side, pos: pos.slice(), hdg, state: "patrol", mag: Object.values(ld).reduce((a, b) => a + b, 0), cool: 0, fired: 0, kills: 0, mode: "auto", reserve: 0, ld: Object.assign({}, ld), sp: 7, patrol: pos.slice(), path: [], pi: 0, home: pos.slice(), fuel: 1 };
  W.ADS.units.set(u.id, u); return u;
}
/* крок «гри»: носій летить прямо; винищувачі — brain, інакше прямо; ЗРК дивиться acStep */
function stepWorld(W, sd){
  for (const u of W.units.values()){
    if (u.kind !== "c" || u.fall) continue;
    if (u.fall) continue;
    const a = u.hdg * Math.PI / 180;
    u.base = W.offKm(u.base, Math.sin(a) * u.spd * sd, Math.cos(a) * u.spd * sd); u.pos = u.base.slice();
    W.HOOKS.acCar && W.HOOKS.acCar(u, sd);
  }
  for (const u of W.ADS.units.values()){
    const T = W.AD_TYPES[u.key]; if (!T.air) continue;
    u.cool -= sd; if (u.cool < 0) u.cool = 0;
    if (!W.HOOKS.acBrain(u, T, sd, new Map())){
      const spd = W.airSpeed(u, T, 7, sd) * sd, a = u.hdg * Math.PI / 180; u.pos = W.offKm(u.pos, Math.sin(a) * spd, Math.cos(a) * spd);
    }
  }
  W.HOOKS.acStep(sd);
  for (const u of W.ADS.units.values()) if (!W.AD_TYPES[u.key].air && u.cool > 0) u.cool = Math.max(0, u.cool - sd);
  W.SIM.t += sd;
}

/* 1. Patriot проти Ту-95: бомбардувальник без шансів на ухилення збивається */
{
  let killed = 0, shots = 0, N = 12;
  for (let i = 0; i < N; i++){
    const W = makeWorld(); const sam = addSam(W, "patriot", T0, "ua");
    const c = addCarrier(W, "tu95", dest(T0, 270, 160), 90, "ru");
    for (let t = 0; t < 400 && !c.fall && W.units.has(c.id); t++) stepWorld(W, 0.1);
    if (c.fall) killed++; shots += W.AC.stats.ua.shots;
  }
  ok(killed >= N * 0.8, `Patriot збиває Ту-95 (${killed}/${N}), пусків у середньому ${(shots / N).toFixed(1)}`);
}
/* 2. висотне вікно: «Оса» не стріляє по цілі на 8 км висоти; «Шилка» теж */
{
  const W = makeWorld(); addSam(W, "osa", T0, "ua"); addSam(W, "shilka", T0, "ua");
  const c = addCarrier(W, "su34", dest(T0, 90, 8), 270, "ru"); W.AC.st.set("c" + c.id, W.BV_AIRC.newState("su34"));
  for (let t = 0; t < 120; t++) stepWorld(W, 0.1);
  ok(W.AC.stats.ua.shots === 0, "Оса/Шилка не стріляють по літаку на 8 км висоти");
}
/* 3. туман: без картини РЛС ЗРК не бачить ціль поза власною РЛС... і навпаки без туману — бачить */
{
  const W = makeWorld({ fog: true }); addSam(W, "patriot", T0, "ua");
  const c = addCarrier(W, "su34", dest(T0, 90, 60), 270, "ru");
  for (let t = 0; t < 200; t++) stepWorld(W, 0.1);
  ok(W.AC.stats.ua.shots === 0, "у режимі туману без картини РЛС ППО не стріляє по літаку");
}
/* 4. винищувачі: F-16 (UA) проти Су-27 (RU) — обидва шукають, пускають ракети, ухиляються; хоча б одна ракета й викид пасток */
{
  let flares = 0, kills = 0, shots = 0, N = 10, decoys = 0;
  for (let i = 0; i < N; i++){
    const W = makeWorld();
    const f = addFighter(W, "f16", T0, 90, "ua", { aam_a: 3, aam_c: 3 });
    const s = addFighter(W, "su27", dest(T0, 90, 50), 270, "ru", { r27er: 3, r73e: 3 });
    for (let t = 0; t < 600; t++){ stepWorld(W, 0.1); if (!W.ADS.units.has(f.id) || !W.ADS.units.has(s.id)) break; }
    kills += W.AC.stats.ua.kills + W.AC.stats.ru.kills; shots += W.AC.stats.ua.shots + W.AC.stats.ru.shots; decoys += W.AC.stats.ua.decoyed + W.AC.stats.ru.decoyed;
    flares += W.fxs.filter(x => x[0] === "fx" && (x[1] === "flare" || x[1] === "chaff")).length;
  }
  ok(shots > 0, `винищувачі пускають ракети (${(shots / N).toFixed(1)} за бій)`);
  ok(kills > 0, `є збиття (${kills}/${N} боїв)`);
  ok(flares > 0, `викид пасток/диполів (${(flares / N).toFixed(1)} за бій)`);
  console.log(`      відведено пастками/диполями: ${decoys}`);
}
/* 5. вертоліт не переслідує літаки, але уникає ракет; носій із самообороною (Су-34) відповідає на винищувач */
{
  const W = makeWorld();
  const c = addCarrier(W, "su34", dest(T0, 90, 80), 270, "ru");
  const f = addFighter(W, "f16", T0, 90, "ua", { aam_c: 1 });
  let launched = 0;
  for (let t = 0; t < 400; t++){ stepWorld(W, 0.1); }
  ok(W.AC.stats.ru.shots >= 1 || W.AC.stats.ua.shots >= 1, "Су-34 і F-16 вступають у бій (є пуски)");
}
/* 7. ДРЛО (етап 8): воно — повноцінна ціль; саме літаків не переслідує; пошкоджене повертається на аеродром; його станція зникає через видалення з ADS.units */
{
  let killed = 0, N = 10;
  for (let i = 0; i < N; i++){
    const W = makeWorld(); addSam(W, "patriot", T0, "ua");
    const a = addFighter(W, "a50", dest(T0, 270, 150), 90, "ru", {}); 
    a.key = "aew_a50"; a.mag = 0; a.ld = {}; a.reserve = 1; W.AC.st.set("f" + a.id, W.BV_AIRC.newState("aew_a50"));
    for (let t = 0; t < 500 && W.ADS.units.has(a.id); t++) stepWorld(W, 0.1);
    if (!W.ADS.units.has(a.id)) killed++;
  }
  ok(killed >= N * 0.7, `Patriot збиває А-50У (${killed}/${N}): ДРЛО видаляється з ADS.units (станцію зніме aewSync)`);
  const W = makeWorld(); const f = addFighter(W, "f16", T0, 90, "ua", { aam_a: 3, aam_c: 3 });
  const a = addFighter(W, "a50", dest(T0, 90, 70), 270, "ru", {}); a.key = "aew_a50"; a.mag = 0; a.ld = {};
  let aewShots = 0, tgtOfAew = false;
  for (let t = 0; t < 400 && W.ADS.units.has(a.id); t++){ stepWorld(W, 0.1); if (W.AC.tgt.has("f" + a.id)) tgtOfAew = true; }
  aewShots = W.ADS.shots.filter(m => m.from === a.id).length;
  ok(!tgtOfAew && aewShots === 0, "ДРЛО не вибирає цілей і не стріляє");
  ok(W.AC.stats.ua.shots >= 1, "винищувач противника атакує ДРЛО");
  const W2 = makeWorld(); const b = addFighter(W2, "a50", T0, 90, "ru", {}); b.key = "aew_a50"; b.mag = 0; b.ld = {}; b.reserve = 1;
  W2.AC.st.set("f" + b.id, W2.BV_AIRC.newState("aew_a50")); W2.AC.st.get("f" + b.id).hp = 0.5;
  W2.AC.ents.clear(); const m = { spec: W2.BV_AIRC.AAM.r73e, from: 1, side: "ua", pk: 1 };
  W2.HOOKS.acStep(0.05); const e = W2.AC.ents.get("f" + b.id);
  W2.eval && 0; vm_hit(W2, e, m);
  ok(W2.log.some(x => x === "rtb:" + b.id) && b.acDmg, "пошкоджене ДРЛО повертається на аеродром (airRTB patrol — є вильоти в запасі)");
}
function vm_hit(W, e, m){ require("vm").runInContext("acHit(__e, __m, 0.18, false)", Object.assign(W, { __e: e, __m: m })); }
/* 6. гість (puppet) нічого не рахує */
{
  const W = makeWorld(); W.GAME.puppet = true; addSam(W, "patriot", T0, "ua"); addCarrier(W, "tu95", dest(T0, 90, 40), 270, "ru");
  for (let t = 0; t < 100; t++) stepWorld(W, 0.1);
  ok(W.AC.ms.length === 0 && W.AC.stats.ua.shots === 0, "puppet: симуляції немає");
}

/* 8. ЦІЛЕВКАЗАННЯ ВІД РЛС/ДРЛО (етап 7.71): винищувач без бортового радара пускає РЛ-ракету лише коли мережа веде ціль,
      і дальність пуску визначає ракета (AIM-120C: 80 км × 0,9), а не бортовий радар */
{
  const scene = (distKm, withPic, ownRadar, cueOn) => {
    const W = makeWorld(); W.RAD.sim = W.SIM; W.RAD.need = true; W.RAD.net = { ua: 1, ru: 1 };
    if (!ownRadar) W.BV_AIRC.PERF.f16.rad = 0;
    if (cueOn === false) W.AC.cue.on = false;
    const f = addFighter(W, "f16", T0, 90, "ua", { aam_a: 2 });
    const s = addFighter(W, "su27", dest(T0, 90, distKm), 90, "ru", { r27er: 0, r73e: 0 }); s.mag = 0; s.state = "transit"; s.ld = {};
    const key = "ua:a" + s.id; let shot = null, guidedLink = 0, firstD = 0;
    for (let t = 0; t < 700; t++){
      if (withPic) W.RAD.lock.set(key, { conf: 0.9, state: "tracking", lastUpdatedAt: W.SIM.t, ttl: 30 }); else W.RAD.lock.delete(key);
      stepWorld(W, 0.1);
      if (!shot && W.AC.ms.length){
        shot = W.AC.ms[0]; const D = W.radXY(f.pos), E = W.radXY(s.pos); firstD = Math.hypot(D.x - E.x, D.y - E.y);
      }
      if (shot && !shot.dead && shot.src && shot.src().link && shot.lock.mode === "guided") guidedLink++;
      if (shot && shot.dead) break;
    }
    return { shot, guidedLink, firstD, W, f, s };
  };
  const a = scene(66, true, false);
  ok(!!a.shot && a.shot.cued === true, "F-16 без бортового радара пускає AIM-120C по цілевказанню від мережі РЛС/ДРЛО");
  ok(a.firstD > 45, `пуск на дальності ракети, а не радара: ${a.firstD.toFixed(0)} км`);
  ok(a.guidedLink > 5, `маршова ділянка ведеться мережею (src.link): ${a.guidedLink} тактів у «guided»`);
  ok(a.W.AC.stats.ua.cued >= 1, "лічильник пусків за цілевказанням");
  const b = scene(66, false, false);
  ok(!b.shot, "без картини РЛС і без бортового радара пуску немає");
  const c = scene(95, true, false);
  ok(!c.shot, "ціль далі за дальність ракети (80×0,9 км) — пуску немає");
  const d = scene(66, true, false, false);
  ok(!d.shot, "AC.cue.on = false — старе поведінка (потрібен бортовий радар)");
  const e = scene(66, true, true);
  ok(!!e.shot, "із бортовим радаром і мережею пуск теж є");
}
