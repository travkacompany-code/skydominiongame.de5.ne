/* ---------- етап 7.52: «Хорнет» з ІІ — автономний пошук цілі в районі (ядро: 02b_hornet_ai.js) ----------
   Гравець вказує РАЙОН (точку); дрон долітає, далі сам: пошук спіраллю → контакт → супровід → розпізнавання → атака.
   Шукає лише ігрові об'єкти противника (OBJS, крім міст); влучання застосовує звичайний onStrike (радіус ураження, HP об'єкта).
   Умови: час доби (видимість), ППО (загроза при виборі цілі), придушення зв'язку — хук HOOKS.ewAt(side, p) → 0..1 (РЕБ-зон у грі поки немає). */
const HN_VAL = { strat: 1, launch: 0.9, air: 0.85, fighter: 0.85, fac: 0.75, port: 0.65, lport: 0.6, post: 0.55 };      // умовна цінність типу об'єкта
const HN_CON = { post: 0.35, launch: 0.3, fac: 0.15, air: 0.1, fighter: 0.1, port: 0.1 };                              // умовна «замаскованість»
function hnVis(){
  if (!GAME.on || GAME.mode === "free") return 1;
  const h = (((gameClock() % 1440) + 1440) % 1440) / 60;                          // година доби за ігровим годинником
  if (h >= 7 && h < 19) return 1;
  if (h >= 22 || h < 4) return 0.55;
  return h < 7 ? 0.55 + 0.45 * (h - 4) / 3 : 1 - 0.45 * (h - 19) / 3;           // сутінки: плавно
}
function hnThreat(foe, p){                                                          // 0..1: наскільки небезпечна точка через ППО противника
  let miss = 1;
  for (const a of ADS.units.values()){
    if ((a.side || "ua") !== foe) continue;
    const T = AD_TYPES[a.key]; if (!T || T.air || !T.r || !(a.mag > 0)) continue;
    const d = hav(a.pos, p); if (d < T.r) miss *= 1 - (0.1 + 0.45 * (1 - d / T.r));
  }
  return 1 - miss;
}
function hornetBegin(u, W){
  const AI = window.BV_HORNET_AI; if (!AI){ units.delete(u.id); return; }
  const c = u.pos.slice(), foe = other(u.sd), kx = 111.32 * Math.cos(c[1] * D2R), ky = 110.574, meta = u.meta || {};
  const pool = [], rr = AI.P.areaR + AI.P.detR + 3;
  for (const o of OBJS){                                                            // об'єкти противника поблизу району (статичні — відбираємо раз)
    if (o.side !== foe || o.t === "city") continue;
    const dx = (o.c[0] - c[0]) * kx, dy = (o.c[1] - c[1]) * ky;
    if (Math.hypot(dx, dy) <= rr) pool.push({ id: o.i, x: dx, y: dy, value: HN_VAL[o.t] != null ? HN_VAL[o.t] : 0.5, conceal: HN_CON[o.t] != null ? HN_CON[o.t] : 0.2, name: o.n });
  }
  const A = { c, foe, brain: AI.create({ id: u.id, x: 0, y: 0, hdg: u.hdg, fuelKm: Math.max(12, W.km - u.L), speedKms: u.spd, seed: u.id * 7919 + 13, roe: meta.roe }), h: 0.75 };
  A.env = {
    vis: hnVis(),
    ew: p => HOOKS.ewAt ? Math.max(0, Math.min(1, +HOOKS.ewAt(foe, offKm(c, p[0], p[1])) || 0)) : 0,
    threat: p => hnThreat(foe, offKm(c, p[0], p[1])),
    candidates: (p, r) => pool.filter(o => Math.abs(o.x - p[0]) <= r && Math.abs(o.y - p[1]) <= r && !objDead(o.id)),
    alive: id => !objDead(+id)
  };
  u.ai = A; u.s = u.L;
  u.meta = Object.assign({}, meta, { lo: 1, target: AI.label(A.brain) });
}
function hornetStep(u, sd){
  const A = u.ai, AI = window.BV_HORNET_AI, W = WEAPONS[u.key];
  A.env.vis = hnVis();
  const o = AI.step(A.brain, sd, A.env);
  u.pos = offKm(A.c, o.x, o.y); u.hdg = o.hdg; A.h = o.h;
  const lb = AI.label(A.brain); if (u.meta.target !== lb) u.meta = Object.assign({}, u.meta, { target: lb });
  if (o.res === "strike"){
    const s = o.strike, tg = s.target != null ? OBJS[+s.target] : null;
    u.pos = offKm(A.c, s.x, s.y); u.ai = null;
    impact(u.pos, "ground", W.ad); units.delete(u.id);
    HOOKS.onLeak && HOOKS.onLeak(u); HOOKS.onStrike && HOOKS.onStrike(u);
    toast(s.phantom ? "Хорнет: удар по хибному контакту — марно" : `Хорнет уразив ціль: ${tg ? tg.n : "об'єкт"} (промах ${s.miss.toFixed(1)} км)`);
  } else if (o.res === "ditch"){
    u.ai = null; u.meta = Object.assign({}, u.meta, { lo: 0, target: "Ціль не знайдено — запас ходу вичерпано" });
    u.fall = { t: 0, dur: 3, v0: Math.max(1, u.spd * 0.5), dir: u.hdg, w: 220 };
    toast("Хорнет: ціль не знайдено — запас ходу вичерпано");
  }
}
/* налагодження й керування з консолі: BV_HORNET.list(), .explain(id), .roe(id, "confirm"|"auto"), .confirm(id) */
window.BV_HORNET = {
  list: () => Array.from(units.values()).filter(u => u.ai).map(u => ({ id: u.id, state: u.ai.brain.st, fuel: Math.round(u.ai.brain.fuel), label: u.meta.target })),
  explain: id => { const u = units.get(id); return u && u.ai ? window.BV_HORNET_AI.explain(u.ai.brain) : null; },
  roe: (id, m) => { const u = units.get(id); if (u && u.ai) window.BV_HORNET_AI.setRoe(u.ai.brain, m); return !!(u && u.ai); },
  confirm: id => { const u = units.get(id); return !!(u && u.ai && window.BV_HORNET_AI.confirm(u.ai.brain)); }
};
