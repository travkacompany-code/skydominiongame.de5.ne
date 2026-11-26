/* SKYDOMINION · 230 · PERF2 — адаптивний менеджер продуктивності (етап 7.80)
   Вставляється ПЕРШИМ скриптом у <head> (tools/apply_perf2.py): до мапи й гри.
   Що робить:
   • визначає клас пристрою (ядра, пам'ять, мобільний, DPR, saveData) і ставить рівень якості 0…4;
   • у грі міряє реальний FPS і сам знижує / обережно підвищує рівень (з гістерезисом, без «пилки»);
   • обмежує частоту кадрів (rAF-шлюз: 30 / ≈20 к/с на слабких), знижує devicePixelRatio, глушить shadowBlur canvas;
   • дає грі помічники: BV_PERF.ruMs/adMs/ewMs/pulseDue/skip/ui/view/circle — їх викликають точкові патчі 03_game.js.
   Логіка гри не змінюється: лише частота й вартість відмальовки. Без цього скрипту гра працює як раніше (шим на початку 03_game.js, див. apply_perf2.py).
   Керування: ?perf=auto|ultra|high|mid|low|potato|0..4, localStorage "sx.perf", консоль BV_PERF.set("low"); ?fps=1 — лічильник. */
(function(){
"use strict";
if (window.BV_PERF) return;
const W = window, D = document, N = navigator;
const ls = (k, v) => { try { if (v === undefined) return W.localStorage.getItem(k); W.localStorage.setItem(k, v); } catch (e) { return null; } };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- таблиця рівнів ----------
   fps    — ліміт кадрів (0 = без ліміту), dpr — стеля devicePixelRatio,
   ru     — період оновлення джерела units, мс (×1,7 при >250 юнітах), adu / ew — множники періодів ППО-шару й РЕБ,
   vis    — мін. інтервал canvas-шарів РЛС/туману, мс (0 = кожен кадр), trail — кількість секторів шлейфу РЛС,
   sub    — максимум підкроків симуляції за кадр, shadow — множник shadowBlur, ui — множник періоду UI-таймерів,
   pulse  — період пульсації шарів фронту, мс (0 = вимкнено), cull — відсів юнітів поза екраном (запас, частка екрана) */
const TIERS = [
  { n: "ultra",  fps: 0,  dpr: 2,    ru: 33, adu: 1,   ew: 1,   vis: 0,  trail: 16, sub: 8, shadow: 1,   ui: 1,   pulse: 80,  cull: 0.30 },
  { n: "high",   fps: 0,  dpr: 2,    ru: 40, adu: 1.2, ew: 1.2, vis: 0,  trail: 12, sub: 8, shadow: 1,   ui: 1,   pulse: 100, cull: 0.25 },
  { n: "mid",    fps: 0,  dpr: 1.5,  ru: 50, adu: 1.6, ew: 1.6, vis: 25, trail: 8,  sub: 6, shadow: 0.4, ui: 1.5, pulse: 200, cull: 0.20 },
  { n: "low",    fps: 30, dpr: 1.25, ru: 66, adu: 2.2, ew: 2.2, vis: 40, trail: 5,  sub: 4, shadow: 0,   ui: 2,   pulse: 500, cull: 0.15 },
  { n: "potato", fps: 24, dpr: 1,    ru: 90, adu: 3,   ew: 3,   vis: 50, trail: 3,  sub: 3, shadow: 0,   ui: 3,   pulse: 0,   cull: 0.10 }
];

/* ---------- реальний DPR (щоб масштаб сторінки в браузері працював) ---------- */
let realDprGet = null;
try { const d = Object.getOwnPropertyDescriptor(W, "devicePixelRatio"); if (d && d.get) realDprGet = d.get.bind(W); } catch (e) {}
const dpr0 = Math.max(1, (realDprGet ? realDprGet() : W.devicePixelRatio) || 1);
const realDpr = () => Math.max(1, (realDprGet ? realDprGet() : dpr0) || 1);

/* ---------- початковий рівень ---------- */
function parseForced(v){
  if (v == null || v === "" || v === "auto") return null;
  if (/^[0-4]$/.test(v)) return +v;
  const i = TIERS.findIndex(t => t.n === String(v).toLowerCase());
  return i < 0 ? null : i;
}
function detect(){
  let s = 0;
  const cores = N.hardwareConcurrency || 4, mem = N.deviceMemory || 4, ua = N.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (N.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (cores <= 2) s += 2; else if (cores <= 4) s += 1; else if (cores >= 8) s -= 1;
  if (mem <= 2) s += 2; else if (mem <= 4) s += 1; else if (mem >= 8) s -= 1;
  if (mobile) s += 1;
  if (mobile && dpr0 >= 3) s += 1;
  try { const c = N.connection; if (c && c.saveData) s += 1; } catch (e) {}
  try { if (W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches) s += 1; } catch (e) {}
  return clamp(s, 0, 4);
}
let qs = ""; try { qs = new URLSearchParams(W.location.search).get("perf") || ""; } catch (e) {}
let forced = parseForced(qs || ls("sx.perf"));
let tier = forced != null ? forced : detect(), P = TIERS[tier];
const startTier = tier;
const listeners = [];

/* ---------- DPR і shadowBlur: одна точка впливу на мапу та всі canvas-шари ---------- */
try {
  Object.defineProperty(W, "devicePixelRatio", { configurable: true, enumerable: true, get(){ return Math.min(realDpr(), P.dpr); } });
} catch (e) {}
try {
  const pr = W.CanvasRenderingContext2D && W.CanvasRenderingContext2D.prototype, ds = pr && Object.getOwnPropertyDescriptor(pr, "shadowBlur");
  if (ds && ds.set && ds.get) Object.defineProperty(pr, "shadowBlur", { configurable: true, enumerable: ds.enumerable,
    get(){ return ds.get.call(this); }, set(v){ ds.set.call(this, P.shadow >= 1 ? v : (+v || 0) * P.shadow); } });
} catch (e) {}

/* ---------- rAF-шлюз: ліміт кадрів для всіх циклів (гра, РЛС, туман, MapLibre) ---------- */
const rawRAF = W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : null;
const rawCancel = W.cancelAnimationFrame ? W.cancelAnimationFrame.bind(W) : null;
let lastPass = -1e9, decT = -1, decOk = true;
function pass(t){
  if (t === decT) return decOk;              // усі колбеки одного кадру отримують те саме рішення
  decT = t;
  const f = P.fps;
  if (!f || D.hidden){ decOk = true; lastPass = t; return true; }
  if (t - lastPass >= 1000 / f - 2.5){ lastPass = t; decOk = true; } else decOk = false;
  return decOk;
}
if (rawRAF){
  let seq = 0; const live = new Map();
  W.requestAnimationFrame = function(cb){
    const id = ++seq;
    const run = t => { if (!pass(t)){ live.set(id, rawRAF(run)); return; } live.delete(id); cb(t); };
    live.set(id, rawRAF(run));
    return id;
  };
  W.cancelAnimationFrame = function(id){
    const r = live.get(id);
    if (r !== undefined){ live.delete(id); rawCancel(r); } else rawCancel(id);
  };
}

/* ---------- застосування рівня ---------- */
function refit(){
  const m = W.bvMap;
  try { if (m && m.setPixelRatio) m.setPixelRatio(Math.min(realDpr(), P.dpr)); } catch (e) {}
  try { W.dispatchEvent(new Event("resize")); } catch (e) {}      // canvas-шари РЛС / туману / FX перечитують DPR
}
function apply(i, why){
  i = clamp(i | 0, 0, 4);
  const changed = i !== tier;
  tier = i; P = TIERS[i];
  try { D.documentElement.setAttribute("data-perf", String(i)); } catch (e) {}
  if (changed){
    refit();
    for (const fn of listeners) try { fn(i, P, why); } catch (e) {}
    try { if (W.console) console.info("[perf] рівень " + i + " «" + P.n + "»" + (why ? " — " + why : "")); } catch (e) {}
  }
}
try { D.documentElement.setAttribute("data-perf", String(tier)); } catch (e) {}

/* ---------- кеш кіл (range-кільця ППО / РЕБ / РЛС: чиста функція від центру, радіуса й кількості вершин) ---------- */
const CC = new Map(), CC_MAX = 600;
function circle(c, km, n, D2R){
  const lng = Math.round(c[0] * 1e4) / 1e4, lat = Math.round(c[1] * 1e4) / 1e4;     // ~11 м: непомітно, зате стояча техніка й повільні кораблі б'ють у кеш
  const key = lng + "," + lat + "," + km + "," + n, hit = CC.get(key);
  if (hit) return hit;
  const pts = new Array(n + 1), kx = 111.32 * Math.cos(lat * D2R), ky = 110.574, dx = km / kx, dy = km / ky, TP = 2 * Math.PI;
  for (let i = 0; i <= n; i++){ const a = i / n * TP; pts[i] = [lng + dx * Math.cos(a), lat + dy * Math.sin(a)]; }
  if (CC.size >= CC_MAX){ let k = 0; for (const key2 of CC.keys()){ CC.delete(key2); if (++k >= CC_MAX / 3) break; } }
  CC.set(key, pts);
  return pts;
}

/* ---------- монітор FPS і саморегуляція ---------- */
const ST = { fps: 0, hz: 60, drops: 0, raises: 0, ceil: 0, lastChange: 0, lastRaise: 0, lastDropWhy: "" };
let frames = 0, winT0 = 0, mLast = 0, bad = 0, good = 0, hzBuf = [], t0 = 0, meter = null, meterOn = false;
function mapBusy(){ const m = W.bvMap; try { return !!(m && m.loaded && !m.loaded()); } catch (e) { return false; } }
function evalWindow(now, fps){
  ST.fps = fps;
  if (meterOn && meter) meter.textContent = Math.round(fps) + " fps · " + P.n + (W.bvMap ? " · dpr " + Math.min(realDpr(), P.dpr) : "");
  if (forced != null) return;                                              // рівень задано вручну — не чіпаємо
  if (now - t0 < 5000 || now - ST.lastChange < 4000 || mapBusy()){ bad = good = 0; return; }
  const hz = ST.hz;
  if (fps < 0.72 * hz){ bad++; good = 0; } else if (fps >= 0.93 * hz){ good++; bad = 0; } else { bad = Math.max(0, bad - 1); good = 0; }
  if (bad >= 3 && tier < 4){                                               // 3 вікна по 2 с поспіль під 72% герцовки
    if (ST.lastRaise && now - ST.lastRaise < 90000){ ST.ceil = tier + 1; ST.lastRaise = 0; }     // підвищення не прижилось → цей рівень закрито (один раз), вище не пробуємо
    ST.drops++; ST.lastChange = now; bad = good = 0; ST.lastDropWhy = Math.round(fps) + " к/с при " + Math.round(hz) + " Гц";
    apply(tier + 1, "FPS " + ST.lastDropWhy);
  } else if (good >= 15 && tier > ST.ceil && tier > 0 && now - ST.lastChange > 30000){      // 30 с без проблем — пробуємо на крок вище
    ST.raises++; ST.lastChange = ST.lastRaise = now; bad = good = 0;
    apply(tier - 1, "запас FPS");
  }
}
function monitor(t){
  rawRAF(monitor);
  if (D.hidden){ mLast = 0; winT0 = 0; frames = 0; return; }
  if (mLast){
    const dt = t - mLast;
    if (dt > 400){ winT0 = 0; frames = 0; }                                // пауза / перемикання вкладки — не міряємо
    else {
      if (hzBuf.length < 120 && dt > 2){ hzBuf.push(dt); if (hzBuf.length === 120){ hzBuf.sort((a, b) => a - b); ST.hz = clamp(1000 / hzBuf[(hzBuf.length * 0.25) | 0], 30, 165); } }
      if (!winT0) winT0 = t;
      frames++;
      if (t - winT0 >= 2000){ evalWindow(t, frames * 1000 / (t - winT0)); winT0 = t; frames = 0; }
    }
  }
  mLast = t;
}
if (rawRAF){ t0 = (W.performance && performance.now()) || 0; rawRAF(monitor); }

/* ---------- публічний API ---------- */
const API = {
  TIERS,
  get tier(){ return tier; }, get name(){ return P.n; }, get p(){ return P; }, get start(){ return startTier; },
  get fps(){ return ST.fps; }, get state(){ return Object.assign({}, ST, { tier, name: P.n, forced: forced != null, dpr: Math.min(realDpr(), P.dpr), cacheCircles: CC.size }); },
  set(v){ const f = parseForced(v); if (f == null){ forced = null; ls("sx.perf", "auto"); ST.ceil = 0; apply(detect(), "auto"); } else { forced = f; ls("sx.perf", String(v)); apply(f, "вручну"); } return tier; },
  onChange(fn){ if (typeof fn === "function") listeners.push(fn); },
  /* періоди та пороги для патчів гри */
  ruMs(n){ return P.ru * (n > 250 ? 1.7 : 1); },
  adMs(air){ return (air ? 45 : 120) * P.adu; },
  ewMs(){ return 250 * P.ew; },
  pulseDue(dt){ return P.pulse > 0 && dt > P.pulse && !D.hidden; },
  /* пропуск кадру canvas-шару: true — цей кадр не малювати */
  skip(key, now){ const v = P.vis; if (!v) return false; const l = SK[key] || 0; if (now - l < v) return true; SK[key] = now; return false; },
  /* інтервал для чисто-візуальних UI-таймерів: на слабких рідше, у прихованій вкладці — ніколи */
  ui(fn, ms){
    let last = 0;
    return setInterval(function(){
      if (D.hidden) return;
      const now = (W.performance && performance.now()) || Date.now();
      if (now - last < ms * P.ui - 8) return;
      last = now; return fn.apply(this, arguments);
    }, ms);
  },
  /* видима область мапи з запасом: [w, s, e, n] або null */
  view(map){
    try {
      const b = map.getBounds(), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth(), k = P.cull, dx = (e - w) * k, dy = (n - s) * k;
      if (!(e > w && n > s)) return null;
      return [w - dx, s - dy, e + dx, n + dy];
    } catch (e) { return null; }
  },
  circle,
  hud(on){
    meterOn = on !== false;
    if (meterOn && !meter && D.body){
      meter = D.createElement("div"); meter.id = "perfMeter";
      meter.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99999;font:11px/1 monospace;color:#9f9;background:rgba(0,0,0,.6);padding:3px 6px;border-radius:4px;pointer-events:none";
      D.body.appendChild(meter);
    }
    if (meter) meter.style.display = meterOn ? "block" : "none";
    return meterOn;
  }
};
const SK = Object.create(null);
W.BV_PERF = API;
try { if (/[?&]fps=1/.test(W.location.search)) D.addEventListener("DOMContentLoaded", () => API.hud(true)); } catch (e) {}
if (W.console) try { console.info("[perf] старт: рівень " + tier + " «" + P.n + "»" + (forced != null ? " (вручну)" : " (авто)") + " · DPR " + dpr0 + " → " + Math.min(dpr0, P.dpr)); } catch (e) {}
})();
