/* ======================================================================
   BV_FOG — «Туман війни»: незалежна розвідувальна картина кожної сторони (етап 7.60)
   Чистий модуль (як 02b_hornet_ai.js і 02c_radar.js): не знає ні про мапу, ні про 03_game.js. Усі числа — ігровий баланс.

   Що тут є:
   • сховище розвідданих `intel[side]` — окреме для кожної сторони; противник нічого з нього не бачить;
   • звіт спостерігача → канал зв'язку (затримка, обрив) → сховище: дані доходять із запізненням, а за обриву каналу — не доходять;
   • рівні знання: detected (є щось у точці) → identified (відомий тип); тип «липкий», позиція — ні;
   • старіння: свіжі дані → застарілі (впевненість спадає) → lost (привид на останній позиції) → мітка зникає;
   • екстраполяція рухомих контактів за останньою швидкістю (обмежена в часі), позиція нерухомих лишається там, де її бачили;
   • датчики-розвідники (`sense`): ймовірність спостереження за секунду залежить від дальності, помітності цілі й дальності ідентифікації;
   • «негативне спостереження» (`clear`): розвідник дивиться в точку, де був об'єкт, а там порожньо — контакт знімається.
   Повітряні цілі для РЛС живуть у BV_RADAR (sim.pic); цей модуль веде решту (наземні об'єкти, РЕР, кораблі, техніка).
   ====================================================================== */
(function (root) {
  "use strict";

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- баланс ---------- */
  /* клас об'єкта (за першою літерою ключа): скільки секунд дані вважаються свіжими, коли контакт стає «втраченим» і коли зникає з карти */
  const KIND = {
    r: { name: "РЛС",            mobile: false, ttl: 240, lost: 600, drop: 1500, v: 0 },
    e: { name: "РЕБ",            mobile: false, ttl: 240, lost: 600, drop: 1500, v: 0 },
    a: { name: "ППО",            mobile: true,  ttl: 150, lost: 420, drop: 1200, v: 0.04 },   // ЗРК переставляють: швидкість лише для екстраполяції
    s: { name: "корабель",       mobile: true,  ttl: 45,  lost: 150, drop: 600,  v: 0.5 },
    v: { name: "транспорт",      mobile: true,  ttl: 40,  lost: 120, drop: 420,  v: 0.6 },
    x: { name: "об'єкт",         mobile: false, ttl: 120, lost: 360, drop: 900,  v: 0 }
  };
  const CFG = {
    tau: 1,               // спад впевненості = exp(−(вік−ttl)/(tau·ttl))
    extrapMax: 60,        // с — скільки секунд позиція рухомого контакту екстраполюється за швидкістю
    posTau: 20,           // с — «пам'ять» позиції при злитті нових звітів
    maxSpeed: 1.2,        // км/с — запобіжник оцінки швидкості
    dwellKeep: 25,        // с — скільки лишається накопичена ідентифікація без нових спостережень
    sigmaAge: 0.002       // км/с — зростання невизначеності позиції зі старінням (рухомі ×10)
  };

  /* ---------- датчики (класи платформ) ----------
     R — дальність виявлення, км; idR — дальність, на якій ідентифікація накопичується повним темпом; rate — інтенсивність спостереження за с
     при ідеальній видимості; idSec — с накопиченого спостереження для ідентифікації; lat — затримка передачі звіту, с; sigma — похибка позиції, км */
  const SENS = {
    recon_uav: { R: 22, idR: 12, rate: 0.55, idSec: 5, lat: 2.5, sigma: 0.25, name: "розвідувальний БпЛА" },
    tac_drone: { R: 4,  idR: 2.5, rate: 0.8, idSec: 2, lat: 3.0, sigma: 0.08, name: "тактичний БпЛА (камера)" },
    jet:       { R: 30, idR: 14, rate: 0.35, idSec: 6, lat: 2.0, sigma: 0.4, name: "літак (РЛС/ОЕС)" },
    heli:      { R: 14, idR: 8,  rate: 0.45, idSec: 5, lat: 2.0, sigma: 0.3, name: "вертоліт" },
    ship:      { R: 20, idR: 10, rate: 0.3,  idSec: 8, lat: 3.0, sigma: 0.5, name: "корабель" }
  };

  /* ---------- генератор ---------- */
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rnd(fog) { return fog._r(); }
  function gauss(fog) { return Math.sqrt(-2 * Math.log(rnd(fog) + 1e-12)) * Math.cos(6.283185307 * rnd(fog)); }

  const kindOf = key => KIND[String(key).charAt(0)] || KIND.x;

  /* ---------- життєвий цикл ---------- */
  function create(o) {
    o = o || {};
    const seed = o.seed == null ? 1 : o.seed;
    const fog = { t: 0, seed, n: 0, q: [], intel: { ua: {}, ru: {} }, cleared: { ua: {}, ru: {} }, dwell: { ua: {}, ru: {} }, lat: { ua: { n: 0, avg: 0 }, ru: { n: 0, avg: 0 } }, cfg: Object.assign({}, CFG, o.cfg || {}) };
    Object.defineProperty(fog, "_r", { value: mulberry(seed), writable: true, enumerable: false, configurable: true });
    return fog;
  }

  /* звіт спостерігача → черга доставки. link = { up, latency }. Повертає true, якщо звіт пішов у канал */
  function report(fog, side, rep, link) {
    if (!rep || rep.key == null || !fog.intel[side]) return false;
    const L = link || { up: true, latency: 0 };
    if (L.up === false) return false;                                           // канал обірвано: розвідка є, на КП нічого не доходить
    fog.q.push({ at: fog.t + Math.max(0, L.latency || 0), side, rep: Object.assign({}, rep) });
    return true;
  }

  function deliver(fog, side, rep, recvT) {
    const M = fog.intel[side], K = kindOf(rep.key), C = fog.cfg;
    const clr = fog.cleared[side][rep.key];
    if (clr != null && rep.obsT <= clr) return;                                 // звіт старіший за «негативне спостереження» — не воскрешає контакт
    let c = M[rep.key];
    if (!c) {
      c = M[rep.key] = { key: rep.key, kind: String(rep.key).charAt(0), x: rep.x, y: rep.y, vx: 0, vy: 0, sigma: rep.sigma || 0.3, state: "detected", tag: null, conf0: 0, first: rep.obsT, lastObs: rep.obsT, lastRecv: recvT, n: 0, srcs: {}, hasV: false };
    } else if (rep.obsT >= c.lastObs) {
      const dt = rep.obsT - c.lastObs;
      if (K.mobile && dt > 0.5) {                                               // оцінка швидкості за двома спостереженнями (лише рухомі класи)
        let vx = (rep.x - c.x) / dt, vy = (rep.y - c.y) / dt;
        const sp = Math.hypot(vx, vy), lim = Math.min(C.maxSpeed, K.v * 4 || 0.2);
        if (sp > lim) { vx *= lim / sp; vy *= lim / sp; }
        c.vx = c.hasV ? 0.5 * c.vx + 0.5 * vx : vx; c.vy = c.hasV ? 0.5 * c.vy + 0.5 * vy : vy; c.hasV = true;
      }
      const s0 = c.sigma + dt * C.sigmaAge * (K.mobile ? 10 : 1), s1 = rep.sigma || 0.3;
      const w0 = Math.exp(-dt / C.posTau) / (s0 * s0), w1 = 1 / (s1 * s1);
      const px = c.x + (K.mobile ? c.vx * Math.min(dt, C.extrapMax) : 0), py = c.y + (K.mobile ? c.vy * Math.min(dt, C.extrapMax) : 0);
      c.x = (px * w0 + rep.x * w1) / (w0 + w1); c.y = (py * w0 + rep.y * w1) / (w0 + w1);
      c.sigma = Math.max(0.03, Math.min(s0, s1) * 0.75, 1 / Math.sqrt(w0 + w1));
      c.lastObs = rep.obsT;
    }
    if (rep.state === "identified") { c.state = "identified"; if (rep.tag != null) c.tag = rep.tag; }
    c.conf0 = Math.min(0.99, 1 - (1 - c.conf0) * (1 - clamp(rep.conf == null ? 0.6 : rep.conf, 0, 0.99)));
    c.srcs[rep.src || "?"] = rep.obsT; c.n++; c.lastRecv = recvT;
    const L = fog.lat[side], d = Math.max(0, recvT - rep.obsT); L.avg = L.n ? L.avg * 0.9 + d * 0.1 : d; L.n++;
  }

  /* крок: доставка звітів, чия затримка минула; зникнення зістарілих контактів */
  function step(fog, dt) {
    fog.t += dt;
    if (fog.q.length) {
      fog.q.sort((a, b) => a.at - b.at);
      let i = 0;
      while (i < fog.q.length && fog.q[i].at <= fog.t) { const e = fog.q[i++]; deliver(fog, e.side, e.rep, e.at); }
      if (i) fog.q.splice(0, i);
    }
    for (const side of ["ua", "ru"]) {
      const M = fog.intel[side];
      for (const k in M) {
        const c = M[k], K = kindOf(k), age = fog.t - c.lastObs;
        if (age > K.drop || (age > K.ttl && curConf(fog, c, K) < 0.03)) delete M[k];
      }
      const D = fog.dwell[side];
      for (const k in D) if (fog.t - D[k].t > fog.cfg.dwellKeep) delete D[k];
      const Z = fog.cleared[side];
      for (const k in Z) if (fog.t - Z[k] > 600) delete Z[k];
    }
  }

  function curConf(fog, c, K) { const age = fog.t - c.lastObs; return age <= K.ttl ? c.conf0 : c.conf0 * Math.exp(-(age - K.ttl) / (fog.cfg.tau * K.ttl)); }

  /* ---------- вигляд контакту для гри ---------- */
  function viewOf(fog, c) {
    const K = kindOf(c.key), age = Math.max(0, fog.t - c.lastObs), conf = curConf(fog, c, K);
    const lost = age > K.lost, stale = age > K.ttl;
    const ex = K.mobile && c.hasV ? Math.min(age, fog.cfg.extrapMax) : 0;
    return {
      key: c.key, kind: c.kind, kindName: K.name,
      state: lost ? "lost" : c.state, rank: c.state, stale, lost, conf, age,
      x: c.x + c.vx * ex, y: c.y + c.vy * ex, vx: c.vx, vy: c.vy, hasV: c.hasV,
      sigma: c.sigma + age * fog.cfg.sigmaAge * (K.mobile ? 10 : 1),
      tag: c.tag, srcs: Object.keys(c.srcs), delay: Math.max(0, c.lastRecv - c.lastObs), firstSeen: c.first, n: c.n
    };
  }
  function view(fog, side, key) { const c = fog.intel[side] && fog.intel[side][key]; return c ? viewOf(fog, c) : null; }
  function list(fog, side) { const out = []; const M = fog.intel[side] || {}; for (const k in M) out.push(viewOf(fog, M[k])); return out; }
  const knows = (fog, side, key, minRank) => { const v = view(fog, side, key); if (!v || v.lost) return false; return !minRank || minRank === "detected" || v.rank === "identified"; };

  /* контакт зняли (негативне спостереження / знищений об'єкт) */
  function clear(fog, side, key) {
    const had = !!fog.intel[side][key]; delete fog.intel[side][key];
    fog.cleared[side][key] = fog.t;
    fog.q = fog.q.filter(e => !(e.side === side && e.rep.key === key && e.rep.obsT <= fog.t));
    return had;
  }

  /* ---------- датчики ----------
     pl = { id, cls, x, y }, targets = [{ key, kind, x, y, side, vis (0..1), tag }], env = { link(pl) → {up, latency}, los(x1,y1,x2,y2) → 0..1 } */
  function sense(fog, side, pl, targets, env, dt) {
    const S = SENS[pl.cls]; if (!S) return 0;
    env = env || {};
    const D = fog.dwell[side]; let nrep = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.side === side) continue;
      const d = Math.hypot(t.x - pl.x, t.y - pl.y);
      if (d >= S.R) continue;
      const vis = clamp(t.vis == null ? 1 : t.vis, 0, 1), los = env.los ? clamp(env.los(pl.x, pl.y, t.x, t.y), 0, 1) : 1;
      const f = 1 - (d / S.R) * (d / S.R);
      const dk = pl.id + ">" + t.key, w = D[dk] || (D[dk] = { s: 0, t: fog.t });
      w.s += dt * (d <= S.idR ? 1 : 0.3) * los; w.t = fog.t;                    // час безперервного спостереження (рельєф затуляє) — звідси ідентифікація
      const p = 1 - Math.exp(-S.rate * vis * f * los * dt);
      if (!(rnd(fog) < p)) continue;
      const ident = w.s >= S.idSec * (1 + (1 - vis) * 1.5);
      const sg = S.sigma * (1 + d / S.R);
      const rep = { key: t.key, kind: t.kind, x: t.x + gauss(fog) * sg, y: t.y + gauss(fog) * sg, obsT: fog.t, state: ident ? "identified" : "detected", tag: ident ? t.tag : null,
        conf: clamp(0.5 + 0.45 * f, 0, 0.95), sigma: sg, src: pl.cls };
      const link = env.link ? env.link(pl) : { up: true, latency: S.lat };
      if (report(fog, side, rep, link)) nrep++;
    }
    return nrep;
  }

  /* разове спостереження зовнішнього джерела (РЕР тощо): позиція отримує шум σ */
  function observe(fog, side, o, link) {
    const sg = o.sigma || 0.3;
    return report(fog, side, { key: o.key, kind: o.kind, x: o.x + gauss(fog) * sg, y: o.y + gauss(fog) * sg, obsT: fog.t, state: o.state || "detected", tag: o.tag || null,
      conf: o.conf == null ? 0.8 : o.conf, sigma: sg, src: o.src || "elint" }, link);
  }

  /* негативне спостереження: платформа бачить район контакту (радіус < R·0.5), а «справжній» об'єкт там відсутній */
  function covers(pl, x, y) { const S = SENS[pl.cls]; return !!S && Math.hypot(x - pl.x, y - pl.y) <= S.R * 0.5; }

  function stats(fog, side) {
    const l = list(fog, side); const o = { total: l.length, identified: 0, detected: 0, stale: 0, lost: 0, delay: fog.lat[side].avg };
    for (const v of l) { if (v.lost) o.lost++; else { if (v.rank === "identified") o.identified++; else o.detected++; if (v.stale) o.stale++; } }
    return o;
  }

  function serialize(fog) { return JSON.parse(JSON.stringify(fog)); }
  function restore(data, seed) {
    const fog = JSON.parse(JSON.stringify(data));
    Object.defineProperty(fog, "_r", { value: mulberry((seed == null ? fog.seed : seed) + Math.floor(fog.t * 1000)), writable: true, enumerable: false, configurable: true });
    return fog;
  }

  const api = { CFG, KIND, SENS, create, report, observe, step, view, list, knows, clear, sense, covers, stats, kindOf, serialize, restore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BV_FOG = api;
})(typeof window !== "undefined" ? window : globalThis);
