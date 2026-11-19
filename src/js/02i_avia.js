/* ======================================================================
   BV_AVIA — ударна авіація: аеродроми, злітні смуги, стоянки, авіагрупи (етап 7.68, «BANGVECTOR 2 · етап 4»)
   Чистий модуль (як 02g_tel.js і 02h_pvo.js): не знає ні про мапу, ні про 03_game.js — лише про прості дані.
   Клей із грою — tools/avia_glue.js (вшивається в замикання панелі пуску в 03_game.js).

   Що тут є:
   • АЕРОДРОМИ: кількість злітних смуг (rw). Здоров'я (frac 0..1) визначає робочі смуги k = ceil(rw·frac):
     пошкоджений аеродром працює повільніше (менше смуг), знищений (dead) закритий назавжди;
   • СМУГИ: одна смуга — одна операція (розбіг зльоту або пробіг посадки) одночасно. freeRunway / takeRunway
     резервують смугу на час операції, тож зліт і посадка стають черговими — пуск не одночасний;
   • СТОЯНКА: літаки кожного типу на кожному аеродромі (parked). Літак з'являється в небі лише зі стоянки;
     сума стоянок + у черзі + у підготовці + у повітрі = парк сторони (GAME.eco[sd].fleet) — це перевіряє reconcileDelta;
   • БАЗУВАННЯ І ВИЛІТ: літаки беруться зі стоянок базування (allocate; базування можна вказати або взяти найближчі),
     вилітають з аеродрому вильоту. Перегін між ними — ferry() (км / швидкість носія);
   • АВІАГРУПА: один пуск гравця = група (group): набір літаків з одного або кількох аеродромів, один маршрут і рубіж;
   • ПІДГОТОВКА: після посадки літак переходить у prep (час обслуговування), далі — знову на стоянці (prepDone);
   • ЗНИЩЕННЯ АЕРОДРОМУ: kill() віддає стоянку, підготовку й чергу — клей переправляє чергу на інший аеродром.
   Час усередині модуля — СЕКУНДИ симуляції (SIM.t), як у 03_game.js.
   Баланс — таблиця CFG; вимкнути — BV_AVIA.CFG.on = false (тоді працює старий пуск носіїв).
   ====================================================================== */
(function (root) {
  "use strict";

  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- баланс ---------- */
  const CFG = {
    on: true,
    rwy: { strat: 3, fighter: 2, ua_air: 2 },                 // злітних смуг на аеродромі за типом (s.rw — перевизначення)
    roll: { tu95: 9, tu22: 7, mig31: 6, su34: 6, su24: 5 },   // розбіг зльоту, с (смуга зайнята весь цей час)
    rollDef: 6,
    landK: 1.25,                                              // пробіг посадки — довший за розбіг (коефіцієнт)
    shotGap: 1.6,                                             // с між ракетами одного літака (по одній, не залпом)
    acGap: 3.5,                                               // с між літаками однієї групи в черзі пусків
    ferryK: 1,                                                // множник швидкості перегону (1 = швидкість носія)
    holdStep: 15,                                             // с очікування, якщо немає аеродрому для посадки
    holdMax: 90                                               // с очікування понад це — літак втрачено (паливо)
  };

  /* ---------- геометрія ---------- */
  function dkm(a, b){
    const r = D2R, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* ---------- стан ---------- */
  let LIST = [];                 // аеродроми: { i, id, n, side, home, c, rw, k, busy[], parked{}, prep[], q[], alive, dead, ref }
  let SEQ = 0;
  const GROUPS = new Map();      // id → група
  let GUEST = null;              // дзеркало стоянок у гостя: [{ i, p: {key: n}, al: 0|1 }]

  /* скидання: defs — [{ id, n, side, home, c, rw, ref }] */
  function reset(defs){
    LIST = defs.map((d, i) => {
      const rw = Math.max(1, d.rw | 0);
      return { i, id: d.id, n: d.n, side: d.side, home: d.home, c: d.c.slice(), rw, k: rw, busy: new Array(rw).fill(0),
        parked: {}, prep: [], q: [], alive: true, dead: false, ref: d.ref || null };
    });
    GROUPS.clear(); SEQ = 0; GUEST = null;
    return LIST;
  }
  const list = () => LIST;
  const af = i => (i != null && LIST[i]) || null;
  const alive = a => !!a && a.alive && !a.dead && a.k > 0;

  /* здоров'я аеродрому: frac 0..1 → робочі смуги; 0 — закрито назавжди */
  function setHealth(a, frac){
    if (!a || a.dead) return;
    if (!(frac > 0)){ a.k = 0; a.alive = false; a.dead = true; return; }
    a.k = clamp(Math.ceil(a.rw * Math.min(1, frac) - 1e-9), 1, a.rw);
    a.alive = true;
  }

  const roll = key => CFG.roll[key] || CFG.rollDef;

  /* ---------- смуги ---------- */
  function freeRunway(a, now){
    if (!alive(a)) return false;
    for (let i = 0; i < a.k; i++) if (a.busy[i] <= now) return true;
    return false;
  }
  /* зайняти найраніше вільну смугу на dur с; повертає момент початку (≥ now) або null, якщо аеродром закрито */
  function takeRunway(a, now, dur){
    if (!alive(a)) return null;
    let bi = 0;
    for (let i = 1; i < a.k; i++) if (a.busy[i] < a.busy[bi]) bi = i;
    const start = Math.max(now, a.busy[bi]);
    a.busy[bi] = start + dur;
    return start;
  }

  /* ---------- стоянка ---------- */
  function parkedOf(a, key){
    if (!a) return 0;
    if (GUEST){ const g = GUEST[a.i]; return g && g.al && g.p ? (g.p[key] | 0) : 0; }
    return a.parked[key] | 0;
  }
  function parkedSide(side, key){
    let n = 0;
    for (const a of LIST) if (a.side === side && alive(a)) n += parkedOf(a, key);
    return n;
  }
  function addParked(a, key, d){ if (a) a.parked[key] = Math.max(0, (a.parked[key] | 0) + d); }
  function parkedTot(a){ let n = 0; for (const k in a.parked) n += a.parked[k] | 0; return n; }

  /* перегін з аеродрому базування на аеродром вильоту, с (0, якщо на тому самому) */
  function ferry(from, to, spd){
    if (!from || !to || from === to) return 0;
    return dkm(from.c, to.c) / (Math.max(0.1, spd || 1) * CFG.ferryK);
  }

  /* розподіл n літаків: спершу з бажаного базування (pref), далі — найближчі до вильоту з літаками.
     strict — лише з pref. Повертає [{ af, n }] або null, якщо літаків не вистачає */
  function allocate(side, key, n, prefId, depId, strict){
    const dep = af(depId), pref = af(prefId);
    let left = n;
    const out = [];
    const take = a => {
      if (left <= 0 || !a || a.side !== side || !alive(a)) return;
      const m = Math.min(left, parkedOf(a, key));
      if (m > 0){ out.push({ af: a, n: m }); left -= m; }
    };
    if (pref) take(pref);
    if (!strict){
      const rest = LIST.filter(a => a.side === side && alive(a) && parkedOf(a, key) > 0 && a !== pref);
      if (dep) rest.sort((x, y) => dkm(x.c, dep.c) - dkm(y.c, dep.c));
      for (const a of rest) take(a);
    }
    return left > 0 ? null : out;
  }
  function reserve(alloc, key){ for (const x of alloc) addParked(x.af, key, -x.n); }

  /* скільки літаків типу key доступно для пуску: при strict — лише на обраному базуванні */
  function availFor(side, key, prefId, strict){
    if (strict){ const a = af(prefId); return a && a.side === side && alive(a) ? parkedOf(a, key) : 0; }
    return parkedSide(side, key);
  }

  /* ---------- групи ---------- */
  function group(o){
    const G = { id: ++SEQ, side: o.side, key: o.key, n: o.n, label: o.label || "", left: o.n, air: 0, landed: 0, lost: 0, seq: 0 };
    GROUPS.set(G.id, G);
    return G;
  }
  const grp = id => GROUPS.get(id) || null;
  const groups = () => Array.from(GROUPS.values());

  /* ---------- черги й підготовка ---------- */
  function enqueue(a, e){ a.q.push(e); }
  /* перший літак з черги, готовий до зльоту (readyAt ≤ now); знімає його з черги */
  function dequeueReady(a, now){
    for (let i = 0; i < a.q.length; i++) if (a.q[i].readyAt <= now) return a.q.splice(i, 1)[0];
    return null;
  }
  function prepAdd(a, key, until, grpId){ a.prep.push({ key, until, grp: grpId }); }
  /* завершена підготовка: повертає [{ af, key, grp }] і знімає їх з аеродромів */
  function prepDone(now){
    const out = [];
    for (const a of LIST) for (let i = a.prep.length - 1; i >= 0; i--){
      const p = a.prep[i];
      if (p.until <= now){ a.prep.splice(i, 1); out.push({ af: a, key: p.key, grp: p.grp }); }
    }
    return out;
  }

  /* підрахунок типу key у системі сторони: стоянки, підготовка, черга */
  function count(side, key){
    let p = 0, pr = 0, q = 0;
    for (const a of LIST){
      if (a.side !== side) continue;
      p += parkedOf(a, key);
      for (const x of a.prep) if (x.key === key) pr++;
      for (const x of a.q) if (x.key === key) q++;
    }
    return { parked: p, prep: pr, queue: q };
  }

  /* аеродром знищено: стоянка, підготовка й черга віддаються клею (він вирішує, що з ними станеться) */
  function kill(a){
    const parked = {};
    for (const k in a.parked) if (a.parked[k] > 0) parked[k] = a.parked[k];
    const out = { parked, prep: a.prep.slice(), queue: a.q.slice() };
    a.parked = {}; a.prep = []; a.q = [];
    a.k = 0; a.alive = false; a.dead = true;
    return out;
  }

  /* аеродром для посадки: бажаний, якщо живий, інакше найближчий живий того ж боку */
  function pickRtb(side, p, prefId){
    const pref = af(prefId);
    if (pref && pref.side === side && alive(pref)) return pref;
    return nearest(side, p, null);
  }
  function nearest(side, p, excl){
    let best = null, bd = Infinity;
    for (const a of LIST){
      if (a.side !== side || !alive(a) || a === excl) continue;
      const d = dkm(p, a.c);
      if (d < bd){ bd = d; best = a; }
    }
    return best;
  }

  /* звірка з парком сторони: різниця > 0 — нові літаки (виробництво), < 0 — зайві на стоянці */
  function reconcileDelta(total, cnt, air){
    return (total | 0) - (cnt.parked + cnt.prep + cnt.queue + (air | 0));
  }

  /* стан для гостя (мережа): стоянки й живість по аеродромах */
  function wire(){
    return LIST.map(a => ({ i: a.i, p: Object.assign({}, a.parked), al: alive(a) ? 1 : 0, k: a.k }));
  }
  function setGuest(arr){ GUEST = Array.isArray(arr) ? arr : null; }
  function guestMode(){ return !!GUEST; }

  const api = {
    CFG, reset, list, af, alive, setHealth, roll,
    freeRunway, takeRunway,
    parkedOf, parkedSide, parkedTot, addParked, ferry, allocate, reserve, availFor,
    group, grp, groups,
    enqueue, dequeueReady, prepAdd, prepDone, count, kill,
    pickRtb, nearest, reconcileDelta,
    wire, setGuest, guestMode, dkm
  };
  root.BV_AVIA = api;
})(typeof window !== "undefined" ? window : globalThis);
