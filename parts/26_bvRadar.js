/* SKYDOMINION · РЛС (ігрова модель радіолокаційної розвідки)
   ---------------------------------------------------------------------------------
   Модуль чистий, як і 02b_hornet_ai.js: не знає про мапу, MapLibre і про 03_game.js. Працює в єдиній плоскій
   системі координат (км: x — схід, y — північ); перетворення lat/lng ⇄ км робить «клей».
   Усе, що знає про світ, приходить через `env` у step():
     env.targets()                  [{id, side, x, y, cat, alt, sig?}]  повітряні об'єкти ВСІХ сторін
                                    side: "ua"|"ru"; alt: "ground"|"low"|"mid"|"high"; sig 0..1 (інакше за cat)
     env.los(sx, sy, tx, ty, alt)   0..1  прямий огляд / екранування рельєфом (за замовчуванням 1)
     env.weather                    0..1 або (x, y) => 0..1  стан середовища (1 — ясно)
     env.jam(p, side)               0..1  рівень РЕП по шару RADAR у точці p = [x, y]  (≈ ewE(..., "RADAR", p))
   Артилерійські постріли надходять подіями:  artilleryEvent(sim, {side, x, y, kind, id?}).
   Усі числа — ігрові умовні величини, а не характеристики реальних систем; баланс — лише в CFG / CLS / CATALOG.

   Ланцюжок даних:  станція (локальні треки) ─► канал зв'язку (затримка, пропускна здатність) ─► КП ─►
                     спільна картина сторони (злиття) ─► запит ППО (adQuery)
   «Виявлення ≠ захоплення ≠ пуск ≠ влучання»: модуль лише повертає ступінь якості даних (cue / track / lock).
   Пуском і боєкомплектом володіє пускова установка в самій грі. Тут немає жодної функції запуску ракет.
   Детермінізм: усі випадковості — з власного генератора (seed), сценарії відтворювані й тестовані. */
(function (root) {
  "use strict";

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const RANK = { lost: 0, preliminary: 1, detected: 2, tracking: 3, identified: 4 };
  const STATE_RU = { preliminary: "попередній", detected: "виявлено", tracking: "супровід", identified: "ідентифіковано", lost: "втрачено" };
  const STATUS_RU = { ready: "готова", deploying: "розгортається", working: "працює", moving: "переміщується", damaged: "пошкоджена", offline: "вимкнена", repairing: "ремонтується" };

  /* ---------- єдина таблиця балансу (км, с) ---------- */
  const CFG = {
    /* життєвий цикл локального треку станції */
    confDet: 0.25,        // з якої впевненості трек — «виявлено»
    confTrack: 0.4,       // з якої впевненості (і trackHits влучань) трек — «супровід»
    trackHits: 1,         // супровід — вже з першого влучання променя (далі лише час, а не кількість обертів)
    gain: 0.85,           // приріст впевненості за влучання (× trackQ), у частках «до одиниці»
    idRate: 0.5,          // (не використовується: ідентифікація тепер за часом, див. idSec)
    idSec: 2,             // с безперервного супроводу до ідентифікації (не залежить від періоду оберту антени)
    idSlow: 0.4,          // до +40% до idSec для станцій із слабкою ідентифікацією (identQ → 0, напр. метровий діапазон)
    confTau: 25,          // с — стала спаду впевненості треку, що перестав оновлюватись
    lostAfterSec: 12,     // с без влучань до «втрачено» (але не менше 3 сканів станції)
    dropAfterSec: 90,     // с після втрати, коли мітка зникає зі станції
    /* модель виявлення */
    rangeExp: 3,          // rangeFactor = 1 − (d/R)^rangeExp: плавний спад до межі
    weatherSens: 0.3, weatherSensMeter: 0.1,
    altLosSens: { ground: 1, low: 0.95, mid: 0.3, high: 0 },   // наскільки екранування рельєфом важливе для висотного класу
    /* перевантаження */
    loadKnee: 0.75, loadSlow: 1,   // від 75% заповнення періоду оновлення плавно зростає до ×(1+loadSlow)
    /* стан станції */
    damagedBelow: 0.7, offlineBelow: 0.25,
    rangeKDmg: 0.5,       // дальність = R·(1 − rangeKDmg·(1 − hp))
    repairSecPerHp: 600,
    /* зв'язок */
    baseLatencySec: 0.6, linkBandwidth: 40,   // звітів за скан на станцію
    /* спільна картина */
    gateBase: 1.5, gateSpeedKms: 3, freshSec: 12, picLostSec: 20, picDropSec: 120, picTau: 40, maxSpeed: 10,
    /* контрбатарейна розвідка */
    cbGate: 1.2, cbGain: 0.6, cbLostSec: 180, cbDropSec: 600, cbTau: 200,
    cbKind: { artillery: 0.9, mortar: 0.8, mlrs: 0.85, rocket: 0.9 },
    logMax: 200,
    sweep: false,         // променевий скан: ціль перевіряється, коли промінь проходить по її азимуту (гра вмикає; інакше — «усі цілі за період»)
    hitsKeep: 200,        // скільки останніх влучань променя зберігати на станцію (для відміток на екрані)
    cbSlewDegSec: 60      // °/с — довертання антени контрбатарейної РЛС на пуск
  };

  /* ---------- категорії цілей: заметність і грубий клас ---------- */
  const CAT = {
    ballistic:  { sig: 0.5,  coarse: "missile" },
    cruise:     { sig: 0.35, coarse: "missile" },
    bomber:     { sig: 0.9,  coarse: "aircraft" },
    fighter:    { sig: 0.6,  coarse: "aircraft" },
    heli:       { sig: 0.45, coarse: "helicopter" },
    uav_large:  { sig: 0.3,  coarse: "uav" },
    uav_small:  { sig: 0.2,  coarse: "uav" },
    fpv:        { sig: 0.1,  coarse: "uav" }
  };

  /* ---------- класи РЛС: значення за замовчуванням (баланс) ---------- */
  const CLS = {
    strategic:      { mode: "air", scanSec: 10, deploySec: 900, relocSec: 1200, trackQ: 0.7,  identQ: 0.5,  jamRes: 0.55, mobility: 0.1, cost: 100, upkeep: 6, maxTracks: 150, sigma: 0.8,  base: 0.93, altK: { ground: 0.12, low: 0.3, mid: 0.85, high: 1 } },
    surveillance:   { mode: "air", scanSec: 5,  deploySec: 480, relocSec: 600,  trackQ: 0.65, identQ: 0.5,  jamRes: 0.45, mobility: 0.5, cost: 50,  upkeep: 3, maxTracks: 80,  sigma: 0.6,  base: 0.92, altK: { ground: 0.25, low: 0.5, mid: 0.9, high: 1 } },
    low_altitude:   { mode: "air", scanSec: 4,  deploySec: 300, relocSec: 420,  trackQ: 0.72, identQ: 0.5,  jamRes: 0.4,  mobility: 0.6, cost: 30,  upkeep: 2, maxTracks: 40,  sigma: 0.35, base: 0.92, altK: { ground: 0.9, low: 1, mid: 0.8, high: 0.5 } },
    multifunction:  { mode: "air", scanSec: 2,  deploySec: 240, relocSec: 360,  trackQ: 0.9,  identQ: 0.85, jamRes: 0.65, mobility: 0.5, cost: 90,  upkeep: 5, maxTracks: 120, sigma: 0.15, base: 0.95, altK: { ground: 0.65, low: 0.9, mid: 1, high: 1 } },
    counter_battery:{ mode: "cb",  scanSec: 1,  deploySec: 360, relocSec: 480,  trackQ: 0.8,  identQ: 0.6,  jamRes: 0.5,  mobility: 0.5, cost: 35,  upkeep: 2, maxTracks: 30,  sigma: 0.25, base: 0.9,  altK: { ground: 1, low: 1, mid: 1, high: 1 } }
  };
  /* метровий діапазон: окремий профіль — помічає малопомітні цілі, але координати грубі */
  const METER = { stealthK: 0.45, posMult: 3, identQMul: 0.4, altK: { ground: 0.2, low: 0.4, mid: 0.85, high: 1 } };

  /* ---------- каталог (22 позиції; null = «невідомо — береться з балансу класу») ---------- */
  const CATALOG = [];
  /* R(id, side, назва, клас, дальність км, вимір, діапазон, перший реліз, перекриття балансу) */
  function R(id, side, name, cls, rangeKm, dim, band, first, bal) {
    CATALOG.push({
      id, side, name, radarClass: cls, detectionRangeKm: rangeKm, dimension: dim, band, firstRelease: !!first, bal: bal || {},
      maxTrackedTargets: null, scanIntervalSec: null, deploymentTimeSec: null, relocationTimeSec: null,
      trackQuality: null, mobility: null, jamResistance: null, cost: null, maintenanceCost: null
    });
  }
  /* Україна */
  R("ua_79k6",      "ua", "79К6 «Пелікан»", "strategic",       400, "3D", "S", true,  { cost: 120, deploySec: 1200 });
  R("ua_80k6ks1",   "ua", "80К6КС1 «Фенікс-1»",    "surveillance",   350, "3D", null, false, { deploySec: 240, relocSec: 300, mobility: 0.7, cost: 60 });
  R("ua_36d6m1",    "ua", "36Д6-М1",                "surveillance",   300, "3D", null, true);
  R("ua_p18_malakhit","ua","П-18 «Малахіт»",        "surveillance",   350, "specialized", "meter", true);
  R("ua_p18_terek", "ua", "П-18 «Терек»",           "surveillance",   220, "2D", "meter", false, { jamRes: 0.25, trackQ: 0.5, cost: 15, mobility: 0.4, sigma: 1.0, deploySec: 420 });
  R("ua_zoopark3",  "ua", "1Л220УК «Зоопарк-3»",    "counter_battery", 30, "specialized", null, true);
  R("ua_trml4d",    "ua", "TRML-4D",                "multifunction",  200, "3D", null, true);
  R("ua_giraffe1x", "ua", "Saab Giraffe 1X",        "low_altitude",    60, "3D", null, true,  { deploySec: 90, relocSec: 120, mobility: 0.9, cost: 25, sigma: 0.2 });
  R("ua_tpq36",     "ua", "AN/TPQ-36 Firefinder",   "counter_battery", 20, "specialized", null, false);
  R("ua_tpq37",     "ua", "AN/TPQ-37 Firefinder",   "counter_battery", 40, "specialized", null, false, { cost: 45 });
  /* Росія */
  R("ru_55zh6m",    "ru", "55Ж6М «Небо-М»",         "strategic",       500, null, "multi", true,  { cost: 150, deploySec: 1500 });
  R("ru_96l6",      "ru", "96Л6",                   "surveillance",    250, "3D", null, true);
  R("ru_1l119",     "ru", "1Л119 «Небо-СВУ»",       "surveillance",    300, "specialized", "meter", true);
  R("ru_48ya6k1",   "ru", "48Я6-К1 «Подлёт-К1»",    "low_altitude",    150, "3D", null, true);
  R("ru_39n6",      "ru", "39Н6 «Каста-2Е2»",       "low_altitude",    120, "2D", null, true,  { trackQ: 0.6, sigma: 0.5 });
  R("ru_64l6",      "ru", "64Л6 «Гамма-С1»",        "surveillance",    250, null, null, false);
  R("ru_59n6e",     "ru", "59Н6-Е «Противник-ГЕ»",  "surveillance",    350, null, null, false);
  R("ru_55zh6u",    "ru", "55Ж6У «Небо-У»",         "strategic",       450, null, "multi", false, { cost: 130 });
  R("ru_1l219m",    "ru", "1Л219М «Зоопарк-1М»",    "counter_battery",  30, "specialized", null, true);
  R("ru_1l220u",    "ru", "1Л220У «Зоопарк»",       "counter_battery", null, "specialized", null, false);   // дальність у довіднику не задана
  R("ru_sopka2",    "ru", "«Сопка-2»",              "surveillance",    450, null, null, false);
  R("ru_rezonans_n","ru", "«Резонанс-Н»",           "strategic",       300, null, null, false);
  const BYID = {};
  for (const u of CATALOG) BYID[u.id] = u;

  /* ---------- параметри станції = клас → метровий профіль → довідник → перекриття екземпляра ---------- */
  function resolve(u, over) {
    const c = CLS[u.radarClass];
    const p = Object.assign({}, c, { altK: Object.assign({}, c.altK), stealthK: 0, posMult: 1, band: u.band, dim: u.dimension, rangeKm: u.detectionRangeKm });
    if (u.band === "meter") { p.stealthK = METER.stealthK; p.posMult = METER.posMult; p.identQ *= METER.identQMul; p.altK = Object.assign({}, METER.altK); }
    const map = { maxTrackedTargets: "maxTracks", scanIntervalSec: "scanSec", deploymentTimeSec: "deploySec", relocationTimeSec: "relocSec", trackQuality: "trackQ", mobility: "mobility", jamResistance: "jamRes", cost: "cost", maintenanceCost: "upkeep" };
    for (const k in map) if (u[k] != null) p[map[k]] = u[k];
    Object.assign(p, u.bal || {}, over || {});
    p.altitudeKnown = p.dim === "3D";    // 2D / невідомий вимір / спеціальний профіль — висоту не оцінюють
    return p;
  }
  const par = (sim, st) => st.$p || (st.$p = resolve(BYID[st.type], st.bal));

  /* ---------- генератор ---------- */
  function rnd(sim) {
    let t = (sim.rs = (sim.rs + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(sim) { return Math.sqrt(-2 * Math.log(rnd(sim) + 1e-12)) * Math.cos(6.283185307 * rnd(sim)); }
  function note(sim, msg) { sim.log.push({ t: +sim.t.toFixed(1), msg }); if (sim.log.length > sim.cfg.logMax) sim.log.shift(); }

  /* ---------- створення ---------- */
  function create(o) {
    o = o || {};
    return {
      v: 1, t: 0, rs: (o.seed == null ? 1 : o.seed) | 0, cfg: Object.assign({}, CFG, o.cfg || {}),
      seq: 0, stations: [], cmd: {}, q: [], ev: [], log: [],
      pic: { ua: { side: "ua", air: [], ground: [], n: 0 }, ru: { side: "ru", air: [], ground: [], n: 0 } }
    };
  }
  function addStation(sim, o) {
    const u = BYID[o.type];
    if (!u) throw new Error("РЛС: невідомий тип " + o.type);
    const cmd = o.cmd || "HQ-" + u.side;
    if (!sim.cmd[cmd]) sim.cmd[cmd] = { side: u.side, up: true };
    const st = {
      id: o.id || u.id + "#" + (++sim.seq), type: u.id, side: u.side, x: o.x, y: o.y, cmd,
      hp: o.hp == null ? 1 : o.hp, status: o.status || "working", timer: o.timer || 0, dest: null, offReason: null, destroyed: false,
      bal: o.bal || null, link: { up: true, latency: sim.cfg.baseLatencySec, bandwidth: sim.cfg.linkBandwidth },
      nextScan: 0, nScan: 0, nTr: 0, trSeq: 0, tr: {}, gr: {}, az: 0, hits: []
    };
    sim.stations.push(st);
    const p = par(sim, st);
    st.nextScan = sim.t + rnd(sim) * p.scanSec;
    st.az = azSeed(st.id);
    if (st.status === "deploying" && !st.timer) st.timer = p.deploySec;
    return st;
  }
  const stById = (sim, id) => { for (const s of sim.stations) if (s.id === id) return s; return null; };
  const active = st => st.status === "working" || st.status === "damaged";

  /* ---------- керування станцією ---------- */
  function deploy(sim, id) {
    const st = stById(sim, id); if (!st || st.status !== "ready") return false;
    st.status = "deploying"; st.timer = par(sim, st).deploySec; note(sim, st.id + ": розгортання (" + st.timer + " с)"); return true;
  }
  function relocate(sim, id, x, y) {
    const st = stById(sim, id); if (!st || !(st.status === "working" || st.status === "damaged" || st.status === "ready")) return false;
    st.status = "moving"; st.dest = [x, y]; st.timer = par(sim, st).relocSec; note(sim, st.id + ": згортання й переміщення"); return true;
  }
  function damage(sim, id, amount) {
    const st = stById(sim, id); if (!st || st.destroyed) return false;
    st.hp = clamp(st.hp - amount, 0, 1);
    if (st.hp <= 0) { st.destroyed = true; st.status = "offline"; st.offReason = "destroyed"; note(sim, st.id + ": знищена"); }
    else if (st.hp <= sim.cfg.offlineBelow && (active(st) || st.status === "repairing")) { st.status = "offline"; st.offReason = "damage"; note(sim, st.id + ": виведена з ладу пошкодженнями"); }
    else if (st.hp < sim.cfg.damagedBelow && st.status === "working") { st.status = "damaged"; note(sim, st.id + ": пошкоджена, характеристики погіршено"); }
    return true;
  }
  function repair(sim, id) {
    const st = stById(sim, id); if (!st || st.destroyed || st.hp >= 1 || st.status === "repairing") return false;
    st.status = "repairing"; st.timer = (1 - st.hp) * sim.cfg.repairSecPerHp; note(sim, st.id + ": ремонт (" + Math.round(st.timer) + " с)"); return true;
  }
  function setOffline(sim, id, off) {
    const st = stById(sim, id); if (!st || st.destroyed) return false;
    if (off) { st.status = "offline"; st.offReason = "manual"; note(sim, st.id + ": вимкнена оператором"); }
    else if (st.status === "offline" && st.offReason === "manual") { st.status = st.hp < sim.cfg.damagedBelow ? "damaged" : "working"; st.offReason = null; st.nextScan = sim.t; note(sim, st.id + ": увімкнена"); }
    return true;
  }
  function setLink(sim, id, o) { const st = stById(sim, id); if (!st) return false; Object.assign(st.link, o); return true; }
  function setCmd(sim, id, up) { if (!sim.cmd[id]) return false; sim.cmd[id].up = !!up; note(sim, "КП " + id + (up ? ": зв'язок відновлено" : ": втрачено")); return true; }
  const linkOk = (sim, st) => st.link.up && sim.cmd[st.cmd] && sim.cmd[st.cmd].up;
  function artilleryEvent(sim, ev) { sim.ev.push({ t: sim.t, side: ev.side, x: ev.x, y: ev.y, kind: ev.kind || "artillery", ref: ev.id == null ? null : ev.id }); }

  /* ---------- допоміжні ---------- */
  function rangeEff(sim, st, p) {
    if (!(p.rangeKm > 0)) return 0;
    return p.rangeKm * (1 - sim.cfg.rangeKDmg * (1 - st.hp));
  }
  const condK = st => 0.35 + 0.65 * st.hp;
  function scanEff(sim, st, p) {
    const C = sim.cfg, load = p.maxTracks > 0 ? st.nTr / p.maxTracks : 0;
    return p.scanSec * (1 + C.loadSlow * Math.max(0, load - C.loadKnee) / (1 - C.loadKnee));
  }
  function envWeather(env, x, y) { const w = env.weather; return w == null ? 1 : typeof w === "function" ? w(x, y) : w; }
  function trState(C, tr) {
    if (tr.lost) return "lost";
    if (tr.idProg >= 1 && tr.conf >= C.confTrack && tr.hits >= C.trackHits) return "identified";
    if (tr.hits >= C.trackHits && tr.conf >= C.confTrack) return "tracking";
    if (tr.conf >= C.confDet) return "detected";
    return "preliminary";
  }
  const coarseOf = cat => (CAT[cat] && CAT[cat].coarse) || "object";
  const coarseKey = cat => (CAT[cat] && CAT[cat].coarse) || cat;

  /* ---------- повітряний скан станції ---------- */
  function scanAir(sim, st, p, env, tg, now) {
    const C = sim.cfg, Re = rangeEff(sim, st, p);
    st.nScan++;
    const scanId = st.nScan;
    if (!(Re > 0)) return;
    const R2 = Re * Re;
    const jam = env.jam ? clamp(env.jam([st.x, st.y], st.side) || 0, 0, 1) : 0;
    const jamF = 1 - jam * (1 - p.jamRes) * 0.9;
    const cond = condK(st);
    const w = clamp(envWeather(env, st.x, st.y), 0, 1);
    const weatherF = 1 - (1 - w) * (p.band === "meter" ? C.weatherSensMeter : C.weatherSens);
    const reports = [];
    for (let i = 0; i < tg.length; i++) {
      const t = tg[i];
      if (t.side === st.side) continue;
      const dx = t.x - st.x, dy = t.y - st.y, d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      const d = Math.sqrt(d2), alt = t.alt || "mid";
      const sig = t.sig != null ? t.sig : (CAT[t.cat] ? CAT[t.cat].sig : 0.5);
      const sigEff = p.stealthK ? sig + (1 - sig) * p.stealthK : sig;
      const sigF = clamp(Math.pow(sigEff, 0.6), 0.05, 1);
      const rf = 1 - Math.pow(d / Re, C.rangeExp);
      const los = env.los ? clamp(env.los(st.x, st.y, t.x, t.y, alt, t, st), 0, 1) : 1;
      const losF = 1 - (1 - los) * (C.altLosSens[alt] == null ? 0.5 : C.altLosSens[alt]);
      const chance = clamp(p.base * rf * sigF * (p.altK[alt] == null ? 0.5 : p.altK[alt]) * weatherF * losF * cond * jamF, 0, 1);
      if (rnd(sim) >= chance) continue;
      reports.push(observe(sim, st, p, t, d, Re, jam, alt, now, scanId));
    }
    /* звіти: найвпевненіші — першими; канал має обмежену пропускну здатність */
    reports.sort((a, b) => b.conf - a.conf);
    let sent = 0;
    for (const r of reports) {
      if (sent >= st.link.bandwidth) break;
      if (send(sim, st, r)) sent++;
    }
  }

  function observe(sim, st, p, t, d, Re, jam, alt, now, scanId) {
    const C = sim.cfg;
    const sigma = Math.max(0.03, p.sigma * p.posMult * (1 + d / Re) * (1 + 2 * jam));
    const mx = t.x + gauss(sim) * sigma, my = t.y + gauss(sim) * sigma;
    let tr = st.tr[t.id];
    if (!tr) {
      tr = st.tr[t.id] = { no: ++st.trSeq, x: mx, y: my, vx: 0, vy: 0, sigma, hits: 0, conf: 0, idProg: 0, lastHit: now, lost: false, over: false, cat: t.cat, alt: null, scanId: 0 };
      if (st.nTr >= p.maxTracks) tr.over = true;
    } else {
      const dt = now - tr.lastHit;
      if (dt > 0.2) {                                   // альфа-бета фільтр: прогноз за швидкістю, потім корекція (швидкі цілі не відстають)
        if (tr.hits >= 2) {
          const px = tr.x + tr.vx * dt, py = tr.y + tr.vy * dt, rx = mx - px, ry = my - py;
          tr.x = px + 0.6 * rx; tr.y = py + 0.6 * ry; tr.vx += 0.4 * rx / dt; tr.vy += 0.4 * ry / dt;
        } else { tr.vx = (mx - tr.x) / dt; tr.vy = (my - tr.y) / dt; tr.x = mx; tr.y = my; }
        const sp = Math.hypot(tr.vx, tr.vy); if (sp > C.maxSpeed) { tr.vx *= C.maxSpeed / sp; tr.vy *= C.maxSpeed / sp; }
      } else { tr.x += 0.6 * (mx - tr.x); tr.y += 0.6 * (my - tr.y); }
      tr.sigma = sigma * 0.8;
      if (tr.lost) { tr.lost = false; note(sim, st.id + ": контакт відновлено"); }
    }
    tr.hits++; tr.lastHit = now; tr.scanId = scanId; tr.cat = t.cat;
    tr.alt = p.altitudeKnown ? alt : null;
    tr.conf += (1 - tr.conf) * C.gain * p.trackQ * (1 - jam * 0.5);
    if (!tr.over && !tr.counted && tr.conf >= C.confDet && st.nTr >= p.maxTracks) tr.over = true;   // трек, що повертається з-під порога, не обходить ліміт
    if (tr.over) {
      if (st.nTr < p.maxTracks) tr.over = false;
      else tr.conf = Math.min(tr.conf, C.confDet - 0.01);          // перевантаження: нові цілі лишаються попередніми
    }
    if (!tr.over && tr.conf >= C.confDet && !tr.counted) { tr.counted = true; st.nTr++; }
    const state = trState(C, tr);
    return {
      k: "air", radar: st.id, no: tr.no, obsT: now, x: tr.x, y: tr.y, vx: tr.vx, vy: tr.vy, hasV: tr.hits >= 2, sigma: tr.sigma, conf: tr.conf, state,
      cat: state === "identified" ? tr.cat : state === "tracking" ? coarseOf(tr.cat) : null, exact: state === "identified",
      alt: tr.alt, ref: t.id, ttl: Math.max(C.freshSec, 2.5 * scanEff(sim, st, par(sim, st)))
    };
  }

  function send(sim, st, rep) {
    if (!linkOk(sim, st)) return false;
    sim.q.push({ at: sim.t + st.link.latency, side: st.side, cmd: st.cmd, rep });
    return true;
  }

/* sweep:v1 */
  /* ---------- етап 7.58: променевий скан (CFG.sweep) — антена обертається, ціль перевіряється лише коли промінь проходить по її азимуту ---------- */
  const TAU = Math.PI * 2;
  const normA = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  /* початковий азимут антени — з номера станції (без генератора випадкових чисел: класичні сценарії відтворюються як раніше) */
  function azSeed(id) { let h = 2166136261; const s = String(id); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 3600) / 3600 * TAU; }
  /* азимут — компас: 0 = північ (+y), за годинниковою; період обороту = scanEff (перевантаження станції сповільнює обертання) */
  function sweepStation(sim, st, p, env, tg, now, dt) {
    const C = sim.cfg, per = scanEff(sim, st, p), w = TAU / per, da = w * dt, a0 = st.az || 0, t0 = now - dt;
    if (!st.hits) st.hits = [];
    const Re = rangeEff(sim, st, p), found = [];
    const jam = env.jam ? clamp(env.jam([st.x, st.y], st.side) || 0, 0, 1) : 0;
    if (Re > 0) {
      const R2 = Re * Re, jamF = 1 - jam * (1 - p.jamRes) * 0.9, cond = condK(st);
      const wth = clamp(envWeather(env, st.x, st.y), 0, 1), weatherF = 1 - (1 - wth) * (p.band === "meter" ? C.weatherSensMeter : C.weatherSens);
      for (let i = 0; i < tg.length; i++) {
        const t = tg[i];
        if (t.side === st.side) continue;
        const dx = t.x - st.x, dy = t.y - st.y, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        const off = normA(Math.atan2(dx, dy) - a0);               // кут від поточного азимуту до цілі за ходом обертання
        for (let o = off, k = 0; o < da && k < 3; o += TAU, k++) {
          const d = Math.sqrt(d2), alt = t.alt || "mid";
          const sig = t.sig != null ? t.sig : (CAT[t.cat] ? CAT[t.cat].sig : 0.5);
          const sigEff = p.stealthK ? sig + (1 - sig) * p.stealthK : sig;
          const sigF = clamp(Math.pow(sigEff, 0.6), 0.05, 1);
          const rf = 1 - Math.pow(d / Re, C.rangeExp);
          const los = env.los ? clamp(env.los(st.x, st.y, t.x, t.y, alt, t, st), 0, 1) : 1;
          const losF = 1 - (1 - los) * (C.altLosSens[alt] == null ? 0.5 : C.altLosSens[alt]);
          const chance = clamp(p.base * rf * sigF * (p.altK[alt] == null ? 0.5 : p.altK[alt]) * weatherF * losF * cond * jamF, 0, 1);
          if (rnd(sim) >= chance) continue;
          found.push({ o, t, d, alt, tc: t0 + o / w, rev: st.nScan + (a0 + o >= TAU ? 1 : 0), brg: normA(a0 + o) });
        }
      }
    }
    st.az = normA(a0 + da); st.nScan += Math.floor((a0 + da) / TAU);
    /* канал зв'язку: пропускна здатність — звітів за оберт, тут пропорційно куту, який пройшов промінь */
    const bwMax = st.link.bandwidth; st.bw = Math.min(bwMax, (st.bw == null ? bwMax : st.bw) + bwMax * da / TAU);
    found.sort((a, b) => a.o - b.o);
    for (const f of found) {
      const rep = observe(sim, st, p, f.t, f.d, Re, jam, f.alt, f.tc, f.rev);
      st.hits.push({ t: f.tc, x: rep.x, y: rep.y, no: rep.no, s: rep.state, c: Math.round(rep.conf * 100) / 100, az: f.brg });
      if (st.bw >= 1 && send(sim, st, rep)) st.bw -= 1;
    }
    const keep = 3 * per; while (st.hits.length && (now - st.hits[0].t > keep || st.hits.length > C.hitsKeep)) st.hits.shift();
  }
  /* контрбатарейна РЛС (ФАР): антена не обертається, а довертається на найсвіжішу позицію пуску противника */
  function slewCb(sim, st, dt) {
    let g = null;
    for (const k in st.gr) { const c = st.gr[k]; if (!c.lost && (!g || c.lastHit > g.lastHit)) g = c; }
    if (!g) return;
    let d = normA(Math.atan2(g.x - st.x, g.y - st.y) - (st.az || 0)); if (d > Math.PI) d -= TAU;
    const m = sim.cfg.cbSlewDegSec * Math.PI / 180 * dt;
    st.az = normA((st.az || 0) + clamp(d, -m, m));
  }
  /* стан променя для візуалізації й ППО: az — азимут, w — рад/с (0, якщо станція не випромінює), hits — недавні влучання променя */
  function beam(sim, id) {
    const st = stById(sim, id); if (!st) return null;
    const p = par(sim, st), act = active(st), air = p.mode === "air", per = scanEff(sim, st, p);
    return { id: st.id, az: st.az || 0, w: air && act ? TAU / per : 0, periodSec: air ? per : 0, mode: air ? "sweep" : "slew", active: act, rKm: act ? rangeEff(sim, st, p) : 0, hits: st.hits || [] };
  }

  /* ---------- контрбатарейні події ---------- */
  function processEvents(sim, env) {
    const C = sim.cfg;
    for (const ev of sim.ev) {
      for (const st of sim.stations) {
        if (!active(st) || st.side === ev.side) continue;
        const p = par(sim, st);
        if (p.mode !== "cb") continue;                       // контрбатарейні РЛС працюють лише з артилерійськими подіями
        const Re = rangeEff(sim, st, p); if (!(Re > 0)) continue;
        const d = Math.hypot(ev.x - st.x, ev.y - st.y); if (d > Re) continue;
        const jam = env.jam ? clamp(env.jam([st.x, st.y], st.side) || 0, 0, 1) : 0;
        const kindK = C.cbKind[ev.kind] == null ? 0.8 : C.cbKind[ev.kind];
        const chance = clamp(p.base * (1 - Math.pow(d / Re, C.rangeExp)) * kindK * condK(st) * (1 - jam * (1 - p.jamRes) * 0.9), 0, 1);
        if (rnd(sim) >= chance) continue;
        const sigma = Math.max(0.03, p.sigma * (1 + d / Re) * (1 + 2 * jam));
        const mx = ev.x + gauss(sim) * sigma, my = ev.y + gauss(sim) * sigma;
        let g = null, bd = 1e9;
        for (const k in st.gr) { const c = st.gr[k]; const dd = Math.hypot(c.x - mx, c.y - my); if (dd < C.cbGate + 2 * (c.sigma + sigma) && dd < bd) { bd = dd; g = c; } }
        if (!g) {
          if (Object.keys(st.gr).length >= p.maxTracks) continue;
          g = st.gr[++st.trSeq] = { no: st.trSeq, x: mx, y: my, sigma, n: 0, conf: 0, kind: ev.kind, lastHit: ev.t, lost: false, ref: ev.ref };
        } else {
          const w0 = 1 / (g.sigma * g.sigma), w1 = 1 / (sigma * sigma);
          g.x = (g.x * w0 + mx * w1) / (w0 + w1); g.y = (g.y * w0 + my * w1) / (w0 + w1); g.sigma = Math.max(0.03, 1 / Math.sqrt(w0 + w1));
          g.kind = ev.kind; if (ev.ref != null) g.ref = ev.ref;
        }
        g.n++; g.lastHit = ev.t; g.lost = false;
        g.conf += (1 - g.conf) * C.cbGain * p.trackQ;
        send(sim, st, { k: "cb", radar: st.id, no: g.no, obsT: ev.t, x: g.x, y: g.y, sigma: g.sigma, conf: g.conf, n: g.n, kind: g.kind, ref: g.ref, ttl: C.cbLostSec });
      }
    }
    sim.ev.length = 0;
  }

  /* ---------- спільна картина сторони: злиття ---------- */
  function freshSrc(c, now) {
    let n = 0, miss = 1, maxRank = 0;
    for (const k in c.src) { const s = c.src[k]; if (now - s.t <= s.ttl) { n++; miss *= 1 - s.conf; if (RANK[s.state] > maxRank) maxRank = RANK[s.state]; } }
    return { n, conf: n ? 1 - miss : 0, rank: maxRank };
  }
  function rankName(r) { return r >= 4 ? "identified" : r >= 3 ? "tracking" : r >= 2 ? "detected" : "preliminary"; }

  function ingest(sim, side, rep) {
    const C = sim.cfg, pic = sim.pic[side];
    const key = rep.radar + "#" + rep.no;
    if (rep.k === "cb") return ingestGround(sim, pic, rep, key);
    let best = null, bn = 1e9;
    for (const c of pic.air) if (c.trk[key]) { best = c; break; }
    if (!best) {
      for (const c of pic.air) {
        const dtp = Math.max(0, rep.obsT - c.lastUpdatedAt);
        const bothV = c.hasV && rep.hasV;
        const px = c.x + c.vx * dtp, py = c.y + c.vy * dtp;
        const gate = C.gateBase + 2.5 * (rep.sigma + c.sigma) + Math.min(dtp, 10) * (bothV ? 0.8 : C.gateSpeedKms);
        const d = Math.hypot(rep.x - px, rep.y - py) / gate;
        if (d > 1 || d >= bn) continue;
        if (rep.cat && c.cat && coarseKey(rep.cat) !== coarseKey(c.cat)) continue;      // порівнюємо грубі класи: «ракета» (грубо) ≡ «крилата» (точно)
        if (c.alt && rep.alt && c.alt !== rep.alt) continue;
        best = c; bn = d;
      }
    }
    if (!best) {
      best = { id: "C" + (++pic.n), side, kind: "air", x: rep.x, y: rep.y, vx: 0, vy: 0, hasV: false, sigma: rep.sigma, conf0: rep.conf, conf: rep.conf, state: rep.state, cat: null, isIdentified: false, alt: null,
        lastUpdatedAt: rep.obsT, created: rep.obsT, src: {}, trk: {}, ttl: rep.ttl, _ref: rep.ref, _refConf: 0 };
      pic.air.push(best);
    } else {
      const dtp = Math.max(0, rep.obsT - best.lastUpdatedAt);
      const px = best.x + best.vx * dtp, py = best.y + best.vy * dtp;
      const w0 = Math.exp(-dtp / 5) / (best.sigma * best.sigma), w1 = 1 / (rep.sigma * rep.sigma);
      best.x = (px * w0 + rep.x * w1) / (w0 + w1); best.y = (py * w0 + rep.y * w1) / (w0 + w1);
      best.sigma = Math.max(Math.min(best.sigma, rep.sigma) * 0.7, 1 / Math.sqrt(w0 + w1));
      if (rep.obsT > best.lastUpdatedAt) best.lastUpdatedAt = rep.obsT;
    }
    if (rep.hasV) { best.vx = rep.vx; best.vy = rep.vy; best.hasV = true; }
    best.src[rep.radar] = { conf: rep.conf, t: rep.obsT, state: rep.state, ttl: rep.ttl };
    best.trk[key] = 1;
    if (rep.ttl > best.ttl) best.ttl = rep.ttl;
    if (rep.exact) { best.cat = rep.cat; best.isIdentified = true; } else if (rep.cat && !best.isIdentified) best.cat = rep.cat;
    if (rep.alt) best.alt = rep.alt;
    if (rep.conf >= best._refConf) { best._ref = rep.ref; best._refConf = rep.conf; }
    refresh(sim, best, sim.t);
  }

  function ingestGround(sim, pic, rep, key) {
    const C = sim.cfg;
    let best = null, bn = 1e9;
    for (const c of pic.ground) if (c.trk[key]) { best = c; break; }
    if (!best) for (const c of pic.ground) {
      const d = Math.hypot(rep.x - c.x, rep.y - c.y);
      if (d < C.cbGate + 2 * (rep.sigma + c.sigma) && d < bn) { best = c; bn = d; }
    }
    if (!best) {
      best = { id: "G" + (++pic.n), side: pic.side, kind: "ground", x: rep.x, y: rep.y, vx: 0, vy: 0, sigma: rep.sigma, conf0: rep.conf, conf: rep.conf, state: "detected", cat: rep.kind, isIdentified: false, alt: null,
        lastUpdatedAt: rep.obsT, created: rep.obsT, src: {}, trk: {}, ttl: C.cbLostSec, n: 0, _ref: rep.ref };
      pic.ground.push(best);
    } else {
      const w0 = 1 / (best.sigma * best.sigma), w1 = 1 / (rep.sigma * rep.sigma);
      best.x = (best.x * w0 + rep.x * w1) / (w0 + w1); best.y = (best.y * w0 + rep.y * w1) / (w0 + w1);
      best.sigma = Math.max(0.03, 1 / Math.sqrt(w0 + w1));
      if (rep.obsT > best.lastUpdatedAt) best.lastUpdatedAt = rep.obsT;
    }
    best.src[rep.radar] = { conf: rep.conf, t: rep.obsT, state: rep.n >= 2 ? "tracking" : "detected", ttl: C.cbLostSec, n: rep.n };
    best.trk[key] = 1; best.cat = rep.kind; if (rep.ref != null) best._ref = rep.ref;
    let n = 0; for (const k in best.src) n += best.src[k].n || 0; best.n = n;
    refresh(sim, best, sim.t);
  }

  /* перерахунок контакту спільної картини: свіжі джерела → впевненість, стан; без свіжих — спад і «втрачено» */
  function refresh(sim, c, now) {
    const C = sim.cfg, f = freshSrc(c, now), age = now - c.lastUpdatedAt;
    if (c.kind === "ground") {
      if (f.n) { c.conf0 = f.conf; c.conf = f.conf; c.state = c.n >= 2 ? "tracking" : "detected"; }
      else { c.conf = c.conf0 * Math.exp(-Math.max(0, age - c.ttl) / C.cbTau); c.state = age > C.cbLostSec ? "lost" : c.state; }
      return;
    }
    if (f.n) {
      c.conf0 = f.conf; c.conf = f.conf;
      let r = f.rank;
      if (f.n >= 2 && f.conf >= C.confTrack && r < 3) r = 3;      // узгоджені спостереження кількох станцій
      c.state = rankName(r);
    } else {
      c.conf = c.conf0 * Math.exp(-Math.max(0, age - c.ttl) / C.picTau);
      if (age > Math.max(C.picLostSec, c.ttl * 1.5)) c.state = "lost";
    }
  }

  function tickPictures(sim, now) {
    const C = sim.cfg;
    for (const side of ["ua", "ru"]) {
      const pic = sim.pic[side]; pic.side = side;
      for (const list of [pic.air, pic.ground]) {
        for (let i = list.length - 1; i >= 0; i--) {
          const c = list[i]; refresh(sim, c, now);
          const age = now - c.lastUpdatedAt, drop = c.kind === "ground" ? C.cbDropSec : C.picDropSec;
          if ((c.state === "lost" && age > drop) || c.conf < 0.02) list.splice(i, 1);
        }
      }
    }
  }

  /* ---------- ідентифікація за часом: idSec секунд супроводу → точний тип, незалежно від періоду оберту антени ---------- */
  const idSecEff = (C, p) => C.idSec * (1 + C.idSlow * (1 - clamp(p.identQ / 0.85, 0, 1)));
  function sendIdent(sim, st, p, tr, ref, now) {
    const C = sim.cfg;                       // чисте оновлення стану: позиція й час — останнього влучання, без екстраполяції за шумною швидкістю
    send(sim, st, { k: "air", radar: st.id, no: tr.no, obsT: tr.lastHit, x: tr.x, y: tr.y, vx: tr.vx, vy: tr.vy, hasV: tr.hits >= 2, sigma: tr.sigma, conf: tr.conf,
      state: "identified", cat: tr.cat, exact: true, alt: tr.alt, ref, ttl: Math.max(C.freshSec, 2.5 * scanEff(sim, st, p)) });
  }

  /* ---------- старіння локальних треків станції ---------- */
  function ageStation(sim, st, dt, now) {
    const C = sim.cfg, p = par(sim, st), se = scanEff(sim, st, p);
    let n = 0;
    for (const k in st.tr) {
      const tr = st.tr[k], since = now - tr.lastHit;
      if (since > se * 1.5) tr.conf *= Math.exp(-dt / C.confTau);
      if (!tr.lost && since > Math.max(C.lostAfterSec, 3 * se)) { tr.lost = true; note(sim, st.id + ": контакт втрачено"); }
      if (tr.lost && since > C.dropAfterSec) { delete st.tr[k]; continue; }
      if (!tr.lost && !tr.over && tr.idProg < 1 && tr.hits >= C.trackHits && tr.conf >= C.confTrack) {
        tr.idProg = Math.min(1, tr.idProg + dt / idSecEff(C, p));
        if (tr.idProg >= 1) sendIdent(sim, st, p, tr, k, now);
      }
      if (!tr.lost && tr.conf >= C.confDet) { tr.counted = true; n++; } else tr.counted = false;
    }
    st.nTr = n;
    for (const k in st.gr) {
      const g = st.gr[k], since = now - g.lastHit;
      if (since > C.cbLostSec) g.lost = true;
      if (g.lost && since > C.cbDropSec) delete st.gr[k]; else if (since > C.cbLostSec) g.conf *= Math.exp(-dt / C.cbTau);
    }
  }

  function tickStatus(sim, st, dt, now) {
    const C = sim.cfg, p = par(sim, st);
    if (st.status === "deploying") { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; st.status = st.hp < C.damagedBelow ? "damaged" : "working"; st.nextScan = now + p.scanSec * 0.5; note(sim, st.id + ": розгорнута, працює"); } }
    else if (st.status === "moving") { st.timer -= dt; if (st.timer <= 0) { st.x = st.dest[0]; st.y = st.dest[1]; st.dest = null; st.status = "deploying"; st.timer = p.deploySec; note(sim, st.id + ": прибула, розгортання"); } }
    else if (st.status === "repairing") { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; st.hp = 1; st.status = "working"; st.offReason = null; st.nextScan = now + p.scanSec * 0.5; note(sim, st.id + ": відремонтована"); } }
    else if (st.status === "working" && st.hp < C.damagedBelow) st.status = "damaged";
    else if (st.status === "damaged" && st.hp >= C.damagedBelow) st.status = "working";
  }

  /* ---------- крок ---------- */
  function step(sim, dt, env) {
    env = env || {};
    const C = sim.cfg;
    sim.t += dt; const now = sim.t;
    for (const st of sim.stations) tickStatus(sim, st, dt, now);
    processEvents(sim, env);
    const tg = env.targets ? env.targets() : [];
    for (const st of sim.stations) {
      if (!active(st)) continue;
      const p = par(sim, st);
      if (p.mode !== "air") { if (C.sweep) slewCb(sim, st, dt); continue; }
      if (C.sweep) { sweepStation(sim, st, p, env, tg, now, dt); continue; }
      let n = 0;
      while (st.nextScan <= now && n < 4) { scanAir(sim, st, p, env, tg, now); st.nextScan += scanEff(sim, st, p); n++; }
      if (st.nextScan <= now) st.nextScan = now + scanEff(sim, st, p);
    }
    /* доставка звітів: затримка; якщо КП за цей час втрачено — звіт губиться */
    if (sim.q.length) {
      const ready = [], rest = [];
      for (const m of sim.q) (m.at <= now ? ready : rest).push(m);
      sim.q = rest;
      ready.sort((a, b) => a.at - b.at);
      for (const m of ready) if (sim.cmd[m.cmd] && sim.cmd[m.cmd].up) ingest(sim, m.side, m.rep);
    }
    tickPictures(sim, now);
    for (const st of sim.stations) ageStation(sim, st, dt, now);
  }

  /* ---------- запит ППО: лише якість даних, без пуску ---------- */
  function localContacts(sim, stationId) {
    const st = stById(sim, stationId), out = [];
    if (!st || !active(st)) return out;                          // вимкнена станція нових даних не дає
    for (const k in st.tr) {
      const tr = st.tr[k]; if (tr.lost) continue;
      out.push({ id: st.id + "/" + tr.no, side: st.side, kind: "air", x: tr.x, y: tr.y, vx: tr.vx, vy: tr.vy, sigma: tr.sigma, conf: tr.conf, state: trState(sim.cfg, tr), lastUpdatedAt: tr.lastHit, isIdentified: tr.idProg >= 1, _ref: k });
    }
    return out;
  }
  /* ad: {x, y, rangeKm?, connected?:true, cmd?, ownRadarId?, minTrackConf?, minLockConf?, maxLockSigmaKm?, maxLockAgeSec?, requireIdentified?} */
  function adQuery(sim, side, ad) {
    const now = sim.t, out = [];
    const minTrack = ad.minTrackConf == null ? 0.35 : ad.minTrackConf, minLock = ad.minLockConf == null ? 0.6 : ad.minLockConf;
    const maxSig = ad.maxLockSigmaKm == null ? 0.6 : ad.maxLockSigmaKm, maxAge = ad.maxLockAgeSec == null ? 8 : ad.maxLockAgeSec;
    const netOk = ad.connected !== false && (!ad.cmd || (sim.cmd[ad.cmd] && sim.cmd[ad.cmd].up));
    const list = [];
    if (netOk) for (const c of sim.pic[side].air) list.push({ c, via: "network" });
    if (ad.ownRadarId) for (const c of localContacts(sim, ad.ownRadarId)) list.push({ c, via: "local" });
    for (const { c, via } of list) {
      if (c.state === "lost") continue;
      if (ad.rangeKm != null && Math.hypot(c.x - ad.x, c.y - ad.y) > ad.rangeKm) continue;
      const age = Math.max(0, now - c.lastUpdatedAt), r = RANK[c.state];
      let grade = "cue";
      if (c.conf >= minTrack && r >= 2) grade = "track";
      if (r >= 3 && c.conf >= minLock && c.sigma <= maxSig && age <= maxAge && (!ad.requireIdentified || c.isIdentified)) grade = "lock";
      const quality = clamp(c.conf * (1 - Math.min(1, c.sigma / (maxSig * 2))) * Math.exp(-age / (maxAge * 2)), 0, 1);
      out.push({ id: c.id, via, grade, quality, state: c.state, conf: c.conf, sigmaKm: c.sigma, ageSec: age, x: c.x, y: c.y, vx: c.vx, vy: c.vy, ref: c._ref });
    }
    out.sort((a, b) => b.quality - a.quality);
    return out;
  }

  /* ---------- дані для інтерфейсу: лише власна сторона ---------- */
  function viewContact(c, now) {
    return {
      id: c.id, side: c.side, kind: c.kind, position: { x: c.x, y: c.y }, vx: c.vx, vy: c.vy, sigmaKm: c.sigma, lastUpdatedAt: c.lastUpdatedAt, ageSec: Math.max(0, now - c.lastUpdatedAt),
      confidence: c.conf, state: c.state, stateLabel: STATE_RU[c.state], estimatedCategory: c.cat, altitudeClass: c.alt || null,
      sourceRadarIds: Object.keys(c.src), isIdentified: !!c.isIdentified, lastKnown: c.state === "lost"
    };
  }
  function coverage(sim, id) { const st = stById(sim, id); if (!st) return null; const p = par(sim, st); return { x: st.x, y: st.y, rKm: active(st) ? rangeEff(sim, st, p) : 0, nominalKm: p.rangeKm, mode: p.mode }; }
  function stationCard(sim, st) {
    const p = par(sim, st), u = BYID[st.type];
    return {
      id: st.id, type: st.type, name: u.name, side: st.side, radarClass: u.radarClass, x: st.x, y: st.y, rangeKm: p.rangeKm, effectiveRangeKm: active(st) ? rangeEff(sim, st, p) : 0,
      tracks: p.mode === "air" ? st.nTr : Object.keys(st.gr).length, maxTracks: p.maxTracks, status: st.status, statusLabel: STATUS_RU[st.status], hp: st.hp, timerSec: Math.ceil(st.timer || 0),
      deploymentTimeSec: p.deploySec, relocationTimeSec: p.relocSec, linkUp: !!linkOk(sim, st), cmd: st.cmd, dataAvailableToCommand: !!(linkOk(sim, st) && active(st)), emitting: p.mode === "air" && active(st),
      azDeg: Math.round(normA(st.az || 0) * 180 / Math.PI), rotationSec: p.mode === "air" ? Math.round(scanEff(sim, st, p) * 10) / 10 : 0
    };
  }
  function snapshot(sim, side) {
    const now = sim.t, pic = sim.pic[side];
    return {
      t: now, side,
      stations: sim.stations.filter(s => s.side === side).map(s => stationCard(sim, s)),
      contacts: pic.air.map(c => viewContact(c, now)),
      ground: pic.ground.map(c => viewContact(c, now)),
      commandNodes: Object.keys(sim.cmd).filter(k => sim.cmd[k].side === side).map(k => ({ id: k, up: sim.cmd[k].up }))
    };
  }
  /* випромінюючі РЛС — для РЕР (напр. «Гекат»): працююча оглядова станція «світиться» */
  function emitters(sim, side) {
    const out = [];
    for (const st of sim.stations) { if (side && st.side !== side) continue; const p = par(sim, st); if (p.mode === "air" && active(st)) out.push({ id: st.id, side: st.side, x: st.x, y: st.y, radarClass: BYID[st.type].radarClass, rangeKm: p.rangeKm }); }
    return out;
  }

  /* ---------- збереження ---------- */
  function serialize(sim) { return JSON.parse(JSON.stringify(sim, (k, v) => k === "$p" ? undefined : v)); }
  function restore(data) { return JSON.parse(JSON.stringify(data)); }
  const catalogFor = (side, firstRelease) => CATALOG.filter(u => (!side || u.side === side) && (!firstRelease || u.firstRelease));

  const api = {
    CFG, CLS, METER, CAT, CATALOG, BYID, catalogFor, resolve,
    create, addStation, deploy, relocate, damage, repair, setOffline, setLink, setCmd, artilleryEvent,
    step, localContacts, adQuery, snapshot, coverage, emitters, beam, serialize, restore,
    explain: sim => sim.log.slice()
  };
  root.BV_RADAR = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
