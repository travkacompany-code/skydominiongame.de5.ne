/* sounds:v1 */
/* ---------- ЗВУКИ ГРИ: клей між грою і рушієм src/js/07_audio.js (BVA) ----------
   • файли з assets/sounds вшиті в збірку (BV_SND_DATA) і декодуються один раз;
   • вони замінюють синтезовані звуки рушія через BVA.setBuffer (ті самі назви, але із записом);
   • події подає цей клей: запуск БпЛА/ракет, вибухи, пуски ППО, гул дронів/літаків/гелікоптерів, музика меню;
   • логіка гри не змінюється: клей лише обгортає spawnWeapon, onStrike, fireRound, startGame через BV_SND_HOOK
     (місток у 03_game.js) і читає стан. Гучність і вимкнення — кнопка «Звук» (07_audio.js). */
(function(){
"use strict";
const DATA = window.BV_SND_DATA || {};
/* файл → призначення: to — звук рушія, kind: shot (разовий) | loop (петля) | music (фонова музика меню) */
const MAP = {
  fpv_takeoff:    { to: "launch_drone", kind: "shot" },   // взлет фпв
  fpv_flight:     { to: "loop_prop",    kind: "loop" },   // полет фпв (гул дронів)
  missile_launch: { to: "launch_msl",   kind: "shot" },   // звук ракеты
  jet_flight:     { to: "loop_jet",     kind: "loop" },   // звук самолет
  heli_flight:    { to: "loop_rotor",   kind: "loop" },   // звук вертолет
  pvo_mobile:     { to: "pvo_sam",      kind: "shot" },   // звук для мобильных огневых групп (ПВО)
  menu:           { to: null,           kind: "music" }   // звук меню (фон до початку бою)
};
const ST = { ready: false, bufs: {}, applied: 0, gesture: false, menu: null, hooks: [], warn: [] };
let G = null;                                   // місток до внутрішніх змінних гри (BV_SND_HOOK)
const warn = (m, e) => { ST.warn.push(m + (e ? ": " + e.message : "")); };
const clamp01 = x => Math.max(0, Math.min(1, +x || 0));

/* ---------- декодування ---------- */
function b64ToAB(dataUrl){
  const s = dataUrl.slice(dataUrl.indexOf(",") + 1), bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
/* петля без клацання: голова змішується з хвостом (як loopify у рушії) */
function seamless(buf){
  const sr = buf.sampleRate, F = Math.min(Math.floor(0.12 * sr), Math.floor(buf.length / 3)), n = buf.length - F;
  const out = new AudioBuffer({ length: n, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
  for (let c = 0; c < buf.numberOfChannels; c++){
    const x = buf.getChannelData(c), y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = i < F ? x[i] * (i / F) + x[n + i] * (1 - i / F) : x[i];
    out.copyToChannel(y, c);
  }
  return out;
}
async function decodeAll(){
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) { warn("немає OfflineAudioContext"); return; }
  const oc = new AC(1, 1, 44100);
  for (const k of Object.keys(MAP)){
    const m = MAP[k], d = DATA[k];
    if (!d || m.kind === "music") continue;
    try {
      const buf = await oc.decodeAudioData(b64ToAB(d));
      ST.bufs[k] = m.kind === "loop" ? seamless(buf) : buf;
    } catch (e) { warn("декодування " + k, e); }
  }
  ST.ready = true;
}
/* підміна в рушії: лише коли аудіоконтекст уже створено (після першого жесту) */
function applyBuffers(){
  if (!window.BVA || !ST.ready || BVA.stats().ctx === "none") return false;
  for (const k of Object.keys(ST.bufs)){ BVA.setBuffer(MAP[k].to, ST.bufs[k]); ST.applied++; }
  return true;
}

/* ---------- події ---------- */
const pos = u => (G && G.unitPos ? G.unitPos(u) : u.pos);
const isDrone = W => !!W && (W.fpv || W.cls === "drone");
const isMissile = W => !!W && (W.cls === "cruise" || W.cls === "ballistic" || W.cls === "hyper");
const weapon = key => (G && G.WEAPONS ? G.WEAPONS[key] : null);
function onLaunch(key, start){
  if (!window.BVA || !start) return;
  const W = weapon(key);
  if (isDrone(W)) BVA.shotAt("launch_drone", "launch", start[0], start[1], 0.8, "L" + key);
  else if (isMissile(W)) BVA.shotAt("launch_msl", "launch", start[0], start[1], 0.9, "L" + key);
}
function onBlast(u, p){
  if (!window.BVA || !p) return;
  const W = weapon(u.key), big = !!W && (W.cls === "ballistic" || W.cls === "hyper");
  BVA.shotAt(big ? "boom_big" : "boom_mid", "boom", p[0], p[1], big ? 1 : 0.8, "B" + u.id);
}
function onAdFire(u, T){
  if (!window.BVA || !T || !u || !u.pos) return;
  if (T.gun) BVA.shotAt("pvo_gun", "pvo", u.pos[0], u.pos[1], 0.8, "G" + u.id);
  else BVA.shotAt("pvo_sam", "pvo", u.pos[0], u.pos[1], 0.9, "S" + u.id);
}
function wrap(name, make){
  try {
    if (typeof G[name] !== "function") { warn("немає " + name); return; }
    G[name] = make(G[name]); ST.hooks.push(name);
  } catch (e) { warn("обгортка " + name, e); }
}

/* ---------- петлі (дрони, літаки, гелікоптери) ---------- */
function cands(){
  const out = [];
  if (!G) return out;
  if (G.units) for (const u of G.units.values()){
    if (u.fall) continue;
    if (u.kind === "w"){
      if (isDrone(weapon(u.key))){ const q = pos(u); out.push({ key: "d" + u.id, kind: "prop", cat: "air", lng: q[0], lat: q[1], vol: 0.6 }); }
    } else if (u.kind === "c"){
      const q = pos(u); out.push({ key: "c" + u.id, kind: "jet", cat: "air", lng: q[0], lat: q[1], vol: 0.7 });
    }
  }
  if (G.ADS && G.ADS.units && G.AD_TYPES) for (const a of G.ADS.units.values()){
    const T = G.AD_TYPES[a.key];
    if (!T || !T.air || a.state === "base" || a.state === "reload" || !a.pos) continue;
    out.push({ key: "a" + a.id, kind: T.heli ? "rotor" : "jet", cat: "air", lng: a.pos[0], lat: a.pos[1], vol: T.heli ? 0.6 : 0.7 });
  }
  return out;
}
function view(){
  const m = G && G.map;
  if (!m || !m.getBounds) return null;
  const c = m.getCenter(), b = m.getBounds(), W = m.getContainer().clientWidth;
  const R = Math.PI / 180, dl = (b.getEast() - b.getWest()) * R, lat = c.lat * R;
  const widthKm = 2 * 6371 * Math.asin(Math.min(1, Math.sin(dl / 2) * Math.cos(lat)));
  return { lng: c.lng, lat: c.lat, halfKm: widthKm / 2, W, px: (lng, la) => m.project([lng, la]).x };
}

/* ---------- музика меню (до старту бою) ---------- */
const inMenu = () => !G || !G.GAME || !G.GAME.on;
function menuStart(){
  if (ST.menu || !DATA.menu || !ST.gesture) return;
  const a = new Audio(DATA.menu); a.loop = true; a.volume = 0;
  ST.menu = a; a.play().catch(() => { ST.menu = null; });
}
function menuStop(){ if (ST.menu){ try { ST.menu.pause(); } catch (e) {} ST.menu = null; } }
function menuSync(){
  if (!ST.menu || !window.BVA) return;
  const st = BVA.settings();
  ST.menu.volume = clamp01(st.on && inMenu() ? st.master * 0.45 : 0);
}

function tick(){
  if (!window.BVA || !G) return;
  let v = null, list = [];
  try { v = view(); } catch (e) { v = null; }
  try { list = cands(); } catch (e) { list = []; }
  BVA.update(v, list, { paused: !!(G.SIM && G.SIM.paused) });
  if (!ST.menu && inMenu()) menuStart();
  menuSync();
  if (!ST.applied) applyBuffers();
}

function install(hook){
  G = hook;
  wrap("spawnWeapon", orig => function(key, variant, start){
    const u = orig.apply(this, arguments); try { onLaunch(key, start); } catch (e) {} return u;
  });
  wrap("onStrike", orig => function(u){
    let p = null; try { p = pos(u); } catch (e) {}
    const r = orig.apply(this, arguments); try { onBlast(u, p); } catch (e) {} return r;
  });
  wrap("fireRound", orig => function(u, T){
    const r = orig.apply(this, arguments); try { onAdFire(u, T); } catch (e) {} return r;
  });
  wrap("startGame", orig => function(){ menuStop(); return orig.apply(this, arguments); });
}

/* ---------- старт ---------- */
const gate = () => { ST.gesture = true; };
window.addEventListener("pointerdown", gate, { capture: true, passive: true });
window.addEventListener("keydown", gate, { capture: true, passive: true });
window.BV_SOUNDS = {
  ready: () => ST.ready, applied: () => ST.applied, hooks: () => ST.hooks.slice(), warnings: () => ST.warn.slice(),
  bufs: () => Object.keys(ST.bufs), menuPlaying: () => !!(ST.menu && !ST.menu.paused), cands: () => cands().length
};
if (!window.BV_SND_HOOK) warn("немає BV_SND_HOOK (03_game.js не містить містка)");
else decodeAll().then(() => { install(window.BV_SND_HOOK); setInterval(tick, 150); tick(); });
})();
