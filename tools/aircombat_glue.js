/* aircombat:v1 */
/* ======================================================================
   етап 7.70 — ПОВІТРЯНИЙ БІЙ (клей між 02j_aircombat.js і грою; опис — AIRCOMBAT.md)
   • реєстр літаків: винищувачі/вертольоти ППО (ADS.units) і авіація-носії (units, kind «c») — висота, пастки, пошкодження;
   • ППО проти літаків автоматично: ЗРК за картиною РЛС (мережа/туман) або власним радаром, захоплення → залп 1–2 ракет,
     канали, висотне вікно, мінімальна дальність; зенітні гармати — по низьких цілях;
   • винищувачі: пошук (бортова РЛС, ІЧ-пошук, ГЦН за картиною), переслідування, захоплення, пуск ракет за їхнім вікном (airPickW),
     гармата в ближньому бою; під загрозою — маневр, пастки, повернення до бою;
   • носії: самооборона (Су-34, МіГ-31К, Су-24) і ухилення зсувом з траси; низьковисотний прорив при опроміненні;
   • ракети — повноцінні ADS.shots (малювання, мережа, туман — як у решти), крок — BV_AIRC.stepMissile;
   • тепла пастка / диполі — частинки (HOOKS.fx kinds «flare», «chaff»), у гостя — через netEv.
   Вимкнути: BV_ACG.on = false (або BV_AIRC.CFG.on = false). Гість (puppet) нічого не рахує.
   ====================================================================== */
const BAC = window.BV_AIRC;
const AC = { on: true, ms: [], st: new Map(), ents: new Map(), clk: 0, sl: new Map(), fl: new Map(), specs: {}, tgt: new Map(), acc: 0, scan: 0,
  stats: { ua: { kills: 0, lost: 0, shots: 0, decoyed: 0 }, ru: { kills: 0, lost: 0, shots: 0, decoyed: 0 } }, hintT: { ua: -9, ru: -9 },
  W: { t: 0, flares: [], chaff: [], ent: null } };
AC.W.ent = ref => { const e = AC.ents.get(ref); return e && e.alive ? e : null; };
window.BV_ACG = AC;

/* ЦІЛЕВКАЗАННЯ ВІД РЛС/ДРЛО (етап 7.71): ракета РЛ-типу (SARH/ARH) не залежить від бортового радара пускача —
   якщо мережа РЛС або літак ДРЛО веде ворожий літак (acPic), винищувач пускає ракету на дальність САМОЇ РАКЕТИ (rng × k),
   а на маршові ракету наводить мережа (src.link), доки ARH не ввімкне власну ГСН. Вимкнути: BV_ACG.cue.on = false. */
AC.cue = { on: true, k: 0.9, offK: 1.35, jamK: 0.8 };
const acClamp = (v, a, b) => v < a ? a : v > b ? b : v;
const acSd = u => u.side || "ua";
function acSt(ref, key){ let s = AC.st.get(ref); if (!s){ s = BAC.newState(key); s.gun = (BAC.perfOf(key).gun ? 120 : 0); AC.st.set(ref, s); } return s; }
function acHint(side, msg, gap){
  if (AC.clk - AC.hintT[side] < (gap == null ? 2.5 : gap)) return;
  AC.hintT[side] = AC.clk; HOOKS.adHint && HOOKS.adHint(side, msg);
}
const acJam = (sd, p) => EW.st.length ? 0.4 * ewE(other(sd), "RADAR", p) : 0;

/* ---------- реєстр літаків ---------- */
function acBuild(){
  const M = AC.ents;
  M.clear();
  for (const a of ADS.units.values()){
    const T = AD_TYPES[a.key]; if (!T || !T.air || a.state === "base" || a.state === "reload" || !a.pos) continue;
    const ref = "f" + a.id, st = acSt(ref, a.key), q = radXY(a.pos);
    M.set(ref, { ref, kind: "f", u: a, T, side: acSd(a), key: a.key, perf: BAC.perfOf(a.key), st, x: q.x, y: q.y, h: st.h, hdg: a.hdg || 0,
      v: a.sp > 0 ? a.sp : AIR.cruise * airK(T), alive: true, heli: !!T.heli, aew: !!T.aew });
  }
  for (const u of units.values()){
    if (u.kind !== "c" || u.fall || u.wait > 0 || !u.pos) continue;
    const C = CARRIERS[u.key]; if (!C || C.kind !== "air") continue;
    const ref = "c" + u.id, st = acSt(ref, u.key), q = radXY(u.pos);
    if (st.def == null){ const pf = BAC.perfOf(u.key); st.def = pf.def ? pf.def[1] : 0; st.defId = pf.def ? pf.def[0] : null; }
    M.set(ref, { ref, kind: "c", u, side: u.sd || "ru", key: u.key, perf: BAC.perfOf(u.key), st, x: q.x, y: q.y, h: st.h, hdg: u.hdg || 0, v: u.spd || 10, alive: true });
  }
  if (AC.st.size > M.size + 60){
    const live = new Set(); for (const m of AC.ms) live.add(m.tgt);
    for (const k of Array.from(AC.st.keys())) if (!M.has(k) && !live.has(k)) AC.st.delete(k);
  }
  for (const k of Array.from(AC.fl.keys())) if (!M.has(k)) AC.fl.delete(k);
  for (const k of Array.from(AC.tgt.keys())) if (!M.has(k) || !M.has(AC.tgt.get(k))) AC.tgt.delete(k);
  for (const k of Array.from(AC.sl.keys())) if (!ADS.units.has(k)) AC.sl.delete(k);
  if (AC.ms.length){      // ракети, яких уже немає в ADS.shots (власника продано / гру скинуто), — не ведемо далі
    const set = new Set(ADS.shots);
    for (let i = AC.ms.length - 1; i >= 0; i--) if (!set.has(AC.ms[i])) AC.ms.splice(i, 1);
  }
}
window.BV_ACH = ref => { const s = AC.st.get(ref); return s ? s.h : 0; };
HOOKS.acH = ref => { const s = AC.st.get(ref); return s ? s.h : 0; };

/* висота: профіль польоту + швидкість набору/зниження за типом */
function acAltitude(e, sd){
  const pf = e.perf, st = e.st, K = BAC.CFG.KS, dmg = st.hp < BAC.CFG.dmgBelow;
  if (!(st.act && AC.clk - st.actT < 0.4 && !st.act.wait)){
    let hT = pf.h;
    if (e.kind === "c" && pf.rcs > 1 && AC.clk - (st.painted || -99) < 12) hT = Math.max(pf.low * 2, 600);      // опромінений носій іде на малу висоту
    if (e.kind === "f" && st.hPt != null && AC.clk - st.hPt < 0.5) hT = st.hP;                                    // переслідування: висота цілі
    st.hT = hT;
  }
  const cl = pf.cl * K * (dmg ? 0.6 : 1), dive = pf.cl * K * BAC.CFG.diveK;
  st.h = acClamp(st.h + acClamp(st.hT - st.h, -dive * sd, cl * sd), 0, pf.ceil);
  e.h = st.h;
}

/* ---------- виявлення ---------- */
const acNeedPic = sd => fogLive() || !!(RAD.need && RAD.sim && RAD.net[sd] > 0);
function acPic(sd, e){
  const sim = RAD.sim; if (!sim) return null;
  /* контакти: основна мережа веде літак за «a<id>»/id, станції ДРЛО (етап 8) — за «ad<id>»/«c<id>» */
  const ks = e.kind === "f" ? ["a" + e.u.id, "ad" + e.u.id] : [e.u.id, "c" + e.u.id];
  let c = null; for (const k of ks){ const x = RAD.lock.get(sd + ":" + k); if (x && (!c || x.conf > c.conf)) c = x; }
  if (!c) return null;
  const age = sim.t - c.lastUpdatedAt, rank = c.state === "identified" ? 4 : c.state === "tracking" ? 3 : 2;
  return rank >= 3 && c.conf >= 0.45 && age <= Math.max(8, c.ttl * 0.6) ? c : null;      // для літаків поріг впевненості нижчий, ніж для ракет (великі цілі, далекі РЛС/ДРЛО)
}
/* якість треку цілі e для спостерігача (side sd, точка obs, радар R/pd) з урахуванням мережі РЛС */
function acSees(sd, e, obs, R, pd){
  const own = R > 0 ? BAC.trackQ(R, obs, e, { pd, jam: acJam(sd, e.u.pos) }) : 0, pic = acPic(sd, e);
  const d = BAC.slant(obs, obs.h || 0, e, e.h);
  if (acNeedPic(sd)) return pic || (d < 10 && own >= BAC.CFG.trackMin) ? Math.max(own, 0.6) : 0;
  return Math.max(own, pic ? 0.6 : 0);
}

/* ---------- створення ракети (спільне для ЗРК, винищувачів і носіїв) ---------- */
function acLaunch(m, key, aamId){
  m.key = key; m.sd = m.side; m.pos = radLL(m.x, m.y); m.vmax = m.spec.v; m.p = 1; m.trail = [[m.pos[0], m.pos[1], performance.now()]]; m.tl = 0; m.seed = Math.random(); m.aam = aamId || null;
  AC.ms.push(m); ADS.shots.push(m); AC.stats[m.side].shots++; ADS.dirty = true;
}
function acSamSpec(key, T){
  let s = AC.specs[key]; if (s) return s;
  const S = BAC.SAM[key], v = AD_SPD[T.spd] || 40;
  s = AC.specs[key] = Object.assign({ n: T.n, burn: 0.55, tl: T.r * 1.7 / v + 7 }, S, { v });
  return s;
}
function acInbound(ref, from){ let n = 0; for (const m of AC.ms) if (m.tgt === ref && !m.dead && (from == null || m.from === from)) n++; return n; }
function acInboundSide(ref, side){ let n = 0; for (const m of AC.ms) if (m.tgt === ref && !m.dead && m.side === side) n++; return n; }

/* ---------- ЗРК й зенітні гармати проти літаків ---------- */
function acSams(){
  const ents = Array.from(AC.ents.values()); if (!ents.length) return;
  for (const u of ADS.units.values()){
    const T = AD_TYPES[u.key]; if (!T || T.air || T.drone) continue;
    const S = BAC.SAM[u.key], F = BAC.FLAK[u.key];
    if (!S && !F) continue;
    if (u.state === "move" || u.state === "reload" || u.mode === "manual" || !u.pos) continue;
    if (u.mag <= 0) continue;
    const side = acSd(u), q = radXY(u.pos);
    let best = null, bs = Infinity;
    for (const e of ents){
      if (e.side === side || !e.alive || e.st.hp <= 0) continue;
      if (S){
        const env = BAC.samEnv(u.key, { x: q.x, y: q.y, h: 0, R: T.r }, e); if (!env.ok) continue;
        const R = T.r * (S.pd ? 1.3 : 1.15), qual = acSees(side, e, { x: q.x, y: q.y, h: 20 }, R, S.pd);
        if (qual < BAC.CFG.trackMin) continue;
        const inb = acInboundSide(e.ref, side), cap = e.perf.hp >= 1.5 ? 3 : 2;
        if (inb >= cap) continue;
        if (acInbound(e.ref, u.id) >= BAC.samSalvo(u.key, u, e, 2)) continue;
        const sc = env.d - qual * 5 - (e.kind === "c" ? 8 : 0);
        if (sc < bs){ bs = sc; best = { e, env, qual }; }
      } else {
        const d = Math.hypot(e.x - q.x, e.y - q.y);
        if (d > F.r || e.h > F.hmax) continue;
        if (d < bs){ bs = d; best = { e, d }; }
      }
    }
    if (!best) { AC.sl.delete(u.id); continue; }
    const e = best.e;
    if (F && !S){ acFlak(u, T, F, e, best.d); continue; }
    const g = S.g, L = AC.sl.get(u.id);
    if (g !== "ir" && g !== "sal") e.st.painted = AC.clk;
    if (!L || L.ref !== e.ref || AC.clk - L.seen > 0.6){ AC.sl.set(u.id, { ref: e.ref, t0: AC.clk, seen: AC.clk }); continue; }
    L.seen = AC.clk;
    if (AC.clk - L.t0 < (BAC.CFG.lockT[g] || 1.5)) continue;
    if (u.cool > 0) continue;
    let live = 0; for (const m of AC.ms) if (m.from === u.id && !m.dead) live++;
    if (live >= S.ch) continue;
    acFireSam(u, T, S, e, q);
  }
}
function acFireSam(u, T, S, e, q){
  const spec = acSamSpec(u.key, T), side = acSd(u), v = spec.v;
  const dx = e.x - q.x, dy = e.y - q.y, ttg = Math.hypot(dx, dy) / (v * 0.7), lx = e.x + Math.sin(e.hdg * D2R) * e.v * ttg, ly = e.y + Math.cos(e.hdg * D2R) * e.v * ttg;
  const hdg = (Math.atan2(lx - q.x, ly - q.y) / D2R + 360) % 360, pos = u.pos;
  const src = () => {
    const a = ADS.units.get(u.id);
    return { alive: !!a && a === u && a.state !== "move", x: q.x, y: q.y, h: 20, R: T.r * (S.pd ? 1.3 : 1.15), pd: S.pd, jam: acJam(side, pos), hdg: 0 };
  };
  const m = BAC.makeMissile(spec, { from: u.id, side, tgt: e.ref, x: q.x, y: q.y, h: 15, hdg, v0: v * 0.3, max: T.r * 1.6 + 15, tx: e.x, ty: e.y, th: e.h,
    tvx: Math.sin(e.hdg * D2R) * e.v, tvy: Math.cos(e.hdg * D2R) * e.v, src, t0: AC.clk });
  m.gamma = 50;
  acLaunch(m, u.key, null);
  u.mag--; u.fired++; ADS.fired++; u.cool = Math.max(u.cool, 0.9);
  if (fogFxOk(u)) fxLaunch(pos, hdg);
  if (u.mag <= 0) adStartReload(u);
}
function acFlak(u, T, F, e, d){
  if (u.cool > 0 || AC.clk < (u.acfT || 0)) return;
  u.acfT = AC.clk + 0.5;
  const dt = 0.5, p = BAC.flakP(u.key, e, d, dt);
  u.mag = Math.max(0, u.mag - 2); u.fired++; ADS.fired++;
  const a = u.pos, rb = [e.u.pos[0] + (Math.random() - 0.5) * 0.02, e.u.pos[1] + (Math.random() - 0.5) * 0.02];
  const rd = { from: u.id, key: u.key, tgt: 0, a: a.slice(), b: rb, d: Math.max(0.05, hav(a, rb)), s: 0, v: AD_SPD[T.spd] || 28, p: 0, hdg: brg(a, rb), color: "255,200,90" };
  ADS.rounds.push(rd); HOOKS.onRound && HOOKS.onRound(rd);
  if (fogFxOk(u)) fxMuzzle(a);
  if (Math.random() < p){ acHit(e, { spec: { n: T.n, w: 0.25 + 0.5 * F.k, fz: 0.2 }, from: u.id, side: acSd(u), pk: 1 }, 0.05 + Math.random() * 0.1, true); }
  if (u.mag <= 0) adStartReload(u);
}

/* ---------- винищувачі ---------- */
function acOwnTrack(e, tgt, off){
  const pf = e.perf;
  return pf.rad > 0 && off <= pf.fov && BAC.trackQ(pf.rad, e, tgt, { pd: pf.pd, jam: acJam(e.side, tgt.u.pos) }) >= BAC.CFG.trackMin;
}
/* джерело наведення ракети: власний радар пускача, якщо він веде ціль; інакше — мережа РЛС/ДРЛО (лінія обміну) */
function acMissileSrc(ref, tgtRef, side, S, pf){
  return () => {
    const c = AC.ents.get(ref), t = AC.ents.get(tgtRef), live = !!c && c.alive;
    if (live && t && t.alive && pf.rad > 0){
      const off = Math.abs(BAC.util.dA(c.hdg, BAC.util.brg(c, t)));
      if (off <= pf.fov && BAC.trackQ(pf.rad, c, t, { pd: pf.pd, jam: acJam(c.side, t.u.pos) }) >= BAC.CFG.trackMin)
        return { alive: true, x: c.x, y: c.y, h: c.h, R: pf.rad, pd: pf.pd, jam: acJam(c.side, t.u.pos), hdg: c.hdg, beam: S.g === "sarh" ? pf.fov : undefined };
    }
    if (AC.cue.on && t && t.alive){
      const p = acPic(side, t);
      if (p) return { alive: true, link: true, q: acClamp(p.conf, 0, 1) * (1 - Math.min(AC.cue.jamK, acJam(side, t.u.pos))), x: t.x, y: t.y, h: t.h };
    }
    return live ? { alive: true, x: c.x, y: c.y, h: c.h, R: pf.rad, pd: pf.pd, jam: acJam(c.side, t ? t.u.pos : null), hdg: c.hdg, beam: S.g === "sarh" ? pf.fov : undefined } : { alive: false };
  };
}
/* вибір ракети; побічно виставляє AC.cued = true, якщо пуск іде по цілевказанню мережі (власний радар ціль не веде) */
function acAamOf(u, T, e, tgt, d3){
  AC.cued = false;
  const ld = u.ld; if (!ld) return null;
  const ids = Object.keys(ld).filter(k => ld[k] > 0 && AIR_WPN[k] && BAC.AAM[k]); if (!ids.length) return null;
  const off = Math.abs(BAC.util.dA(e.hdg, BAC.util.brg(e, tgt))), pf = e.perf;
  const pic = AC.cue.on ? acPic(e.side, tgt) : null, own = acOwnTrack(e, tgt, off);
  const ok = [], cuedK = {};
  for (const k of ids){
    const S = BAC.AAM[k], f = T.r > 0 ? d3 / T.r : 0, rf = S.g === "sarh" || S.g === "arh";
    const viaNet = rf && !!pic;                                                           // РЛ-ракета + мережа веде ціль → дальність визначає сама ракета
    const inRange = viaNet ? d3 <= S.rng * AC.cue.k : f <= AIR_WPN[k].rk[1];
    if (!inRange || d3 < S.rmin || tgt.h < S.hmin || tgt.h > S.hmax || off > S.off * (viaNet ? AC.cue.offK : 1)) continue;
    if (S.g === "ir"){
      const reach = S.acq * Math.sqrt(BAC.irIntensity(tgt, e)) * 1.6; if (d3 > reach * 2.2) continue;
    } else if (!own && !viaNet) continue;                                                // SARH/ARH: свій радар або мережа
    ok.push(k); cuedK[k] = viaNet && !own;
  }
  if (!ok.length) return null;
  const pick = airPickW(u, T, d3);
  let w = ok.includes(pick) ? pick : null;
  if (!w){
    const net = ok.filter(k => cuedK[k]);
    if (net.length){                                                                       // найкоротша ракета, що дістає із запасом (економимо далекобійні)
      net.sort((a, b) => BAC.AAM[a].rng - BAC.AAM[b].rng);
      w = net.find(k => d3 <= BAC.AAM[k].rng * 0.75) || net[net.length - 1];
    } else w = ok.sort((a, b) => Math.abs(d3 / T.r - (AIR_WPN[a].rk[0] + AIR_WPN[a].rk[1]) / 2) - Math.abs(d3 / T.r - (AIR_WPN[b].rk[0] + AIR_WPN[b].rk[1]) / 2))[0];
  }
  AC.cued = !!cuedK[w];
  return w;
}
/* вибір цілі винищувача (раз на AC.scan): виявлена ворожа авіація в радіусі переслідування */
function acPickTarget(e){
  const u = e.u, T = e.T, pf = e.perf, side = e.side;
  if (u.mode === "manual" || u.state === "base" || u.state === "reload") return null;
  const reach = Math.max(airReach(u, T) * 1.15, 30);
  let cueReach = 0;                                                                         // найдальша РЛ-ракета на борту (цілевказання від мережі)
  if (AC.cue.on && u.ld) for (const k of Object.keys(u.ld)){ const S = u.ld[k] > 0 && BAC.AAM[k]; if (S && (S.g === "sarh" || S.g === "arh")) cueReach = Math.max(cueReach, S.rng * AC.cue.k); }
  let best = null, bs = Infinity;
  for (const x of AC.ents.values()){
    if (x.side === side || !x.alive || x.st.hp <= 0) continue;
    const d = BAC.slant(e, e.h, x, x.h), pic = acPic(side, x);
    if (d > (pic && cueReach ? Math.max(reach * 1.4, cueReach) : reach * 1.4)) continue;
    const off = Math.abs(BAC.util.dA(e.hdg, BAC.util.brg(e, x)));
    let q = pf.rad > 0 && off <= pf.fov ? BAC.trackQ(pf.rad, e, x, { pd: pf.pd, jam: acJam(side, x.u.pos) }) : 0;
    if (pf.irst > 0) q = Math.max(q, BAC.irstQ(pf.irst, e, x) * (off <= 90 ? 1 : 0.6));
    if (d < 8) q = Math.max(q, 0.6);                                                     // візуально
    if (acNeedPic(side)){ if (!pic && !(d < 10 && q >= BAC.CFG.trackMin)) continue; q = Math.max(q, 0.6); }
    else q = Math.max(q, pic ? 0.6 : 0);
    if (q < BAC.CFG.trackMin) continue;
    if (u.state === "patrol" && u.patrol && hav(x.u.pos, u.patrol) > AIR.leash + 45) continue;
    const inb = acInboundSide(x.ref, side);
    let sc = d + inb * 25 - (x.kind === "c" ? 20 : x.aew ? 28 : 0) + off * 0.1;
    if (x.heli && !x.u.pos) continue;
    if (x.ref === (AC.tgt.get(e.ref) || "")) sc -= 15;
    if (sc < bs){ bs = sc; best = x; }
  }
  return best;
}
function acFighterFire(e, tgt, sd){
  const u = e.u, T = e.T, st = e.st;
  if (u.cool > 0) return;
  const d3 = BAC.slant(e, e.h, tgt, tgt.h), L = AC.fl.get(e.ref);
  const wid = acAamOf(u, T, e, tgt, d3);
  if (wid){
    const S = BAC.AAM[wid], cap = S.g === "ir" ? 1 : 2;
    if (acInbound(tgt.ref, "f" + u.id) >= cap) return;
    if (!L || L.ref !== tgt.ref || AC.clk - L.seen > 0.5){ AC.fl.set(e.ref, { ref: tgt.ref, t0: AC.clk, seen: AC.clk }); return; }
    L.seen = AC.clk;
    const cued = AC.cued;
    if (S.g !== "ir" && !cued) tgt.st.painted = AC.clk;                                    // по цілевказанню бортовий радар ціль не опромінює
    if (AC.clk - L.t0 < (BAC.CFG.lockT[S.g] || 1.2)) return;
    AC.fl.delete(e.ref);
    const spec = Object.assign({}, S, { burn: S.burn });
    const maxp = Math.max(T.r * AIR_WPN[wid].rk[1] * 1.5 + 10, S.rng ? S.rng * 0.9 : 0);
    const lead = Math.hypot(tgt.x - e.x, tgt.y - e.y) / (S.v * 0.7), lx = tgt.x + Math.sin(tgt.hdg * D2R) * tgt.v * lead, ly = tgt.y + Math.cos(tgt.hdg * D2R) * tgt.v * lead;
    const hdg = (Math.atan2(lx - e.x, ly - e.y) / D2R + 360) % 360;
    const ref = e.ref, pf = e.perf;
    const src = acMissileSrc(ref, tgt.ref, e.side, S, pf);
    const m = BAC.makeMissile(spec, { from: u.id, side: e.side, tgt: tgt.ref, x: e.x, y: e.y, h: e.h, hdg, v0: Math.max(e.v, S.v * 0.45), max: maxp, tx: tgt.x, ty: tgt.y, th: tgt.h,
      tvx: Math.sin(tgt.hdg * D2R) * tgt.v, tvy: Math.cos(tgt.hdg * D2R) * tgt.v, src, pk: AIR_WPN[wid].pk, t0: AC.clk });
    if (S.g === "ir") m.active = true;
    if (cued){ m.cued = true; AC.stats[e.side].cued = (AC.stats[e.side].cued || 0) + 1; acHint(e.side, `${T.n}: ${S.n} — наведення від РЛС/ДРЛО, ${Math.round(d3)} км`, 1.5); }
    acLaunch(m, u.key, wid);
    u.mag--; u.fired++; ADS.fired++; u.ld[wid]--; u.cool += AIR.rof * 3;
    if (fogFxOk(u)) fxMuzzle(u.pos);
    return;
  }
  /* гармата: лише в ближньому бою, ціль у вузькому конусі попереду */
  if (st.gun > 0 && e.perf.gun && !e.heli){
    const off = Math.abs(BAC.util.dA(e.hdg, BAC.util.brg(e, tgt)));
    if (d3 <= 1.6 && off <= 9 && Math.abs(e.h - tgt.h) <= 800 && AC.clk >= (st.gunT || 0)){
      st.gunT = AC.clk + 0.5; st.gun -= 12; u.cool += 0.2;
      const a = u.pos, rb = tgt.u.pos.slice();
      const rd = { from: u.id, key: u.key, tgt: 0, a: a.slice(), b: rb, d: Math.max(0.05, hav(a, rb)), s: 0, v: 20, p: 0, hdg: brg(a, rb), color: "255,214,120" };
      ADS.rounds.push(rd); HOOKS.onRound && HOOKS.onRound(rd);
      if (fogFxOk(u)) fxMuzzle(a);
      const p = BAC.flakP("jet", tgt, d3, 0.5);
      if (Math.random() < p) acHit(tgt, { spec: { n: "гармата", w: 0.35, fz: 0.2 }, from: u.id, side: e.side, pk: 1 }, 0.05, true);
    }
  }
}
/* викликається з airStep (патруль / транзит / повернення): повертає true, якщо літак керується повітряним боєм у цей кадр */
HOOKS.acBrain = function(u, T, sd, shotsBy){
  if (!AC.on || !BAC.CFG.on || GAME.puppet) return false;
  const ref = "f" + u.id, e = AC.ents.get(ref); if (!e) return false;
  if (HOOKS.holdCourse && HOOKS.holdCourse(u)) return false;      // гравець веде літак сам — курс не перехоплюємо (пастки викидаються автоматично)
  const st = e.st;
  if (st.hp < BAC.CFG.dmgBelow && !u.acDmg){
    u.acDmg = true; acHint(e.side, `${T.n}: пошкоджено — повертається на аеродром`, 0);
    airRTB(u, "base"); return false;
  }
  const act = st.act && AC.clk - st.actT < 0.35 && !st.act.wait ? st.act : null;
  if (act){                                                       // ухилення від ракети
    u.cool = Math.max(0, u.cool - sd);
    turnTo(u, act.hdg, sd, BAC.CFG.evK * act.turn * Math.min(1, e.perf.g / 9) * 1.2);
    st.ab = true;
    const spd = airSpeed(u, T, AIR.chase * airK(T) * (act.v || 1), sd) * sd, a = u.hdg * D2R, nxt = offKm(u.pos, Math.sin(a) * spd, Math.cos(a) * spd);
    if (airOK(u.side, nxt)) u.pos = nxt;
    return true;
  }
  st.ab = (u.sp || 0) > AIR.cruise * airK(T) * 1.05;
  if (u.state !== "patrol" && u.state !== "transit") return false;
  if (u.mag <= 0 && !(st.gun > 0)) return false;
  const tgt = AC.tgt.has(ref) ? AC.ents.get(AC.tgt.get(ref)) : null;
  if (!tgt || !tgt.alive) return false;
  /* переслідування: ніс на точку зустрічі, висота цілі */
  const d = Math.hypot(tgt.x - e.x, tgt.y - e.y), ttg = d / (AIR.chase * airK(T) + 1e-6);
  const lx = tgt.x + Math.sin(tgt.hdg * D2R) * tgt.v * Math.min(ttg, 6), ly = tgt.y + Math.cos(tgt.hdg * D2R) * tgt.v * Math.min(ttg, 6);
  const want = (Math.atan2(lx - e.x, ly - e.y) / D2R + 360) % 360;
  turnTo(u, want, sd, AIR.aim / AIR.turn);
  st.hP = acClamp(tgt.h, e.perf.low, e.perf.ceil); st.hPt = AC.clk;
  const spd = airSpeed(u, T, AIR.chase * airK(T), sd) * sd, a = u.hdg * D2R, nxt = offKm(u.pos, Math.sin(a) * spd, Math.cos(a) * spd);
  if (airOK(u.side, nxt) && (u.state === "transit" || u.atk || hav(nxt, u.patrol) <= AIR.leash + 25)) u.pos = nxt;
  u.cool = Math.max(0, u.cool - sd);      // airStep тут завершується раніше — перезарядку зменшуємо самі
  acFighterFire(e, tgt, sd);
  if (u.state === "transit") u.div = true;
  return true;
};

/* ---------- носії ---------- */
function acCarrierDefense(e){
  const st = e.st; if (!(st.def > 0) || !st.defId) return;
  const S = BAC.AAM[st.defId], pf = e.perf; if (!S || AC.clk < (st.defT || 0)) return;
  if (st.act && AC.clk - st.actT < 1.2) return;                 // зайнятий ухиленням
  let best = null, bd = Infinity;
  for (const x of AC.ents.values()){
    if (x.side === e.side || x.kind !== "f" || x.heli || !x.alive) continue;
    const d = BAC.slant(e, e.h, x, x.h); if (d > S.rng || d < S.rmin || x.h < S.hmin || x.h > S.hmax) continue;
    const off = Math.abs(BAC.util.dA(e.hdg, BAC.util.brg(e, x))); if (off > S.off) continue;
    const q = Math.max(pf.rad > 0 ? BAC.trackQ(pf.rad, e, x, { pd: pf.pd, jam: acJam(e.side, x.u.pos) }) : 0, d < 9 ? 0.6 : 0, acPic(e.side, x) ? 0.6 : 0);
    if (q < BAC.CFG.trackMin) continue;
    if (S.g === "sarh" && !(pf.rad > 0 && off <= pf.fov)) continue;
    if (acInbound(x.ref, e.ref) >= 1) continue;
    if (d < bd){ bd = d; best = x; }
  }
  if (!best){ AC.fl.delete(e.ref); return; }
  const L = AC.fl.get(e.ref);
  if (!L || L.ref !== best.ref || AC.clk - L.seen > 0.5){ AC.fl.set(e.ref, { ref: best.ref, t0: AC.clk, seen: AC.clk }); return; }
  L.seen = AC.clk; if (S.g !== "ir") best.st.painted = AC.clk;
  if (AC.clk - L.t0 < (BAC.CFG.lockT[S.g] || 1.2)) return;
  AC.fl.delete(e.ref); st.defT = AC.clk + 1.4; st.def--;
  const lead = Math.hypot(best.x - e.x, best.y - e.y) / (S.v * 0.7), lx = best.x + Math.sin(best.hdg * D2R) * best.v * lead, ly = best.y + Math.cos(best.hdg * D2R) * best.v * lead;
  const hdg = (Math.atan2(lx - e.x, ly - e.y) / D2R + 360) % 360, ref = e.ref, spec = Object.assign({}, S);
  const src = () => { const c = AC.ents.get(ref); if (!c || !c.alive) return { alive: false };
    return { alive: true, x: c.x, y: c.y, h: c.h, R: pf.rad, pd: pf.pd, jam: acJam(c.side, best.u.pos), hdg: c.hdg, beam: S.g === "sarh" ? pf.fov : undefined }; };
  const m = BAC.makeMissile(spec, { from: ref, side: e.side, tgt: best.ref, x: e.x, y: e.y, h: e.h, hdg, v0: Math.max(e.v, S.v * 0.45), max: S.rng * 1.4 + 10, tx: best.x, ty: best.y, th: best.h,
    tvx: Math.sin(best.hdg * D2R) * best.v, tvy: Math.cos(best.hdg * D2R) * best.v, src, t0: AC.clk });
  if (S.g === "ir") m.active = true;
  acLaunch(m, e.key, st.defId in AIR_WPN ? st.defId : null);
  acHint(e.side, `${CARRIERS[e.key].n}: пуск ${S.n} по ${AD_TYPES[best.key] ? AD_TYPES[best.key].n : "винищувачу"}`, 1);
}
/* зсув з траси при ухиленні: викликається з stepUnit після place() */
HOOKS.acCar = function(u, sd){
  if (!AC.on || !BAC.CFG.on || GAME.puppet || u.fall) return;
  const st = AC.st.get("c" + u.id); if (!st) return;
  const pf = BAC.perfOf(u.key), base = u.hdg;
  const act = st.act && AC.clk - st.actT < 0.35 && !st.act.wait ? st.act : null;
  let want = 0;
  if (act) want = acClamp(BAC.util.dA(base, act.hdg), -80, 80);
  else if (Math.abs(st.off || 0) > 0.15) want = acClamp(-(st.off || 0) * 10, -45, 45);
  const w = 55 * BAC.CFG.evK * Math.min(1, pf.g / 9) * (act ? act.turn : 0.6) * sd;
  st.phi = (st.phi || 0) + acClamp(want - (st.phi || 0), -w, w);
  if (!act && Math.abs(st.off || 0) <= 0.15 && Math.abs(st.phi) < 1){ st.phi = 0; st.off = 0; return; }
  st.off = acClamp((st.off || 0) + (u.spd || 8) * Math.sin(st.phi * D2R) * sd, -9, 9);
  const perp = (base + 90) * D2R;
  u.pos = offKm(u.pos, Math.sin(perp) * st.off, Math.cos(perp) * st.off);
  u.hdg = (base + st.phi + 360) % 360;
};

/* ---------- ураження й втрати ---------- */
function acHit(e, m, miss, gun){
  if (!e.alive || e.st.hp <= 0) return;
  const r = BAC.warhead(m, e, miss);
  const pos = e.u.pos, tn = e.kind === "c" ? CARRIERS[e.key].n : AD_TYPES[e.key].n;
  if (r.killed){ acKill(e, m, tn); return; }
  if (!gun) fxHitSpark(pos);
  if (r.damaged){
    if (e.kind === "c" && !e.st.dmgDone){ e.st.dmgDone = true; e.u.spd *= 0.8; }
    if (e.kind === "f" && !e.u.acDmg && e.u.state !== "rtb"){ e.u.acDmg = true; airRTB(e.u, e.aew && e.u.reserve > 0 ? "patrol" : "base"); }      // ДРЛО (aewStep) сам не бачить ушкоджень — повертаємо його тут
    acHint(e.side, `${tn}: потрапляння ${m.spec.n} — літак пошкоджено`, 0);
  } else if (!gun) acHint(e.side, `${tn}: осколки ${m.spec.n} — літак цілий`, 4);
}
function acKill(e, m, tn){
  e.alive = false;
  const shooter = ADS.units.get(m.from) || null, sdK = m.side, sdV = e.side;
  AC.stats[sdK].kills++; AC.stats[sdV].lost++;
  if (shooter) shooter.kills = (shooter.kills | 0) + 1;
  if (e.kind === "f"){
    const a = e.u; ADS.units.delete(a.id); ADS.dirty = true;
    impact(a.pos, "kill", "jet");
    AC.st.delete(e.ref); AC.tgt.delete(e.ref);
  } else {
    const t = e.u;
    if (!units.has(t.id) || t.fall) return;
    HOOKS.onDown && HOOKS.onDown(t, shooter || { side: sdK });
    t.fall = { t: 0, dur: rnd(2.2, 4.4), w: (Math.random() < 0.5 ? -1 : 1) * rnd(240, 660), v0: Math.max(1.2, t.spd * 0.55), dir: t.hdg };
    t.onEnd = null; fxFall(t); ADS.dirty = true;
  }
  if (e.kind === "f" && GAME.on && !GAME.puppet && GAME.phase === "run"){
    const S = GAME.st[sdK]; if (S){ S.downed++; S.pts += 12; S.ptsDef += 12; }
    if (GAME.st[sdV]) GAME.st[sdV].lost++;
  }
  HOOKS.adHint && HOOKS.adHint(sdV, `${tn}: збито ракетою ${m.spec.n} — ${e.aew ? "ДРЛО втрачено" : "літак втрачено"}`);
  if (sdK !== sdV) HOOKS.adHint && HOOKS.adHint(sdK, `${tn} (${SIDE_N[sdV]}) збито — ${m.spec.n}`);
}
function acEndShot(m, hit){
  const i = AC.ms.indexOf(m); if (i >= 0) AC.ms.splice(i, 1);
  const j = ADS.shots.indexOf(m); if (j >= 0) ADS.shots.splice(j, 1);
  if (m.trail && m.trail.length) FX.trails.push({ pts: m.trail.concat([[m.pos[0], m.pos[1], performance.now()]]), sd: m.sd });
  if (!hit) impact(m.pos, "miss");
}
function acMissileEvent(m, ev){
  const e = ev.ent;
  if (ev.k === "burst" && e){
    acEndShot(m, true); acHit(e, m, ev.miss, false);
    if (e.alive) impact(m.pos, "miss");
    return;
  }
  acEndShot(m, false);
  if (ev.k === "decoy" && e){
    AC.stats[e.side].decoyed++;
    acHint(e.side, `${e.kind === "c" ? CARRIERS[e.key].n : AD_TYPES[e.key].n}: ракету ${m.spec.n} відведено ${m.spec.g === "ir" || m.spec.g === "sal" ? "тепловою пасткою" : "диполями"}`, 2);
  } else if (ev.k === "lost" && e){
    acHint(e.side, `${e.kind === "c" ? CARRIERS[e.key].n : AD_TYPES[e.key].n}: ракета ${m.spec.n} втратила захоплення`, 3);
  }
}

/* ---------- ухилення та пастки ---------- */
function acDefense(e){
  const st = e.st;
  const thr = [];
  for (const m of AC.ms) if (m.tgt === e.ref && !m.dead && m.lock.mode !== "lost") thr.push({ m, d: BAC.slant(m, m.h, e, e.h) });
  const act = BAC.defend(e, thr, AC.W);
  if (act){ st.act = act; st.actT = AC.clk; if (!act.wait) st.hT = act.h; } else if (st.act && AC.clk - st.actT > 0.35) st.act = null;
  if (act && act.cm){
    for (const k of act.cm){
      const r = BAC.dispense(AC.W, e, k);
      if (r) HOOKS.fx && HOOKS.fx(radLL(e.x, e.y), r === "flare" ? "flare" : "chaff", "jet");
    }
  }
  if (st.painted != null && AC.clk - st.painted < 1.2 && e.perf.ecm > 0) st.ecm = true;
  else if (!act) st.ecm = false;
}

/* ---------- головний крок ---------- */
HOOKS.acStep = function(sd){
  if (!AC.on || !BAC.CFG.on || GAME.puppet || !(sd > 0)) return;
  if (!ADS.units.size && !AC.ms.length) { AC.clk += sd; return; }
  const n = Math.max(1, Math.ceil(sd / 0.1)), dtc = sd / n;
  acBuild();
  for (let k = 0; k < n; k++){
    AC.clk += dtc; AC.W.t = AC.clk;
    if (!AC.ents.size && !AC.ms.length) continue;
    for (const e of AC.ents.values()) acAltitude(e, dtc);
    /* оновити висоти й побудувати цілі наступного кадру */
    AC.scan -= dtc;
    if (AC.scan <= 0){
      AC.scan = 0.25;
      for (const e of AC.ents.values()){
        if (e.kind !== "f" || e.heli || e.aew){ if (e.kind === "f") AC.tgt.delete(e.ref); continue; }      // ДРЛО й вертольоти літаки не переслідують
        const t = acPickTarget(e);
        if (t) AC.tgt.set(e.ref, t.ref); else AC.tgt.delete(e.ref);
      }
      acSams();
      for (const e of AC.ents.values()) if (e.kind === "c") acCarrierDefense(e);
    }
    for (const e of AC.ents.values()) acDefense(e);
    /* ракети: крок у просторі, цілі пересуваються разом із кроком */
    BAC.stepDecoys(AC.W, dtc);
    for (let i = AC.ms.length - 1; i >= 0; i--){
      const m = AC.ms[i]; if (!m) continue;
      const ev = BAC.stepMissile(m, dtc, AC.W);
      m.pos = radLL(m.x, m.y);
      if (m.hdg != null) m.tl += dtc;
      if (m.tl >= 0.045){ m.tl = 0; m.trail.push([m.pos[0], m.pos[1], performance.now()]); if (m.trail.length > 80) m.trail.shift(); }
      if (ev) acMissileEvent(m, ev);
    }
    for (const e of AC.ents.values()){ e.x += Math.sin(e.hdg * D2R) * e.v * dtc; e.y += Math.cos(e.hdg * D2R) * e.v * dtc; }
  }
};
HOOKS.acInit = function(){
  AC.ms.length = 0; AC.st.clear(); AC.ents.clear(); AC.sl.clear(); AC.fl.clear(); AC.tgt.clear(); AC.W.flares.length = 0; AC.W.chaff.length = 0; AC.clk = 0; AC.scan = 0;
  for (const s of ["ua", "ru"]) AC.stats[s] = { kills: 0, lost: 0, shots: 0, decoyed: 0 };
};
