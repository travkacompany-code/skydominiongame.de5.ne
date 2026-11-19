/* pvo:v1 */
/* ---------- етап 7.67: ПОВНОЦІННА ППО («BANGVECTOR 2 · етап 3», ядро: 02h_pvo.js) ----------
   Те, чого в грі не було (усе, що вже працювало — РЛС, туман війни, режими «Автоматично / Пріоритет / Вручну», перезарядка, запас ракет — лишається як є):
   • ТЕХНІКА: наземна ППО має прочність (u.hp). Удар ракети/дрона поруч і уламки збитих цілей її пошкоджують; нижче 65 % — нижчий темп вогню, радіус і шанс ураження,
     нижче 30 % — не веде вогонь; без нових влучань 45 с — самоусунення. Знищена установка зникає (запас ракет разом із нею). Кораблі й авіація ППО — як раніше;
   • КАНАЛИ: установка веде одночасно лише стільки цілей, скільки дозволяють гармата/магазин/радіус (гармата 1, ближня 2, середня 4, дальня 8; ПЗРК і дрони — 1);
   • КП: кожна установка прив'язана до пункту ППО своєї сторони (AD_POSTS). Один КП веде до 16 цілей усіх підлеглих установок разом. Знищений КП (об'єкт «Пункт ППО»)
     → установки автономні: бачать лише цілі в 10 км, через 20 с переприв'язуються до найближчого живого КП;
   • ПЕРЕХОПЛЕННЯ: ракета не пускається, якщо перехват фізично неможливий (ціль швидша й іде геть, зустріч за радіусом, не вистачить ходу ракети, ціль влучить раніше);
     по цілі, що вже «закрита» ракетами в польоті (узгоджена ймовірність ураження ≥ порога класу), нові ракети не йдуть; цілі розподіляються між установками за відстанню
     й уже призначеними ракетами; порядок опитування установок обертається, тож «перша в списку» не забирає все;
   • ОБЛОМКИ: збита ціль, що падає (або розірвана в повітрі), пошкоджує об'єкти противника (рубіж, аеродром, порт, пункт ППО, завод…), РЛС і установки ППО поруч;
   • у «Вільному» режимі й поза боєм пошкодження не діють (як і раніше об'єкти там не знищуються); розрахунок цілей/перехоплення працює завжди.
   Вимкнути: #debug → BV_EVAL("PVO.on=false"). Баланс — BV_PVO.CFG. */
const PVO = { on: true, ctx: null, rot: 0, warn: new Map(), deb: { ua: 0, ru: 0 }, lost: { ua: 0, ru: 0 }, kills: { ua: 0, ru: 0 } };
const pvoCore = () => window.BV_PVO;
const pvoBattle = () => !!GAME.on && !GAME.puppet && GAME.mode !== "free" && GAME.phase === "run";
const pvoGround = (u, T) => !!T && !T.air && !T.ship;
const pvoHp = u => (u.hp == null ? 1 : u.hp);
const pvoCond = u => (PVO.on && pvoCore() ? pvoCore().cond(pvoHp(u)) : { down: false, rate: 1, pk: 1, range: 1, label: "справна" });
/* ефективні параметри наземної установки з урахуванням стану */
const pvoR = (u, T) => (PVO.on && pvoGround(u, T) ? T.r * pvoCond(u).range : T.r);
const pvoPk = u => (PVO.on ? pvoCond(u).pk : 1);
const pvoRate = u => (PVO.on ? Math.max(0.2, pvoCond(u).rate) : 1);
const pvoPct = v => Math.round(v * 100) + " %";
const pvoWhyTxt = why => ({ "no-missile": "немає ракети", outrun: "ціль швидша й іде геть", "out-of-range": "зустріч за межею радіуса", "out-of-fuel": "ракета не долетить", "too-late": "ціль влучить раніше" })[why] || "";
function pvoReset(){
  PVO.ctx = null; PVO.rot = 0; PVO.warn.clear(); PVO.deb = { ua: 0, ru: 0 }; PVO.lost = { ua: 0, ru: 0 }; PVO.kills = { ua: 0, ru: 0 };
  for (const u of ADS.units.values()){ u.hp = 1; u.hitT = null; u.cp = null; u.cpLost = null; u._auto = false; u.cpA = 0; }
}
/* ---------- КП: пункти ППО сторони як вузли керування ---------- */
function pvoPosts(){
  const out = { ua: [], ru: [] };
  AD_POSTS.forEach((p, i) => out[p.side].push({ id: i, pos: p.c, alive: !objDead(p._oi), n: p.n }));
  return out;
}
function pvoHomePost(u, posts){
  const side = u.side || "ua", i = AD_POSTS.findIndex(p => p.side === side && p.n === u.post);
  if (i >= 0) return i;
  let best = -1, bd = Infinity;
  for (const p of posts[side]){ const d = hav(u.pos, p.pos); if (d < bd){ bd = d; best = p.id; } }
  return best;
}
/* ---------- контекст кроку: ракети в польоті, зайняті канали установок і КП ---------- */
function pvoNoteChan(x, a, tid){
  if (!a || tid == null) return;
  let s = x.unit.get(a.id); if (!s) x.unit.set(a.id, s = new Set()); s.add(tid);
  if (a.cp != null && !a._auto){ let c = x.cp.get(a.cp); if (!c) x.cp.set(a.cp, c = new Set()); c.add(tid); }
}
function pvoBegin(){
  if (!PVO.on || !pvoCore() || GAME.puppet){ PVO.ctx = null; return; }
  const x = PVO.ctx = { pk: new Map(), unit: new Map(), cp: new Map(), posts: pvoPosts() };
  for (const s of ADS.shots){
    if (s.tgt == null) continue;
    let l = x.pk.get(s.tgt); if (!l) x.pk.set(s.tgt, l = []); l.push((s.p || 0) / 100);
    const a = ADS.units.get(s.from); if (a && pvoGround(a, AD_TYPES[a.key])) pvoNoteChan(x, a, s.tgt);
  }
  for (const a of ADS.units.values()){      // гармата веде одну ціль, поки триває черга
    const T = AD_TYPES[a.key]; if (T && T.gun && pvoGround(a, T) && a.burstT && a.burst > 0 && units.has(a.burstT)) pvoNoteChan(x, a, a.burstT);
  }
}
function pvoNoteLast(u, t){      // щойно пущена ракета: бере канал і додає ймовірність до «закриття» цілі
  const x = PVO.ctx; if (!x) return;
  const s = ADS.shots[ADS.shots.length - 1]; if (!s || s.from !== u.id || s.tgt !== t.id) return;
  let l = x.pk.get(t.id); if (!l) x.pk.set(t.id, l = []); l.push((s.p || 0) / 100);
  if (pvoGround(u, AD_TYPES[u.key])) pvoNoteChan(x, u, t.id);
}
function pvoCovered(t){
  const x = PVO.ctx, l = x && x.pk.get(t.id), C = pvoCore();
  return !!l && C.covered(adCls(t), C.committed(l));
}
/* порядок опитування установок обертається, щоб «перша в списку» не забирала всі цілі */
function pvoOrder(){
  const a = Array.from(ADS.units.values()); if (!PVO.on || a.length < 2) return a;
  const k = (PVO.rot++) % a.length; return k ? a.slice(k).concat(a.slice(0, k)) : a;
}
/* стан наземної установки на кроці: самоусунення, зв'язок із КП. Повертає true, якщо вона виведена з ладу */
function pvoUnit(u, T, dt){
  if (!PVO.on || !PVO.ctx){ u._dn = false; u._auto = false; return false; }
  const C = pvoCore(), now = SIM.t, sd = u.side || "ua", posts = PVO.ctx.posts[sd];
  if (u.hp == null) u.hp = 1;
  if (u.hp < 1) u.hp = C.repairStep(u.hp, u.hitT, now, dt);      // самоусунення — лише якщо давно не було влучань
  if (u.cp == null) u.cp = pvoHomePost(u, PVO.ctx.posts);
  const L = C.linkStep(u, posts, now);
  u._auto = !!L.autonomous; u.cpA = L.autonomous ? 1 : 0; u.cpLeft = L.left;
  if (L.rehomed) HOOKS.adHint && HOOKS.adHint(sd, `${T.n}: переприв'язано до КП «${(AD_POSTS[u.cp] || {}).n || "?"}»`);
  u._dn = C.cond(u.hp).down;
  return u._dn;
}
/* автономна установка (КП знищено) бачить лише цілі зблизька */
function pvoSkip(u, T, t){
  if (!PVO.on || !u._auto || !pvoGround(u, T)) return false;
  return hav(u.pos, t.pos) > pvoCore().CFG.ownKm;
}
/* вибір цілі для ракетної установки: -1 — не можна; ≥ 0 — узгоджена ймовірність уже призначених ракет (для оцінки) */
function pvoJudge(u, T, t, d, rr, manual){
  const x = PVO.ctx; if (!x) return 0;
  const C = pvoCore(), cls = adCls(t), ground = pvoGround(u, T), l = x.pk.get(t.id), comm = l ? C.committed(l) : 0;
  const kx = 111.32 * Math.cos(u.pos[1] * D2R) || 1e-6, dx = (t.pos[0] - u.pos[0]) * kx, dy = (t.pos[1] - u.pos[1]) * 110.574;
  if (!manual && u.atk !== t.id && C.covered(cls, comm)) return -1;      // уже, найімовірніше, збита — не пускати ще
  if (ground){
    let why = null;
    const set = x.unit.get(u.id), cs = !u._auto ? x.cp.get(u.cp) : null;
    if (set && !C.chFree(set, t.id, C.channels(T))) why = "busy";
    else if (cs && !C.cpAllows(cs, t.id)) why = "cp";
    else if (!T.drone){
      const V = t.wait > 0 ? [0, 0] : tgtVel(t), rem = t.loiter || t.ai || t.sea || t.L == null ? Infinity : t.L - t.s;
      const r = C.intercept([dx, dy], V, AD_SPD[T.spd], rr * C.CFG.reachK, T.r * 1.6 + 15, rem);
      if (!r.ok) why = r.why;
    }
    if (manual) u.pvoWhy = why;
    if (why) return -1;
  }
  return comm;
}
/* для списку цілей у ручному режимі: чому перехват зараз неможливий (текст) або "" */
function pvoCanTxt(u, T, t){
  if (!PVO.on || !pvoGround(u, T) || T.gun || T.drone || !pvoCore()) return "";
  const C = pvoCore(), up = u.pos, tp = t.pos, kx = 111.32 * Math.cos(up[1] * D2R) || 1e-6;
  const V = t.wait > 0 ? [0, 0] : tgtVel(t), rem = t.loiter || t.ai || t.sea || t.L == null ? Infinity : t.L - t.s;
  const r = C.intercept([(tp[0] - up[0]) * kx, (tp[1] - up[1]) * 110.574], V, AD_SPD[T.spd], pvoR(u, T) * C.CFG.reachK, T.r * 1.6 + 15, rem);
  return r.ok ? "" : "перехват неможливий: " + pvoWhyTxt(r.why);
}
/* ---------- шкода й знищення ---------- */
function pvoOwnerToast(side, msg){ sideToast(side, msg); }
function pvoApply(hits, by, cause){
  const C = pvoCore();
  for (const h of hits){
    const a = ADS.units.get(h.id); if (!a) continue;
    const T = AD_TYPES[a.key], old = C.cond(pvoHp(a)), own = a.side || "ua";
    a.hp = h.hp; a.hitT = SIM.t; ADS.dirty = true;
    if (h.killed){
      ADS.units.delete(a.id); PVO.lost[own]++; if (by && by !== own) PVO.kills[by]++;
      gameToast(`${by ? SIDE_N[by] + ": знищено" : "Знищено"} ППО «${T.n}»${cause ? " (" + cause + ")" : ""}`);
    } else {
      const nw = C.cond(a.hp);
      if (nw.down && !old.down) pvoOwnerToast(own, `ППО «${T.n}» виведена з ладу (${pvoPct(a.hp)})`);
      else if (nw.label !== old.label) pvoOwnerToast(own, `ППО «${T.n}» пошкоджена: ${pvoPct(a.hp)}`);
    }
  }
}
function pvoList(side){      // наземні установки сторони → список для blast()
  const C = pvoCore(), out = [];
  for (const a of ADS.units.values()){ const T = AD_TYPES[a.key]; if ((a.side || "ua") === side && pvoGround(a, T)) out.push({ id: a.id, pos: a.pos, hp: pvoHp(a), pts: C.hpPoints(T) }); }
  return out;
}
/* вибух ударної зброї (дрон/ракета досягли цілі): шкода по ППО противника поруч */
function pvoStrike(u, sd, dmg){
  if (!PVO.on || !pvoCore() || !pvoBattle() || !(dmg > 0)) return;
  pvoApply(pvoCore().blast(pvoList(other(sd)), u.pos, dmg), sd, "удар");
}
/* обломки збитої цілі: air — розірвана в повітрі (уламки ширше й слабше), інакше падає ціла */
function pvoDebris(t, air){
  if (!PVO.on || !pvoCore() || !pvoBattle() || !t || !t.pos) return;
  const W = WEAPONS[t.key]; if (!W || !t.sd) return;
  const C = pvoCore(), D = C.debris(W.ad, wDmg(t.key), air); if (!(D.dmg > 0)) return;
  const att = t.sd, foe = other(att), p = t.pos, far = D.r * 2.2, k0 = C.CFG.farK;
  let hit = false;
  /* 1) установки ППО противника */
  const hs = C.blast(pvoList(foe), p, D.dmg, { hitFull: D.r, hitFar: far, farK: k0 });
  if (hs.length){ hit = true; pvoApply(hs, att, "уламки"); }
  /* 2) об'єкти противника: рубіж, аеродром, порт, пункт ППО, завод… (міста не мають прочності). Об'єкт — не точка: відлік від краю території (≈ 35 % радіуса ураження) */
  if (GAME.obj && GAME.obj.length === OBJS.length){
    for (const o of OBJS){
      if (o.side !== foe || o.t === "city" || !(GAME.obj[o.i] > 0)) continue;
      const ext = (HIT_R[o.t] || 3) * 0.35, de = Math.max(0, hav(p, o.c) - ext); if (de > far) continue;
      const k = de <= D.r ? 1 : 1 - (1 - k0) * (de - D.r) / (far - D.r), hp = GAME.obj[o.i], dm = Math.min(hp, D.dmg * k);
      if (!(dm > 0)) continue;
      GAME.obj[o.i] = hp - dm; hit = true; GAME.st[att].debrisHits = (GAME.st[att].debrisHits | 0) + 1;
      if (GAME.obj[o.i] <= 0.001){
        GAME.obj[o.i] = 0; GAME.st[att].destroyed++;
        if (o.t === "fac") facLost(o.fi, att);
        else if (o.li != null) logiLost(o.li, att);
        else if (o.inf != null) infLost(o.inf, att);
        else gameToast(`${SIDE_N[att]}: знищено об'єкт від уламків — ${o.n}`);
      } else {
        const w = PVO.warn.get(o.i);
        if (w == null || SIM.t - w > 25){ PVO.warn.set(o.i, SIM.t); sideToast(foe, `Уламки збитої цілі пошкодили «${o.n}» (міцність ${Math.round(GAME.obj[o.i] / o.hp * 100)} %)`); }
      }
      objDirty();
    }
  }
  /* 3) РЛС противника */
  if (RAD && RAD.sim && RAD.sim.stations.length){
    const BV = radBV();
    for (const st of RAD.sim.stations.slice()){
      const m = RAD.meta.get(st.id); if (!m || m.side !== foe) continue;
      const d = hav(p, m.c); if (d > far) continue;
      const T = BV.BYID[st.type], k = d <= D.r ? 1 : 1 - (1 - k0) * (d - D.r) / (far - D.r);
      BV.damage(RAD.sim, st.id, D.dmg * k / (RAD_HP[T.radarClass] || 2)); hit = true; RAD.dirty = true;
      if (st.destroyed) gameToast(`${SIDE_N[att]}: РЛС «${T.name}» знищено уламками`);
    }
  }
  if (hit) PVO.deb[foe]++;
}
/* ---------- інтерфейс ---------- */
function pvoTrkCount(u){ const s = new Set(); for (const x of ADS.shots) if (x.from === u.id && x.tgt != null) s.add(x.tgt); return s.size; }
function pvoStateTxt(u, T){
  if (!PVO.on || !pvoGround(u, T)) return "";
  const c = pvoCond(u); if (c.down) return c.label;
  return "";
}
function pvoRows(u, T){
  if (!PVO.on || !pvoGround(u, T) || !pvoCore()) return [];
  const C = pvoCore(), c = pvoCond(u), rows = [["Прочність", `${pvoPct(pvoHp(u))} · ${c.label}`]];
  if (c.down) rows.push(["Стан", "вогонь неможливий, поки не усунуть пошкодження"]);
  else if (c.rate < 1 || c.range < 1) rows.push(["Погіршення", `темп ×${c.rate.toFixed(2).replace(".", ",")} · радіус ×${c.range.toFixed(2).replace(".", ",")} · шанс ×${c.pk.toFixed(2).replace(".", ",")}`]);
  rows.push(["Канали цілей", `${pvoTrkCount(u)} / ${C.channels(T)}`]);
  const p = AD_POSTS[u.cp];
  rows.push(["Командний пункт", p ? (u.cpA ? (u.cpLeft != null ? `«${p.n}» втрачено · автономна, переприв'язка ≈ ${Math.ceil(u.cpLeft)} с` : `«${p.n}» втрачено · автономна (цілі до ${C.CFG.ownKm} км)`) : `«${p.n}» · зв'язок є`) : "—"]);
  if (u.pvoWhy && u.mode === "manual"){ const w = pvoWhyTxt(u.pvoWhy); if (w) rows.push(["Ручна ціль", "перехват неможливий: " + w]); else if (u.pvoWhy === "busy") rows.push(["Ручна ціль", "усі канали зайняті"]); else if (u.pvoWhy === "cp") rows.push(["Ручна ціль", "КП веде максимум цілей"]); }
  return rows;
}
function pvoStatsTxt(side){
  const own = side === "ru" ? "ru" : "ua", foe = other(own);
  const parts = [];
  if (PVO.lost[own]) parts.push(`втрачено установок ППО: <b>${PVO.lost[own]}</b>`);
  if (PVO.kills[own]) parts.push(`знищено ППО противника: <b>${PVO.kills[own]}</b>`);
  if (PVO.deb[foe]) parts.push(`уламки зачепили об'єкти противника: <b>${PVO.deb[foe]}</b>`);
  if (PVO.deb[own]) parts.push(`уламки зачепили ваші об'єкти: <b>${PVO.deb[own]}</b>`);
  return parts.length ? "<br>ППО · " + parts.join(" · ") : "";
}
function pvoPostLine(p){
  if (!PVO.on || !p || !pvoCore()) return "";
  const i = AD_POSTS.indexOf(p), alive = !objDead(p._oi), C = pvoCore();
  let n = 0, a = 0, ids = new Set();
  for (const u of ADS.units.values()){ if (u.cp === i && pvoGround(u, AD_TYPES[u.key])){ n++; if (u._auto) a++; } }
  for (const s of ADS.shots){ const u = ADS.units.get(s.from); if (u && u.cp === i && !u._auto && s.tgt != null) ids.add(s.tgt); }
  return `<div class="note">КП: ${alive ? "працює" : "<b>знищений</b>"} · підлеглих установок ${n}${a ? ` (автономних ${a})` : ""} · веде цілей ${ids.size} / ${C.CFG.cpMax}</div>`;
}
window.BV_PVO_API = { PVO, begin: pvoBegin, unit: pvoUnit, judge: pvoJudge, skip: pvoSkip, strike: pvoStrike, debris: pvoDebris, rows: pvoRows, reset: pvoReset, order: pvoOrder, note: pvoNoteLast, covered: pvoCovered, posts: pvoPosts, cond: pvoCond, canTxt: pvoCanTxt, apply: pvoApply };
