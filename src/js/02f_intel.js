/* intel:v1 */
/* ---------- етап 7.65: РОЗВІДКА Й ПРИХОВУВАННЯ ІНФОРМАЦІЇ ----------
   Модуль BV_INTEL (02f_intel.js) зберігає лише розвіддані сторони: знімок із рівнем достовірності, що старіє. Тут — «клей» з грою:
   • що приховано від противника: склад і виробництво ворожого заводу, склади/ППО/ресурси в довідці області, запаси пального й енергії,
     а в мережі — точні склади, ППО й економіка ворожої сторони (гість їх більше не отримує);
   • джерела: розвідувальний БпЛА над заводом, запит агентури (заводи й арсенал), документи після знищення урядової будівлі;
   • оповіщення: підготовка атаки (вильот носіїв, зростання запасів, завершення підготовки), пуски (раннє попередження для балістики),
     виявлення повітряних цілей РЛС (групами, з курсом і часом підльоту до міста);
   • діє, коли діє туман війни й гравець — одна зі сторін (fogSide); у пісочниці, у глядача й без туману все відкрито. */
const INTEL = { sim: null, seen: { ua: new Map(), ru: new Map() }, car: new Set(), ew: [], gov: new Set(), prev: {}, warn: {}, tt: { ua: {}, ru: {} }, sent: {}, acc: 0, scan: 0, open: false, sig: "", popVer: -1 };
const intelCore = () => window.BV_INTEL;
const intelSim = () => INTEL.sim || (INTEL.sim = intelCore().create({ seed: 65001 }));
function intelReset(){
  INTEL.sim = null; INTEL.seen = { ua: new Map(), ru: new Map() }; INTEL.car.clear(); INTEL.ew = []; INTEL.gov.clear(); INTEL.prev = {}; INTEL.warn = {}; INTEL.tt = { ua: {}, ru: {} };
  INTEL.sent = {}; INTEL.acc = 0; INTEL.scan = 0; INTEL.sig = ""; INTEL.popVer = -1; if (GAME) GAME.intelV = null;
}
/* чи треба приховати від ЦЬОГО клієнта точні дані сторони sd (вона — не наша, а туман війни діє) */
const intelHide = sd => { const fs = fogSide(); return !!fs && sd !== fs; };
const intelHumans = () => ["ua", "ru"].filter(sd => GAME.ctrl[sd] === "me" || GAME.ctrl[sd] === "remote");
/* розвіддані своєї сторони: на власнику — з модуля, у гостя — з останнього знімка власника */
function intelSnap(){
  const fs = fogSide(); if (!fs) return null;
  if (GAME.puppet) return GAME.intelV || null;
  return intelCore().snapshot(intelSim(), fs, SIM.t);
}

/* ---------- істина (лише власник; джерела розвідки знімають її з похибкою) ---------- */
function intelTruthFac(i){
  const inv = GAME.facInv && GAME.facInv[i], o = {};
  if (inv) for (const p in inv) if (ECO_PI[p] && inv[p] > 0) o[p] = inv[p];
  return o;
}
function intelTruthArs(sd){
  const o = { uav: 0, cruise: 0, ball: 0, other: 0, air: 0, ad: 0 }, st = GAME.stock[sd] || {};
  for (const k in st){
    const n = st[k], W = WEAPONS[k]; if (!W || !(n > 0) || !isFinite(n)) continue;
    const a = W.ad;
    if (a === "drone" || a === "jet" || a === "rd" || W.fpv) o.uav += n; else if (a === "cruise") o.cruise += n;