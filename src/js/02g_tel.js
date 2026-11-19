/* ======================================================================
   BV_TEL — мобільні пускові установки балістичних ракет + профіль польоту балістики (етап 7.66, «етап 2»)
   Чистий модуль (як 02c_radar.js і 02e_fog.js): не знає ні про мапу, ні про 03_game.js. Усі числа — ігровий баланс.

   Що тут є:
   • моделі ПУ під кожен тип ракети (MODELS): запас ракет на борту, міцність, швидкість маршу, апогей і швидкість ракети;
   • автомат стану установки: march (марш) → deploying (розгортання, 10 ігрових хвилин) → ready → (пуск) → reloading (перезарядка) → ready;
     перенесення місця базування = марш + нове розгортання; знищена — destroyed;
   • склад (depot) кожної сторони: кількість установок у резерві; знищені повертаються повільно (resupply);
   • шкода й знищення: blast() — вибух ракети в точці; < 30 % міцності — установка не веде пуск, < 50 % — розгортається повільніше;
   • розвідка установок: звіт спостерігача (observe) → затримка → «картина» сторони з рівнем достовірності, що старіє (view);
     обмеження: пауза між звітами одного джерела, ліміт відстежуваних установок, похибка зростає з віком даних;
   • профіль польоту балістики: поступовий розгін і набір висоти (розгін → набір → політ → зниження), середній час польоту не змінюється.
   Час усередині модуля — ІГРОВІ ХВИЛИНИ (в грі 1 с симуляції = 1 ігрова хвилина, `CFG.minPerSec`).
   ====================================================================== */
(function (root) {
  "use strict";

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const D2R = Math.PI / 180;
  const dist = (p, q) => Math.hypot((q[0] - p[0]) * 111.32 * Math.cos((p[1] + q[1]) / 2 * D2R), (q[1] - p[1]) * 110.574);
  const offKm = (p, dx, dy) => [p[0] + dx / (111.32 * Math.cos(p[1] * D2R)), p[1] + dy / 110.574];

  /* ---------- баланс ---------- */
  const CFG = {
    prepMin: 10,            // підготовка до пуску після розміщення/перенесення, ігрові хвилини
    reloadMin: 10,          // перезарядка порожньої установки
    minPerSec: 1,           // ігрових хвилин в 1 с симуляції
    exposeMin: 6,           // після пуску установку «видно» (шлейф, тепловий слід), хв
    repairPerMin: 0.01,     // самоусунення пошкоджень на місці (частка міцності за хвилину)
    repairIdle: 5,          // ...якщо не було влучань стільки хвилин
    hitFull: 1.2, hitFar: 3.2,   // радіус повного й часткового ураження вибухом, км
    farK: 0.35,             // частка шкоди на краю радіуса
    disabledBelow: 0.3,     // нижче цього пуск неможливий
    slowBelow: 0.5, slowK: 1.5,  // нижче цього розгортання ×slowK
    resupplyMin: 360,       // одна втрачена установка повертається зі складу раз на стільки хвилин
    tau: 18,                // стала старіння достовірності, хв (марш — вдвічі швидше)
    staleMin: 8,            // «застарілі» дані
    minGap: 2,              // пауза між звітами одного джерела про одну установку, хв
    maxTrack: 14,           // скільки чужих установок сторона може вести одночасно
    wreckMin: 20            // уламки лишаються на мапі, хв
  };

  /* ---------- моделі ПУ ----------
     rounds — ракет у готовності; hp — «очки» міцності (шкода ракети ділиться на них); mv — швидкість маршу, км/хв;
     depot — скільки всього установок у сторони; start — скільки розгорнуто на старті бою (готові);
     apo — апогей ракети, км; vm — піковa швидкість ракети, м/с; sig — помітність за станом (0..1). */
  const SIG = { march: 0.9, deploying: 0.7, ready: 0.45, reloading: 0.7, destroyed: 0 };
  const MODELS = {
    iskander: { side: "ru", name: "9П78-1 «Іскандер-М»", short: "Іскандер-М", rounds: 2, hp: 3, mv: 0.9, depot: 4, start: 1, apo: 50, vm: 2100 },
    kn23:     { side: "ru", name: "ПУ KN-23 (МАЗ-547В)", short: "KN-23",      rounds: 1, hp: 3, mv: 0.8, depot: 2, start: 1, apo: 50, vm: 2000 },
    s400:     { side: "ru", name: "5П85 (С-400, 48Н6)",  short: "С-400 (земля)", rounds: 4, hp: 4, mv: 0.8, depot: 2, start: 1, apo: 25, vm: 1800 },
    tochka:   { side: "ru", name: "9П129 «Точка-У»",     short: "Точка-У",    rounds: 1, hp: 2, mv: 1.0, depot: 3, start: 1, apo: 26, vm: 1100 },
    atacms:   { side: "ua", name: "M142 HIMARS (ATACMS)", short: "ATACMS",    rounds: 1, hp: 2, mv: 1.1, depot: 3, start: 1, apo: 50, vm: 1100 },
    fp7:      { side: "ua", name: "ПУ FP-7",             short: "FP-7",       rounds: 1, hp: 2, mv: 0.9, depot: 2, start: 1, apo: 35, vm: 1000 },
    fp9:      { side: "ua", name: "ПУ FP-9",             short: "FP-9",       rounds: 1, hp: 3, mv: 0.8, depot: 2, start: 1, apo: 60, vm: 1500 },
    sapsan:   { side: "ua", name: "ПУ «Сапсан»",         short: "Сапсан",     rounds: 2, hp: 3, mv: 0.8, depot: 2, start: 1, apo: 70, vm: 1500 },
    vilkha:   { side: "ua", name: "РСЗВ «Вільха-М»",     short: "Вільха-М",   rounds: 6, hp: 2, mv: 1.0, depot: 3, start: 1, apo: 20, vm: 800 }
  };
  const STATE_N = { march: "марш", deploying: "розгортання", ready: "готова", reloading: "перезарядка", destroyed: "знищена" };
  const LEVEL_N = { high: "підтверджено", medium: "імовірно", low: "ненадійно" };
  const keysOf = side => Object.keys(MODELS).filter(k => MODELS[k].side === side);

  /* ---------- стан ---------- */
  function create(opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 66001 : opts.seed;
    const sim = { t: 0, seed, uid: 1, tels: [], depot: { ua: {}, ru: {} }, rep: { ua: {}, ru: {} }, q: [], gap: {}, sup: { ua: {}, ru: {} }, cfg: Object.assign({}, CFG, opts.cfg || {}) };
    Object.defineProperty(sim, "_r", { value: mulberry(seed), writable: true, enumerable: false, configurable: true });
    for (const k in MODELS) sim.depot[MODELS[k].side][k] = MODELS[k].depot;
    return sim;
  }
  const byId = (sim, id) => sim.tels.find(x => x.id === id) || null;
  const alive = t => t.state !== "destroyed";
  const mine = (sim, side, key) => sim.tels.filter(t => t.side === side && (!key || t.key === key) && alive(t));
  const prepOf = (sim, t) => sim.cfg.prepMin * (t.hp < sim.cfg.slowBelow ? sim.cfg.slowK : 1);

  /* поставити установку зі складу; opts.free — не списувати склад (старт бою, боти); opts.ready — одразу готова */
  function place(sim, spec) {
    const M = MODELS[spec.key]; if (!M || !spec.pos) return null;
    const side = M.side; if (spec.side && spec.side !== side) return null;
    if (!spec.free) { if (!(sim.depot[side][spec.key] > 0)) return null; sim.depot[side][spec.key]--; }
    const t = { id: "T" + (sim.uid++), key: spec.key, side, pos: spec.pos.slice(), dest: null, from: null, state: spec.ready ? "ready" : "deploying", timer: spec.ready ? 0 : sim.cfg.prepMin,
      rounds: M.rounds, hp: 1, since: sim.t, lastFire: -1e9, lastHit: -1e9, exposed: 0, shots: 0, moved: 0, died: 0 };
    sim.tels.push(t); return t;
  }
  /* перенести місце базування: марш до точки, потім нове розгортання */
  function relocate(sim, id, pos) {
    const t = byId(sim, id); if (!t || !alive(t) || !pos) return { ok: false, msg: "Установки немає" };
    const d = dist(t.pos, pos); if (d < 0.2) return { ok: false, msg: "Це те саме місце" };
    t.dest = pos.slice(); t.from = t.pos.slice(); t.state = "march"; t.timer = 0;
    return { ok: true, eta: Math.round(d / MODELS[t.key].mv), km: d };
  }
  /* згорнути: установка повертається на склад (не під час пуску й не знищена) */
  function recall(sim, id) {
    const t = byId(sim, id); if (!t || !alive(t)) return false;
    if (sim.t - t.lastFire < sim.cfg.exposeMin) return false;
    sim.depot[t.side][t.key]++; sim.tels.splice(sim.tels.indexOf(t), 1); delete sim.rep.ua[id]; delete sim.rep.ru[id]; return true;
  }
  const canFire = (sim, t) => !!t && t.state === "ready" && t.rounds > 0 && t.hp >= sim.cfg.disabledBelow;
  /* пуск: списує ракету; повертає true/false */
  function fire(sim, id) {
    const t = byId(sim, id); if (!canFire(sim, t)) return false;
    t.rounds--; t.shots++; t.lastFire = sim.t; t.exposed = sim.t + sim.cfg.exposeMin;
    if (t.rounds <= 0) { t.state = "reloading"; t.timer = sim.cfg.reloadMin; }
    return true;
  }
  function damage(sim, id, d) {
    const t = byId(sim, id); if (!t || !alive(t) || !(d > 0)) return { hit: false, killed: false };
    t.hp = Math.max(0, t.hp - d / MODELS[t.key].hp); t.lastHit = sim.t;
    if (t.hp <= 0) { t.state = "destroyed"; t.died = sim.t; t.dest = null; delete sim.rep.ua[id]; delete sim.rep.ru[id]; return { hit: true, killed: true, tel: t }; }
    return { hit: true, killed: false, tel: t };
  }
  /* вибух ракети сторони `by` у точці pos з шкодою dmg: уражає установки ПРОТИВНИКА в радіусі */
  function blast(sim, by, pos, dmg) {
    const out = [], C = sim.cfg;
    for (const t of sim.tels.slice()) {
      if (!alive(t) || t.side === by) continue;
      const d = dist(t.pos, pos); if (d > C.hitFar) continue;
      const k = d <= C.hitFull ? 1 : C.farK + (1 - C.farK) * (C.hitFar - d) / (C.hitFar - C.hitFull) * 0.5;
      const r = damage(sim, t.id, dmg * k); if (r.hit) out.push({ tel: t, killed: r.killed, d });
    }
    return out;
  }

  /* ---------- розвідка установок ---------- */
  /* q: { src, conf 0..1, err км, delay хв }. Повертає false, якщо звіт відкинуто (своя, знищена, надто часто, ліміт). */
  function observe(sim, t, side, q) {
    if (!t || !alive(t) || t.side === side) return false;
    const gk = t.id + ":" + side + ":" + q.src, C = sim.cfg;
    if (sim.t - (sim.gap[gk] == null ? -1e9 : sim.gap[gk]) < C.minGap) return false;
    const known = !!sim.rep[side][t.id];
    if (!known && Object.keys(sim.rep[side]).length + sim.q.filter(x => x.side === side && !sim.rep[side][x.id]).length >= C.maxTrack) return false;
    sim.gap[gk] = sim.t;
    const e = Math.max(0.05, q.err == null ? 0.5 : q.err), a = sim._r() * 6.2832, r = e * Math.sqrt(sim._r());
    sim.q.push({ due: sim.t + Math.max(0, q.delay == null ? 1 : q.delay), id: t.id, side, tObs: sim.t, pos: offKm(t.pos, Math.sin(a) * r, Math.cos(a) * r),
      conf: clamp(q.conf == null ? 0.6 : q.conf, 0.05, 1), err: e, src: q.src || "?", mv: t.state === "march" ? 1 : 0, key: t.key });
    return true;
  }
  const confNow = (sim, r) => r.conf * Math.exp(-(sim.t - r.tObs) / (sim.cfg.tau * (r.mv ? 0.5 : 1)));
  const levelOf = c => c >= 0.7 ? "high" : c >= 0.4 ? "medium" : c >= 0.15 ? "low" : null;
  /* що сторона `side` знає про чужу установку (істину не віддаємо) */
  function view(sim, side, t) {
    const r = t && sim.rep[side] && sim.rep[side][t.id]; if (!r || !alive(t)) return null;
    const c = confNow(sim, r), lv = levelOf(c); if (!lv) return null;
    const age = sim.t - r.tObs, M = MODELS[r.key];
    return { id: t.id, key: r.key, side: t.side, pos: r.pos.slice(), err: r.err + age * M.mv * 0.6 * (r.mv ? 1 : 0.35), conf: c, level: lv, levelN: LEVEL_N[lv], age, stale: age > sim.cfg.staleMin, src: r.src, delay: r.tGot - r.tObs, moving: !!r.mv };
  }
  /* усі чужі установки, відомі стороні */
  function known(sim, side) {
    const o = []; for (const t of sim.tels) { if (t.side === side) continue; const v = view(sim, side, t); if (v) o.push(v); } return o;
  }

  /* ---------- крок ---------- */
  function step(sim, dt) {
    const ev = [], C = sim.cfg; sim.t += dt;
    for (const t of sim.tels) {
      if (t.state === "march") {
        const M = MODELS[t.key], left = dist(t.pos, t.dest), s = M.mv * dt;
        if (s >= left) { t.pos = t.dest.slice(); t.dest = null; t.state = "deploying"; t.timer = prepOf(sim, t); ev.push({ t: "arrived", tel: t }); }
        else { const k = s / left; t.pos = [t.pos[0] + (t.dest[0] - t.pos[0]) * k, t.pos[1] + (t.dest[1] - t.pos[1]) * k]; t.moved += s; }
      } else if (t.state === "deploying") {
        t.timer -= dt; if (t.timer <= 0) { t.timer = 0; t.state = "ready"; ev.push({ t: "ready", tel: t }); }
      } else if (t.state === "reloading") {
        t.timer -= dt; if (t.timer <= 0) { t.timer = 0; t.state = "ready"; t.rounds = MODELS[t.key].rounds; ev.push({ t: "reloaded", tel: t }); }
      }
      if (alive(t) && t.hp < 1 && sim.t - t.lastHit > C.repairIdle && t.state !== "march") t.hp = Math.min(1, t.hp + C.repairPerMin * dt);
    }
    for (let i = sim.tels.length - 1; i >= 0; i--) { const t = sim.tels[i]; if (t.state === "destroyed" && sim.t - t.died > C.wreckMin) sim.tels.splice(i, 1); }
    /* доставка звітів (з затримкою каналу) */
    if (sim.q.length) {
      const rest = [];
      for (const x of sim.q) {
        if (x.due > sim.t) { rest.push(x); continue; }
        const t = byId(sim, x.id); if (!t || !alive(t)) continue;
        const ex = sim.rep[x.side][x.id];
        if (!ex || x.tObs >= ex.tObs || x.conf > confNow(sim, ex)) sim.rep[x.side][x.id] = { pos: x.pos, tObs: x.tObs, tGot: sim.t, conf: x.conf, err: x.err, src: x.src, mv: x.mv, key: x.key };
      }
      sim.q = rest;
    }
    for (const side of ["ua", "ru"]) for (const id of Object.keys(sim.rep[side])) { const r = sim.rep[side][id]; if (!levelOf(confNow(sim, r))) delete sim.rep[side][id]; }
    /* повернення втрачених установок зі складу */
    for (const side of ["ua", "ru"]) for (const k of keysOf(side)) {
      const have = mine(sim, side, k).length + (sim.depot[side][k] | 0);
      if (have < MODELS[k].depot) { sim.sup[side][k] = (sim.sup[side][k] || 0) + dt; if (sim.sup[side][k] >= C.resupplyMin) { sim.sup[side][k] = 0; sim.depot[side][k]++; ev.push({ t: "resupply", side, key: k }); } }
      else sim.sup[side][k] = 0;
    }
    return ev;
  }
  const sigOf = (sim, t) => t.exposed > sim.t ? 1 : (SIG[t.state] || 0);

  /* ---------- профіль польоту балістики ----------
     x — частка пройденого шляху 0..1. Швидкість: розгін (k0 → 0,75) → набір (→ 1) → політ (1) → зниження (→ kt).
     Нормування: середня швидкість за шляхом = 1, тож загальний час польоту лишається таким, як у грі. */
  const PROF = {
    tac: { xb: 0.09, xc: 0.28, xt: 0.78, k0: 0.18, kt: 1.20, apoK: 0.20, apoMin: 8,  vm: 1100 },
    op:  { xb: 0.05, xc: 0.20, xt: 0.82, k0: 0.12, kt: 1.30, apoK: 0.12, apoMin: 20, vm: 2100 },
    ic:  { xb: 0.020, xc: 0.09, xt: 0.88, k0: 0.06, kt: 1.45, apoK: 0.11, apoMin: 300, vm: 6500 }
  };
  const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const rawK = (P, x) => x < P.xb ? P.k0 + (0.75 - P.k0) * smooth(x / P.xb) : x < P.xc ? 0.75 + 0.25 * smooth((x - P.xb) / (P.xc - P.xb)) : x < P.xt ? 1 : 1 + (P.kt - 1) * smooth((x - P.xt) / (1 - P.xt));
  const FL = {};
  /* реєструє профіль ракети й повертає його id (= ключ зброї) */
  function flightId(key, km, ad, opt) {
    if (FL[key]) return key;
    const cls = ad === "icbm" || km >= 1500 ? "ic" : km >= 200 ? "op" : "tac", P = Object.assign({}, PROF[cls]);
    const M = MODELS[key]; if (M) { P.vm = M.vm; P.apo = M.apo; } else P.apo = clamp(P.apoK * km, P.apoMin, 1200);
    if (opt && opt.apo) P.apo = opt.apo;
    let s = 0; const N = 400; for (let i = 0; i < N; i++) s += 1 / rawK(P, (i + 0.5) / N);
    P.norm = s / N; P.cls = cls; FL[key] = P; return key;
  }
  /* у грі шлях проходиться за u.spd·sd·speedK: Σ(1/speedK)/N = 1 → час польоту не змінюється */
  const speedK = (id, x) => { const P = FL[id]; return P ? rawK(P, clamp(x, 0, 1)) * P.norm : 1; };
  const altKm = (id, x) => { const P = FL[id]; if (!P) return 0; x = clamp(x, 0, 1); return P.apo * Math.pow(Math.sin(Math.PI * x), 0.75); };
  const speedMs = (id, x) => { const P = FL[id]; return P ? P.vm * rawK(P, clamp(x, 0, 1)) / P.kt : 0; };
  const altClass = km => km < 1 ? "low" : km < 12 ? "mid" : "high";
  function flightInfo(id, x) {
    const P = FL[id]; if (!P) return null; x = clamp(x, 0, 1);
    const phase = x < P.xb ? "розгін" : x < P.xc ? "набір висоти" : x < P.xt ? "політ" : "зниження";
    const v = speedMs(id, x);
    return { phase, alt: altKm(id, x), v, mach: v / 340, k: speedK(id, x), cls: altClass(altKm(id, x)) };
  }

  function serialize(sim) { return JSON.parse(JSON.stringify(sim)); }
  function restore(data) {
    const sim = JSON.parse(JSON.stringify(data));
    Object.defineProperty(sim, "_r", { value: mulberry(sim.seed + Math.floor(sim.t * 1000)), writable: true, enumerable: false, configurable: true });
    return sim;
  }

  const api = { CFG, MODELS, STATE_N, LEVEL_N, SIG, PROF, keysOf, create, place, relocate, recall, canFire, fire, damage, blast, observe, view, known, step, byId, mine, alive, sigOf, prepOf,
    flightId, speedK, altKm, speedMs, altClass, flightInfo, dist, serialize, restore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BV_TEL = api;
})(typeof window !== "undefined" ? window : globalThis);
