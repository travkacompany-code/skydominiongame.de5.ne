
/* BANGVECTOR 2 · звук, етап 7 — рушій звукового оточення (src/js/07_audio.js).
   • Звуки синтезуються в браузері (Web Audio): окремі аудіофайли не потрібні, звуки можна замінити через BVA.setBuffer.
   • Гучність залежить від відстані камери до точки, зуму (радіус виду) і стану звуку; панорама — від положення точки на екрані.
   • Ліміти: не більше MAX_ONE одноразових і MAX_LOOP петель одночасно; однакові події у межах cooldown склеюються в один звук.
   • Події та камеру подає клей у 03_game.js (tools/audio_glue.js): рушій сам нічого не «вигадує» і не грає випадково.
   • Налаштування (вкл/вимк, загальна гучність, категорії) зберігаються в localStorage. */
(function(){
"use strict";
if (window.BVA) return;

const D2R = Math.PI / 180, R_EARTH = 6371;
const MAX_ONE = 26, MAX_LOOP = 14, CUT = 3.2, LOUD = 0.8, FADE = 0.45, KEY = "bv_audio_v1";
const CATS = {
  launch: { n: "Пуски", vol: 0.9, max: 7, cool: 0.05 },
  air:    { n: "Авіація та БпЛА", vol: 0.7, max: 12, cool: 0 },
  pvo:    { n: "Стрільба ППО", vol: 0.85, max: 8, cool: 0.18 },
  mach:   { n: "Техніка та заводи", vol: 0.42, max: 8, cool: 0 },
  boom:   { n: "Вибухи", vol: 0.95, max: 9, cool: 0.05 }
};
const CAT_ORDER = ["launch", "air", "pvo", "mach", "boom"];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clamp01 = x => clamp(+x || 0, 0, 1);

/* ---------- налаштування ---------- */
const DEF = () => {
  const cats = {};
  for (const c of CAT_ORDER) cats[c] = { on: true, v: 1 };
  return { on: true, master: 0.8, cats };
};
function loadSettings(){
  const d = DEF();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw){
      const o = JSON.parse(raw);
      if (o && typeof o.on === "boolean") d.on = o.on;
      if (o && typeof o.master === "number") d.master = clamp01(o.master);
      if (o && o.cats) for (const c of CAT_ORDER) if (o.cats[c]){
        d.cats[c].on = o.cats[c].on !== false;
        d.cats[c].v = typeof o.cats[c].v === "number" ? clamp01(o.cats[c].v) : 1;
      }
    }
  } catch (e) {}
  return d;
}
let S = loadSettings();
function saveSettings(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- стан ---------- */
let ctx = null, master = null, limiter = null, sr = 48000;
const buses = {}, bufs = new Map(), oneShots = [], loops = new Map(), lastAt = new Map();
const stats = { plays: 0, loopsStarted: 0, stolen: 0, skipped: 0 };
let view = null, paused = false, nextDue = 0, uiBuilt = false, tr = s => s;
const hasDoc = typeof document !== "undefined" && !!document.createElement;

/* ---------- геометрія й простір ---------- */
function hav(lng, lat, lng0, lat0){
  const p1 = lat * D2R, p2 = lat0 * D2R, dp = (lat0 - lat) * D2R, dl = (lng0 - lng) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}
/* Простір точки відносно камери: g — множник гучності (0…1), pan — −1…1, d — відстань, км.
   Референс — половина ширини видимої області: при наближенні (зум) звук гучніший, при відданні — тихіший; за межею CUT — тиша. */
function spatial(v, lng, lat){
  if (!isFinite(lng) || !isFinite(lat)) return null;
  if (!v) return { g: 0.6, pan: 0, d: 0 };
  const d = hav(lng, lat, v.lng, v.lat);
  const Lref = Math.max(v.halfKm || 0, 3), r = d / Lref;
  if (r >= CUT) return { g: 0, pan: 0, d };
  let g = 1 / (1 + 1.4 * r * r);
  if (r > CUT * 0.6){ const k = (CUT - r) / (CUT * 0.4); g *= k * k * (3 - 2 * k); }
  let pan = 0;
  const x = typeof v.px === "function" ? v.px(lng, lat) : NaN;
  if (isFinite(x) && v.W > 0) pan = clamp((x - v.W / 2) / (v.W / 2), -1, 1) * 0.85;
  return { g, pan, d };
}

/* ---------- синтез звуків ---------- */
function rnd(seed){ let s = (seed >>> 0) || 0x9E3779B9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const N = sec => Math.floor(sec * sr);
function noise(n, seed){ const r = rnd(seed), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r() * 2 - 1; return a; }
/* двополюсний фільтр RBJ; частота лінійно змінюється від f1 до f2 */
function biquad(x, type, f1, f2, Q){
  const n = x.length, y = new Float32Array(n); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++){
    const f = f1 + (f2 - f1) * (i / n), w = 2 * Math.PI * clamp(f, 20, sr * 0.45) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * Q);
    let b0, b1, b2;
    if (type === "lp"){ b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === "hp"){ b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/* тон із частотою fn(t) і формою shape(фаза) */
function tonef(n, fn, shape){
  const a = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++){ ph += 2 * Math.PI * fn(i / sr) / sr; a[i] = shape(ph); }
  return a;
}
const SIN = p => Math.sin(p);
const BUZZ = p => Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.33 * Math.sin(3 * p) + 0.25 * Math.sin(4 * p) + 0.2 * Math.sin(5 * p);
const lin = (a, b) => t => a + (b - a) * t;
function ev(n, fn){ const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i / sr); return a; }
/* сума частин: [сигнал, огинаюча|null, коефіцієнт] */
function mix(n, parts){
  const out = new Float32Array(n);
  for (const [s, e, g] of parts) for (let i = 0; i < n; i++) out[i] += s[i] * (e ? e[i] : 1) * g;
  return out;
}
function norm(a, peak){ let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m; return a; }
/* петля без клацання: голова змішується з хвостом, хвіст відрізається */
function loopify(x, F){
  const m = x.length - F, out = new Float32Array(m);
  for (let i = 0; i < m; i++) out[i] = i < F ? x[i] * (i / F) + x[m + i] * (1 - i / F) : x[i];
  return out;
}
const dec = (t, a, tau) => Math.min(1, t / a) * Math.exp(-t / tau);
const SYN = {
  /* одноразові */
  launch_msl: () => { const n = N(2.4), eR = ev(n, t => dec(t, 0.06, 1.5)), eH = ev(n, t => dec(t, 0.12, 1.1));
    return norm(mix(n, [[tonef(n, lin(52, 64), SIN), eR, 0.55], [tonef(n, lin(104, 128), SIN), eR, 0.2], [biquad(noise(n, 1), "lp", 380, 3200, 0.9), eH, 0.7]]), 0.9); },
  launch_drone: () => { const n = N(1.6), ep = ev(n, t => Math.exp(-t / 0.05)), eb = ev(n, t => Math.min(1, t / 0.3) * Math.exp(-t / 1.0) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 26 * t)));
    return norm(mix(n, [[tonef(n, lin(170, 60), SIN), ep, 0.9], [biquad(tonef(n, lin(96, 98), BUZZ), "lp", 1400, 1400, 0.7), eb, 0.35]]), 0.9); },
  launch_jet: () => { const n = N(2.6), e = ev(n, t => Math.pow(clamp(t / 2.2, 0, 1), 1.6) * (t > 2.3 ? Math.exp(-(t - 2.3) / 0.15) : 1));
    return norm(mix(n, [[biquad(noise(n, 2), "bp", 300, 1100, 0.7), e, 0.7], [tonef(n, lin(110, 140), SIN), e, 0.35]]), 0.9); },
  launch_ball: () => { const n = N(2.6), eb = ev(n, t => dec(t, 0.02, 0.9)), eh = ev(n, t => dec(t, 0.8, 1.2));
    return norm(mix(n, [[tonef(n, lin(42, 28), SIN), eb, 0.9], [biquad(noise(n, 3), "hp", 1800, 900, 0.7), eh, 0.35]]), 0.9); },
  pvo_sam: () => { const n = N(1.5), ew = ev(n, t => dec(t, 0.012, 0.42)), et = ev(n, t => dec(t, 0.005, 0.18));
    return norm(mix(n, [[biquad(noise(n, 4), "bp", 2600, 800, 1.5), ew, 0.8], [tonef(n, lin(88, 70), SIN), et, 0.6]]), 0.85); },
  pvo_aam: () => { const n = N(0.9), eh = ev(n, t => dec(t, 0.004, 0.22)), ec = ev(n, t => Math.exp(-t / 0.02));
    return norm(mix(n, [[biquad(noise(n, 5), "hp", 3500, 1800, 0.6), eh, 0.6], [tonef(n, lin(1200, 900), SIN), ec, 0.25]]), 0.7); },
  pvo_drone: () => { const n = N(0.9), ep = ev(n, t => Math.exp(-t / 0.04)), eb = ev(n, t => dec(t, 0.02, 0.35));
    return norm(mix(n, [[tonef(n, lin(260, 120), SIN), ep, 0.8], [biquad(tonef(n, lin(120, 118), BUZZ), "lp", 1500, 1500, 0.7), eb, 0.3]]), 0.7); },
  pvo_gun: () => { const n = N(0.16), ec = ev(n, t => Math.exp(-t / 0.02)), eb = ev(n, t => Math.exp(-t / 0.05));
    return norm(mix(n, [[biquad(noise(n, 6), "bp", 1900, 1900, 1.1), ec, 0.9], [tonef(n, lin(240, 200), SIN), ec, 0.35], [biquad(noise(n, 7), "lp", 900, 700, 0.7), eb, 0.25]]), 0.8); },
  boom_big: () => { const n = N(3.2), r = rnd(8), cr = new Float32Array(n), e1 = ev(n, t => dec(t, 0.004, 1.1)), e2 = ev(n, t => Math.exp(-t / 1.6)), e3 = ev(n, t => dec(t, 0.02, 1.5));
    for (let i = 0; i < n; i++){ const t = i / sr; cr[i] = (t < 1.4 && r() < 0.02 ? (r() * 2 - 1) : 0) * Math.exp(-t / 0.25); }
    return norm(mix(n, [[tonef(n, lin(95, 32), SIN), e1, 0.95], [tonef(n, lin(60, 40), SIN), e2, 0.5], [biquad(noise(n, 9), "lp", 650, 240, 0.7), e3, 0.55], [cr, null, 0.3]]), 0.95); },
  boom_mid: () => { const n = N(1.8), e1 = ev(n, t => dec(t, 0.004, 0.4)), e2 = ev(n, t => dec(t, 0.02, 0.7));
    return norm(mix(n, [[tonef(n, lin(120, 55), SIN), e1, 0.9], [biquad(noise(n, 10), "lp", 1500, 600, 0.7), e2, 0.6]]), 0.85); },
  boom_air: () => { const n = N(1.4), e1 = ev(n, t => dec(t, 0.003, 0.5)), e2 = ev(n, t => dec(t, 0.003, 0.25));
    return norm(mix(n, [[biquad(noise(n, 11), "bp", 900, 900, 0.8), e1, 0.8], [tonef(n, lin(110, 65), SIN), e2, 0.6]]), 0.8); },
  crack: () => { const n = N(0.4), e1 = ev(n, t => Math.exp(-t / 0.05)), e2 = ev(n, t => Math.exp(-t / 0.03));
    return norm(mix(n, [[biquad(noise(n, 12), "hp", 2600, 2600, 0.7), e1, 0.8], [tonef(n, lin(900, 700), SIN), e2, 0.25]]), 0.6); },
  pass_whoosh: () => { const n = N(2.0), e = ev(n, t => Math.pow(Math.sin(Math.PI * clamp(t / 2.0, 0, 1)), 1.5));
    return norm(mix(n, [[biquad(noise(n, 13), "bp", 2400, 650, 2.2), e, 0.9], [tonef(n, lin(220, 160), SIN), e, 0.15]]), 0.8); },
  /* петлі (2 с, без клацання на стику) */
  loop_prop: () => { const n = N(2.0), am = ev(n, t => 0.72 + 0.28 * Math.sin(2 * Math.PI * 26 * t));
    return norm(loopify(mix(n, [[tonef(n, lin(92, 92), BUZZ), am, 0.6], [biquad(noise(n, 14), "lp", 700, 700, 0.7), null, 0.12], [tonef(n, lin(184, 184), SIN), am, 0.1]]), N(0.12)), 0.6); },
  loop_jet: () => { const n = N(2.0), am = ev(n, t => 0.85 + 0.15 * Math.sin(2 * Math.PI * 4 * t));
    return norm(loopify(mix(n, [[biquad(noise(n, 15), "bp", 700, 700, 0.6), am, 0.45], [tonef(n, lin(230, 230), SIN), am, 0.12]]), N(0.12)), 0.6); },
  loop_turbo: () => { const n = N(2.0), am = ev(n, t => 0.9 + 0.1 * Math.sin(2 * Math.PI * 3 * t));
    return norm(loopify(mix(n, [[tonef(n, t => 1380 + 35 * Math.sin(2 * Math.PI * 3 * t), SIN), am, 0.12], [biquad(noise(n, 16), "hp", 1600, 1600, 0.7), am, 0.3]]), N(0.12)), 0.55); },
  loop_hiss: () => { const n = N(2.0), am = ev(n, t => 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.5 * t));
    return norm(loopify(mix(n, [[biquad(noise(n, 17), "hp", 2200, 2200, 0.7), am, 0.35], [biquad(noise(n, 18), "bp", 4000, 4000, 1.2), am, 0.1]]), N(0.12)), 0.5); },
  loop_rotor: () => { const n = N(2.0), am = ev(n, t => 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(2 * Math.PI * 10 * t)));
    return norm(loopify(mix(n, [[biquad(noise(n, 19), "lp", 420, 420, 0.7), am, 0.8], [tonef(n, lin(96, 96), SIN), am, 0.15]]), N(0.12)), 0.6); },
  loop_mach: () => { const n = N(2.0), am = ev(n, t => 0.92 + 0.08 * Math.sin(2 * Math.PI * 0.5 * t));
    return norm(loopify(mix(n, [[tonef(n, lin(50, 50), SIN), am, 0.5], [tonef(n, lin(100, 100), SIN), am, 0.25], [tonef(n, lin(150, 150), SIN), am, 0.12], [biquad(noise(n, 20), "lp", 300, 300, 0.7), am, 0.15]]), N(0.12)), 0.55); },
  loop_truck: () => { const n = N(2.0), am = ev(n, t => 0.75 + 0.25 * Math.sin(2 * Math.PI * 2 * t));
    return norm(loopify(mix(n, [[tonef(n, lin(42, 42), SIN), am, 0.4], [tonef(n, lin(84, 84), SIN), am, 0.15], [biquad(noise(n, 21), "lp", 220, 220, 0.7), am, 0.3]]), N(0.12)), 0.55); }
};

function getBuf(name){
  if (!ctx) return null;
  let b = bufs.get(name);
  if (b) return b;
  if (!SYN[name]) return null;
  const a = SYN[name]();
  b = ctx.createBuffer(1, a.length, sr); b.copyToChannel(a, 0);
  bufs.set(name, b); return b;
}

/* ---------- граф Web Audio ---------- */
function audioCtx(){
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { ctx = null; return null; }
  sr = ctx.sampleRate || 48000;
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.25;
  master = ctx.createGain(); master.gain.value = S.on ? S.master * 0.9 : 0;
  master.connect(limiter); limiter.connect(ctx.destination);
  for (const c of CAT_ORDER){
    const b = ctx.createGain(); b.gain.value = busGain(c); b.connect(master); buses[c] = b;
  }
  return ctx;
}
const busGain = c => (S.on && S.cats[c].on) ? CATS[c].vol * S.cats[c].v : 0;
function applyMix(){
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(S.on ? S.master * 0.9 : 0, t, 0.05);
  for (const c of CAT_ORDER) buses[c].gain.setTargetAtTime(busGain(c), t, 0.05);
  if (!S.on) for (const [k] of loops) stopLoop(k, true);
}
function unlock(){
  if (!S.on) return;
  const c = audioCtx();
  if (c && c.state !== "running" && c.resume) c.resume().catch(() => {});
  if (c && c.state === "running") refreshUI();
}
function wanted(){ return !!(S.on && ctx && ctx.state === "running"); }
function due(now){ if (now < nextDue) return false; nextDue = now + 120; return true; }

/* ---------- одноразові звуки ---------- */
function removeOne(rec){ const i = oneShots.indexOf(rec); if (i >= 0) oneShots.splice(i, 1); }
function stopOne(rec){ try { rec.src.stop(); } catch (e) {} removeOne(rec); }
function capOneShot(cat){
  let n = 0; for (const r of oneShots) if (r.cat === cat) n++;
  while (n >= CATS[cat].max){
    const i = oneShots.findIndex(r => r.cat === cat); if (i < 0) break;
    stopOne(oneShots[i]); stats.stolen++; n--;
  }
  while (oneShots.length >= MAX_ONE){ stopOne(oneShots[0]); stats.stolen++; }
}
function coolOk(key, cool){
  const t = ctx.currentTime, last = lastAt.get(key);
  if (last !== undefined && t - last < cool) return false;
  lastAt.set(key, t); return true;
}
function playOne(name, cat, sp, vol, rate){
  const b = getBuf(name); if (!b) return false;
  capOneShot(cat);
  const c = ctx, src = c.createBufferSource(), g = c.createGain(), pn = c.createStereoPanner ? c.createStereoPanner() : null;
  src.buffer = b; src.playbackRate.value = rate || (0.97 + Math.random() * 0.06);
  g.gain.value = clamp(vol * sp.g * LOUD, 0, 1.5);
  if (pn) pn.pan.value = sp.pan;
  src.connect(g); if (pn){ g.connect(pn); pn.connect(buses[cat]); } else g.connect(buses[cat]);
  const rec = { src, g, pn, cat, name };
  src.onended = () => { removeOne(rec); try { src.disconnect(); g.disconnect(); if (pn) pn.disconnect(); } catch (e) {} };
  oneShots.push(rec);
  try { src.start(); } catch (e) { removeOne(rec); return false; }
  stats.plays++; return true;
}
/* одноразовий звук у точці; key — що склеювати (події з однаковим key у межах cool — один звук) */
function shotAt(name, cat, lng, lat, vol, key, cool){
  if (!wanted() || !CATS[cat] || !S.cats[cat].on) { stats.skipped++; return false; }
  const sp = spatial(view, lng, lat);
  if (!sp || sp.g < 0.015) { stats.skipped++; return false; }
  const cd = cool != null ? cool : CATS[cat].cool;
  if (cd > 0 && !coolOk(key || name, cd)){ stats.skipped++; return false; }
  return playOne(name, cat, sp, vol == null ? 1 : vol);
}

/* ---------- петлі (рух, техніка, заводи) ---------- */
function startLoop(key, kind, cat){
  const b = getBuf("loop_" + kind); if (!b) return null;
  const c = ctx, src = c.createBufferSource(), g = c.createGain(), pn = c.createStereoPanner ? c.createStereoPanner() : null;
  src.buffer = b; src.loop = true; src.playbackRate.value = 0.97 + Math.random() * 0.06;
  g.gain.value = 0;
  src.connect(g); if (pn){ g.connect(pn); pn.connect(buses[cat]); } else g.connect(buses[cat]);
  try { src.start(); } catch (e) { return null; }
  const L = { key, kind, cat, src, g, pn, base: src.playbackRate.value, rel: 0, prevD: undefined, tPrev: 0, dir: 0, passAt: -99, gain: 0, pan: 0, rate: 1, lastSeen: 0 };
  loops.set(key, L); stats.loopsStarted++;
  return L;
}
function stopLoop(key, now){
  const L = loops.get(key); if (!L) return;
  try { L.src.stop(); } catch (e) {}
  try { L.src.disconnect(); L.g.disconnect(); if (L.pn) L.pn.disconnect(); } catch (e) {}
  loops.delete(key);
}
/* кадр: cands = [{key, kind, cat, lng, lat, vol}] — рушій обирає найгучніші, гасить решту, рахує доплер і «прольоти» */
function update(v, cands, o){
  if (v) view = v;
  paused = !!(o && o.paused);
  const live = wanted() && !paused && view;
  const scored = [];
  if (live && cands) for (const e of cands){
    if (!S.cats[e.cat] || !S.cats[e.cat].on) continue;
    const sp = spatial(view, e.lng, e.lat);
    if (!sp || sp.g < 0.01) continue;
    const act = loops.has(e.key) ? 1.25 : 1;             // гістерезис: активні голоси не блимають на межі
    scored.push({ e, sp, s: sp.g * (e.vol == null ? 0.5 : e.vol) * act });
  }
  scored.sort((a, b) => b.s - a.s);
  const keep = new Set(), t = ctx ? ctx.currentTime : 0;
  for (let i = 0; i < scored.length && keep.size < MAX_LOOP; i++){
    const { e, sp, s } = scored[i];
    let L = loops.get(e.key);
    if (!L){ L = startLoop(e.key, e.kind, e.cat); if (!L) continue; }
    keep.add(e.key); L.rel = 0; L.lastSeen = t;
    if (L.prevD !== undefined && view){
      const dt = Math.max(0.02, t - L.tPrev), vr = (L.prevD - sp.d) / dt;   // км/с: + — наближається
      L.rate = clamp(1 + clamp(vr / Math.max(4, view.halfKm) * 6, -0.08, 0.08), 0.9, 1.1);
      const dir = sp.d < L.prevD ? -1 : sp.d > L.prevD ? 1 : 0;
      if (dir === 1 && L.dir === -1 && L.prevD <= view.halfKm * 0.9 && t - L.passAt > 8){
        L.passAt = t; playOne("pass_whoosh", "air", sp, 0.8);     // найближча точка до камери — прольот
      }
      if (dir) L.dir = dir;
    }
    L.prevD = sp.d; L.tPrev = t;
    const target = clamp(sp.g * (e.vol == null ? 0.5 : e.vol) * LOUD, 0, 1);
    L.gain = target; L.pan = sp.pan;
    if (ctx){
      L.g.gain.setTargetAtTime(target, t, 0.12);
      if (L.pn) L.pn.pan.setTargetAtTime(sp.pan, t, 0.12);
      L.src.playbackRate.setTargetAtTime(L.base * L.rate, t, 0.2);
    }
  }
  for (const [k, L] of loops){
    if (keep.has(k)) continue;
    if (!L.rel) L.rel = t || 1e-3;
    if (ctx && L.g.gain.value > 0.0005) L.g.gain.setTargetAtTime(0, t, 0.1);
    if (!ctx || (t - L.rel) > FADE) stopLoop(k, t);
  }
  return keep.size;
}

/* ---------- панель налаштувань ---------- */
const LBL = {
  title: "Звукове оточення", on: "Звук", master: "Загальна гучність", off: "Вимкнути все",
  hint: "Натисніть будь-де, щоб увімкнути звук", reset: "Скинути", close: "Закрити", btn: "Звук"
};
const CSS = `
#audioBtn svg{width:20px;height:20px}
.bva-pn{position:fixed;z-index:70;width:276px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:12px 12px 10px;background:rgba(12,13,16,.96);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#e9edf1;font:13px/1.35 'Exo 2',system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.5)}
.bva-pn[hidden]{display:none}
.bva-pn .bva-h{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#aab3be}
.bva-pn .bva-x{min-width:40px;min-height:40px;background:transparent;border:0;color:#aab3be;font-size:20px;cursor:pointer}
.bva-pn .bva-r{display:grid;grid-template-columns:118px 1fr 40px;gap:8px;align-items:center;min-height:38px}
.bva-pn .bva-r.ck{grid-template-columns:22px 1fr 40px}
.bva-pn input[type=range]{width:100%;accent-color:#ff3b30;margin:0}
.bva-pn input[type=checkbox]{width:20px;height:20px;accent-color:#ff3b30;margin:0}
.bva-pn .bva-v{font-family:'JetBrains Mono',monospace;font-size:11px;color:#aab3be;text-align:right}
.bva-pn .bva-f{display:flex;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}
.bva-pn button.bva-b{min-height:40px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#16171a;color:#e9edf1;font:inherit;cursor:pointer}
.bva-pn .bva-hint{margin-top:8px;font-size:11px;color:#8d96a3}
.bva-pn .bva-hint[hidden]{display:none}
`;
function el(tag, cls, attrs){ const e = document.createElement(tag); if (cls) e.className = cls; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function buildUI(){
  if (uiBuilt || !hasDoc || !document.body) return;
  uiBuilt = true;
  const st = el("style", null, { id: "bv-audio-css" }); st.textContent = CSS; document.head.appendChild(st);
  const btn = el("button", "btn", { id: "audioBtn", type: "button", "aria-label": LBL.btn, title: LBL.title, "aria-expanded": "false" });
  btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8v4h3l4 3V5L6 8H3z"/><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.8 5.2a6.5 6.5 0 0 1 0 9.6"/></svg>';
  (document.getElementById("controls") || document.body).appendChild(btn);
  const pn = el("div", "bva-pn", { id: "audioPanel", role: "dialog", "aria-label": LBL.title, hidden: "" });
  const h = el("div", "bva-h"); const ht = el("span"); ht.dataset.l = "title"; ht.textContent = LBL.title;
  const hx = el("button", "bva-x", { type: "button", "aria-label": LBL.close }); hx.dataset.act = "close"; hx.textContent = "×";
  h.appendChild(ht); h.appendChild(hx); pn.appendChild(h);
  pn.appendChild(rowMaster());
  for (const c of CAT_ORDER) pn.appendChild(rowCat(c));
  const hint = el("div", "bva-hint", { id: "audioHint" }); hint.dataset.l = "hint"; hint.textContent = LBL.hint; pn.appendChild(hint);
  const f = el("div", "bva-f");
  const off = el("button", "bva-b", { type: "button" }); off.dataset.act = "off"; off.dataset.l = "off"; off.textContent = LBL.off;
  const rs = el("button", "bva-b", { type: "button" }); rs.dataset.act = "reset"; rs.dataset.l = "reset"; rs.textContent = LBL.reset;
  f.appendChild(off); f.appendChild(rs); pn.appendChild(f);
  document.body.appendChild(pn);
  btn.addEventListener("click", () => { const open = pn.hidden; open ? openPanel(btn, pn) : closePanel(btn, pn); unlock(); });
  pn.addEventListener("input", onInput); pn.addEventListener("change", onInput); pn.addEventListener("click", onClick);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pn.hidden) closePanel(btn, pn); }, true);
  refreshUI();
}
function rowMaster(){
  const wrap = el("div");
  const r = el("label", "bva-r ck");
  const cb = el("input", null, { type: "checkbox", "data-k": "on" }); cb.checked = S.on;
  const t = el("span"); t.dataset.l = "on"; t.textContent = LBL.on;
  r.appendChild(cb); r.appendChild(t); r.appendChild(el("span", "bva-v", { "data-v": "on" }));
  const r2 = el("div", "bva-r");
  const t2 = el("span"); t2.dataset.l = "master"; t2.textContent = LBL.master;
  const rg = el("input", null, { type: "range", min: "0", max: "1", step: "0.01", "data-k": "master", "aria-label": LBL.master });
  rg.value = String(S.master);
  r2.appendChild(t2); r2.appendChild(rg); r2.appendChild(el("span", "bva-v", { "data-v": "master" }));
  wrap.appendChild(r); wrap.appendChild(r2); return wrap;
}
function rowCat(c){
  const wrap = el("div", "bva-cat");
  const r = el("label", "bva-r ck");
  const cb = el("input", null, { type: "checkbox", "data-k": "on:" + c }); cb.checked = S.cats[c].on;
  const t = el("span"); t.dataset.c = c; t.textContent = CATS[c].n;
  r.appendChild(cb); r.appendChild(t); r.appendChild(el("span", "bva-v", { "data-v": "on:" + c }));
  const r2 = el("div", "bva-r ck");
  const rg = el("input", null, { type: "range", min: "0", max: "1", step: "0.01", "data-k": "v:" + c, "aria-label": CATS[c].n });
  rg.value = String(S.cats[c].v);
  r2.appendChild(el("span")); r2.appendChild(rg); r2.appendChild(el("span", "bva-v", { "data-v": "v:" + c }));
  wrap.appendChild(r); wrap.appendChild(r2); return wrap;
}
function openPanel(btn, pn){
  pn.hidden = false; btn.setAttribute("aria-expanded", "true");
  const b = btn.getBoundingClientRect();
  pn.style.right = Math.max(8, window.innerWidth - b.right + 8) + "px";
  pn.style.bottom = Math.max(8, window.innerHeight - b.top + 8) + "px";
  refreshUI();
}
function closePanel(btn, pn){ pn.hidden = true; btn.setAttribute("aria-expanded", "false"); }
function onInput(e){
  const k = e.target && e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) return;
  if (k === "on") S.on = !!e.target.checked;
  else if (k === "master") S.master = clamp01(e.target.value);
  else if (k.startsWith("on:")) S.cats[k.slice(3)].on = !!e.target.checked;
  else if (k.startsWith("v:")) S.cats[k.slice(2)].v = clamp01(e.target.value);
  else return;
  saveSettings(); applyMix(); refreshUI();
}
function onClick(e){
  const a = e.target && e.target.getAttribute && e.target.getAttribute("data-act"); if (!a) return;
  if (a === "off"){ S.on = false; }
  else if (a === "reset"){ S = DEF(); }
  else return;
  saveSettings(); applyMix(); refreshUI();
}
function refreshUI(){
  if (!uiBuilt) return;
  const pn = document.getElementById("audioPanel"); if (!pn) return;
  const set = (sel, v) => { const x = pn.querySelector(sel); if (x) x.value = v; };
  const q = s => pn.querySelector(s);
  if (q('[data-k="on"]')) q('[data-k="on"]').checked = S.on;
  if (q('[data-k="master"]')) q('[data-k="master"]').value = String(S.master);
  const vm = q('[data-v="master"]'); if (vm) vm.textContent = Math.round(S.master * 100) + "%";
  const von = q('[data-v="on"]'); if (von) von.textContent = S.on ? "увімк" : "вимк";
  for (const c of CAT_ORDER){
    const ck = q('[data-k="on:' + c + '"]'); if (ck) ck.checked = S.cats[c].on;
    set('[data-k="v:' + c + '"]', S.cats[c].v);
    const vc = q('[data-v="v:' + c + '"]'); if (vc) vc.textContent = Math.round(S.cats[c].v * 100) + "%";
    const vo = q('[data-v="on:' + c + '"]'); if (vo) vo.textContent = S.cats[c].on && S.on ? "так" : "ні";
  }
  const hint = document.getElementById("audioHint");
  if (hint) hint.hidden = !(S.on && !(ctx && ctx.state === "running"));
  const bt = document.getElementById("audioBtn");
  if (bt) bt.style.opacity = S.on ? "1" : "0.55";
}
function setTr(fn){
  tr = typeof fn === "function" ? fn : (s => s);
  if (!uiBuilt) return;
  const pn = document.getElementById("audioPanel"); if (!pn) return;
  pn.querySelectorAll("[data-l]").forEach(n => { n.textContent = tr(LBL[n.dataset.l]); });
  pn.querySelectorAll("[data-c]").forEach(n => { n.textContent = tr(CATS[n.dataset.c].n); });
  const bt = document.getElementById("audioBtn"); if (bt) bt.title = tr(LBL.title);
}

/* ---------- публічний API ---------- */
window.BVA = {
  version: "v1",
  CATS: Object.freeze(Object.fromEntries(CAT_ORDER.map(c => [c, { n: CATS[c].n }]))),
  due, wanted, update, shotAt, spatial, unlock, setTr,
  settings: () => JSON.parse(JSON.stringify(S)),
  set(patch){
    if (!patch) return;
    if (typeof patch.on === "boolean") S.on = patch.on;
    if (typeof patch.master === "number") S.master = clamp01(patch.master);
    if (patch.cats) for (const c of CAT_ORDER) if (patch.cats[c]){
      if (typeof patch.cats[c].on === "boolean") S.cats[c].on = patch.cats[c].on;
      if (typeof patch.cats[c].v === "number") S.cats[c].v = clamp01(patch.cats[c].v);
    }
    saveSettings(); applyMix(); refreshUI();
  },
  /* заміна синтезованого звуку на власний AudioBuffer (наприклад, декодований файл) */
  setBuffer(name, buf){ if (SYN[name] && buf && ctx) bufs.set(name, buf); },
  stats: () => ({ ...stats, oneShots: oneShots.length, loops: loops.size, ctx: ctx ? ctx.state : "none", sr }),
  loopKeys: () => [...loops.keys()],
  loopGain: k => { const L = loops.get(k); return L ? L.gain : null; },
  names: () => Object.keys(SYN),
  _state: () => ({ S, view: view ? { halfKm: view.halfKm, W: view.W } : null, paused })
};
/* старт: UI одразу (без звуку); AudioContext створюється після першого жесту користувача */
function boot(){
  buildUI();
  const onGesture = () => unlock();
  for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden){ ctx.suspend && ctx.suspend().catch(() => {}); }
    else if (S.on && ctx.resume) ctx.resume().catch(() => {});
  });
}
if (hasDoc){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
})();

