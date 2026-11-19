/* етап 6 (2×2): знімок для конкретного гравця — лише те, що доступно його стороні */
function teamVis(sd, m){
  const own = OBJS.filter(o => o.side === sd).map(o => o.c), ad = (m.a || []).filter(a => a[16] === sd).map(a => [a[2], a[3]]), us = (m.u || []).map(u => [u[4], u[5]]);
  /* видно: біля своїх об'єктів / ППО (60 км), біля будь-якої одиниці зі знімка (18 км) і біля об'єктів на мапі (15 км: влучання по містах і рубежах — публічна інформація, їх показує табло) */
  return (lon, lat) => { const p = [lon, lat]; return own.some(c => hav(c, p) < 60) || ad.some(c => hav(c, p) < 60) || us.some(c => hav(c, p) < 18) || OBJS.some(o => hav(o.c, p) < 15); };
}
function redactG(g, sd){
  const foe = other(sd), o = Object.assign({}, g), fi = i => FACS[i] && FACS[i].side === foe;
  o.stock = Object.assign({}, g.stock, { [foe]: {} }); o.ads = Object.assign({}, g.ads, { [foe]: {} });
  if (g.eco){ const E = g.eco[foe]; o.eco = Object.assign({}, g.eco, { [foe]: E ? { on: E.on, money: 0, inc: 0, spent: 0, made: 0, auto: true, short: false, mun: null, fleet: null } : E }); }
  if (Array.isArray(g.facInv)) o.facInv = g.facInv.map((v, i) => fi(i) ? {} : v);
  if (Array.isArray(g.facSel)) o.facSel = g.facSel.map((v, i) => fi(i) ? null : v);
  if (Array.isArray(g.facJob)) o.facJob = g.facJob.map((v, i) => fi(i) ? null : v);
  if (Array.isArray(g.facParts)) o.facParts = g.facParts.map((v, i) => fi(i) ? 0 : v);
  if (g.facShort){ o.facShort = {}; for (const k in g.facShort) if (!fi(k)) o.facShort[k] = g.facShort[k]; }
  if (g.lgv){      // склади, запаси й замовлення логістичних вузлів супротивника — лише для його сторони
    const nd = i => LG[i] && LG[i].side === foe, z = a => Array.isArray(a) ? a.map((v, i) => nd(i) ? 0 : v) : a, set = {};
    for (const i in (g.lgv.set || {})) if (!nd(+i)) set[i] = g.lgv.set[i];
    o.lgv = Object.assign({}, g.lgv, { f: z(g.lgv.f), h: z(g.lgv.h), inc: z(g.lgv.inc), set, ord: (g.lgv.ord || []).filter(r => !nd(r[0])) });
  }
  return o;
}
const TSN = new WeakMap();      // один знімок на сторону → один результат для всієї команди
function teamSnapFor(E, m){
  if (E.role !== "player" || (E.side !== "ua" && E.side !== "ru")) return m;
  const sd = E.side, hit = TSN.get(m); if (hit && hit[sd]) return hit[sd];
  let ev = m.ev, g = m.g, ch = false;
  if (ev && ev.length){
    const vis = GAME.fog && isTeam() ? teamVis(sd, m) : null;
    const keep = ev.filter(e => e[0] === "stoast" ? e[1] === sd : !vis ? true : e[0] === "fx" ? vis(e[1], e[2]) : e[0] === "rd" ? (vis(e[1], e[2]) || vis(e[3], e[4])) : true);
    if (keep.length !== ev.length){ ev = keep; ch = true; }
  }
  if (isTeam() && g){ g = redactG(g, sd); ch = true; }
  const out = ch ? Object.assign({}, m, { ev, g }) : m;
  TSN.set(m, Object.assign(hit || {}, { [sd]: out })); return out;
}
