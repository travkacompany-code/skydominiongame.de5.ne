/* avia:v1 */
/* ---------- BANGVECTOR 2 · етап 4: АВІАЦІЯ (ядро: 02i_avia.js) ----------
   Ударні літаки (Ту-95МС, Ту-22М3, МіГ-31К, Су-34, Су-24) летять як авіагрупи з аеродромів:
   • аеродром базування (де стоять) і аеродром вильоту (з якої смуги злітають) — на панелі пуску; літаки з інших аеродромів долітають самі;
   • злітна смуга: одночасно лише стільки літаків, скільки вільних смуг; пошкоджений аеродром має менше смуг, знищений — закритий;
   • парк обмежений: літак є, лише коли стоїть на стоянці; парк сторони — як раніше (GAME.eco[sd].fleet), розподілений по аеродромах;
   • пуски не одночасні: літак виходить на рубіж, стріляє ракетами по одній (інтервал), літаки групи — черговістю;
   • повернення: посадка на смугу, підготовка (час ATKR.tat), літак знову на стоянці; аеродром знищено — стоянка й підготовка втрачені, черга йде на інший аеродром.
   Старий пуск носіїв лишається для кораблів, підводних човнів і «Охотника». Вимкнути: BV_AVIA.CFG.on = false. */
const AVX = { pick: { dep: null, base: null } };
const AV_HOMEOF = { tu95: "strat", tu22: "strat", mig31: "fighter", su34: "fighter", su24: "ua_air" };
const AV_TYPES = { fighter: 1, strat: 1, ua_air: 1 };
const avB = () => window.BV_AVIA;
const avOn = () => !!(avB() && avB().CFG.on);
const avIsAir = cKey => !!(CARRIERS[cKey] && CARRIERS[cKey].kind === "air" && !CARRIERS[cKey].self);
const avAfOfSite = s => { const B = avB(); return B ? B.list().find(a => a.ref === s) || null : null; };
const avStep = ms => (ms || 0) > 0 ? ms : 0;
/* ---- початок бою: аеродроми, стоянки за парком сторони ---- */
function aviaInit(){
  AVX.pick = { dep: null, base: null };
  if (!avOn()) return;
  const B = avB(), defs = [];
  for (const s of SITES){
    if (s.off || !AV_TYPES[s.t]) continue;
    defs.push({ id: s.n, n: s.n, side: siteSide(s), home: s.t, c: s.c, rw: s.rw || B.CFG.rwy[s.t] || 2, ref: s });
  }
  B.reset(defs);
  for (const sd of ["ua", "ru"]){
    const E = ecoE(sd);
    for (const key of Object.keys(AV_HOMEOF)){
      const C = CARRIERS[key]; if (!C || C.side !== sd || !avIsAir(key)) continue;
      let targets = B.list().filter(a => a.side === sd && a.home === AV_HOMEOF[key]);
      if (!targets.length) targets = B.list().filter(a => a.side === sd);
      if (!targets.length) continue;
      if (!E || !E.fleet){ for (const a of targets) B.addParked(a, key, 999); continue; }      // без обмеження парку
      const n = E.fleet[key] | 0;
      for (let k = 0; k < n; k++){
        let best = targets[0], bl = Infinity;
        for (const a of targets){ const load = B.parkedTot(a) / a.rw; if (load < bl){ bl = load; best = a; } }
        B.addParked(best, key, 1);
      }
    }
  }
  AVX.dirty = true;
}
HOOKS.avInit = aviaInit;
/* ---- доступність для пуску (замість carAvail для авіації) ---- */
function avAvail(sd, cKey){
  const B = avB(); if (!B) return 0;
  const pick = AVX.pick.base;
  let v = pick != null ? B.availFor(sd, cKey, pick, true) : B.availFor(sd, cKey, null, false);
  const E = ecoE(sd); if (E && E.fleet && E.fleet[cKey] != null) v = Math.min(v, E.fleet[cKey] | 0);      // ніколи більше, ніж є в парку (після втрати — одразу)
  return v;
}
HOOKS.avAvail = avAvail;
/* ---- аеродром вильоту з панелі пуску (lpPlan): обраний гравцем, якщо живий і свій ----*/
function avDepPick(res, s, C){
  if (!avOn() || !avIsAir(res.cKey) || AVX.pick.dep == null) return;
  const B = avB(), a = B.af(AVX.pick.dep);
  if (!a || !B.alive(a) || a.side !== siteSide(s)) return;
  res.bases = [a.ref];
}
/* ---- пуск (з doLaunch): створює авіагрупу, ставить літаки в чергу вильоту ---- */
function avLaunch(plan, key, cfg, n, ui){      // true — групу створено; загальне повідомлення про пуск — у doLaunch
  const B = avB(), C = plan.C, sd = plan.side, cKey = plan.cKey, cap = carCap(C, key), nc = Math.ceil(n / cap);
  const dep = avAfOfSite(plan.bases[0]);
  if (!dep || !B.alive(dep)){ if (ui) toast("Аеродром вильоту знищено — авіація не злітає"); return false; }
  const strict = AVX.pick.base != null, pref = strict ? AVX.pick.base : null;
  const alloc = B.allocate(sd, cKey, nc, pref, dep.i, strict);
  if (!alloc){ if (ui) toast(`Немає вільних носіїв ${C.n}: на обраних аеродромах ${nc} шт. не вистачає`); return false; }
  const G = B.group({ side: sd, key: cKey, n: nc, label: `${C.n} · вильоти з ${dep.n}` });
  B.reserve(alloc, cKey);
  const zone = pickOne(plan.cands).z;
  let left = n;
  for (const x of alloc) for (let k = 0; k < x.n; k++){
    const load = Math.min(cap, left); left -= load;
    B.enqueue(dep, { grp: G.id, key: cKey, wKey: key, base: x.af.i, load, zone, cfg, readyAt: SIM.t + B.ferry(x.af, dep, C.spd) });
  }
  AVX.dirty = true;
  return true;
}
/* ---- зліт: літак на смузі, розбіг, далі — рубіж ---- */
function avSpawn(a, e){
  const B = avB(), C = CARRIERS[e.key], G = B.grp(e.grp), z = e.zone, now = SIM.t, rl = B.roll(e.key);
  B.takeRunway(a, now, rl);
  const lp = z.front ? z.c.slice() : z.spots ? pickOne(z.spots) : WEAPONS[e.wKey].edge ? edgePt(z, zoneR(z), e.cfg.target) : (siteSide(z) === "ua" && z.t !== "ua_sea" ? randInOwn(z, zoneR(z) * 0.85) : randIn(z.c, zoneR(z) * 0.85));
  const out = densify(flyRoute(C.side, a.c, lp), 8);
  const zn = z.n.replace("Тактичний рубіж ", "").replace("Рубіж ", "");
  const u = spawn({ kind: "c", key: e.key, img: C.img, pts: out, spd: C.spd, sz: C.sz, cls: "carrier", alt: false, sd: C.side,
    meta: { phase: "Розгін на смузі", load: e.load, w: e.wKey, base: a.n, zone: zn } });
  u.avia = e.grp; u.avSlot = G ? G.seq++ : 0; u.wait = rl;
  u.onEnd = cu => avFire(cu, e);
  schedule(rl, () => { if (units.has(u.id) && u.meta.phase === "Розгін на смузі") u.meta.phase = "Вихід на рубіж"; });      // після розбігу
  if (HOOKS.carFuel) HOOKS.carFuel(e.key, C.side);                  // пальне — як для будь-якого вильоту носія
  if (G){ G.left--; G.air++; }
  AVX.dirty = true;
}
/* ---- рубіж: літак тримається на місці й пускає ракети по одній (не залпом) ---- */
function avFire(cu, e){
  if (!units.has(cu.id)) return;
  const B = avB(), C = CARRIERS[cu.key], hold = avStep(cu.avSlot) * B.CFG.acGap, load = e.load;
  setPath(cu, [cu.pos.slice(), cu.pos.slice()]);
  cu.wait = hold + Math.max(0, load - 1) * B.CFG.shotGap + 0.2;
  cu.meta.phase = "Черга пуску";
  for (let j = 0; j < load; j++){
    schedule(hold + j * B.CFG.shotGap, () => {
      if (!units.has(cu.id)) return;
      cu.meta.phase = `Пуск ракети ${j + 1} з ${load}`;
      spawnWeapon(e.wKey, 0, cu.pos.slice(), e.cfg.targetFor(), e.cfg.mode, e.cfg.wps, { from: C.n + " · " + cu.meta.zone, target: e.cfg.targetName });
      cu.meta.load--;
    });
  }
  cu.onEnd = x => avReturn(x, e);
}
/* ---- повернення: до аеродрому базування, або до найближчого живого ---- */
function avReturn(cu, e){
  if (!units.has(cu.id)) return;
  const B = avB(), sd = CARRIERS[cu.key].side;
  const a = B.pickRtb(sd, cu.pos, e.base);
  if (!a){
    cu.holdT = (cu.holdT || 0) + B.CFG.holdStep;
    if (cu.holdT > B.CFG.holdMax){ avLost(cu, "паливо вичерпано — немає аеродрому"); return; }
    cu.meta.phase = "Очікує аеродрому";
    setPath(cu, [cu.pos.slice(), cu.pos.slice()]); cu.wait = B.CFG.holdStep;
    cu.onEnd = x => avReturn(x, e);
    return;
  }
  setPath(cu, densify(flyRoute(sd, cu.pos, a.c), 8));
  cu.meta.phase = "Повернення на " + a.n;
  cu.onEnd = x => avLand(x, e, a);
}
/* ---- посадка: черга на смугу (пробіг займає її), потім підготовка ---- */
function avLand(cu, e, a){
  if (!units.has(cu.id)) return;
  const B = avB();
  if (!B.alive(a)){ avReturn(cu, e); return; }
  const start = B.takeRunway(a, SIM.t, B.roll(cu.key) * B.CFG.landK);
  if (start == null){ avReturn(cu, e); return; }
  const w = Math.max(0, start - SIM.t);
  setPath(cu, [cu.pos.slice(), cu.pos.slice()]); cu.wait = w;
  cu.meta.phase = w > 0 ? `Очікує смуги «${a.n}»` : `Посадка на «${a.n}»`;
  cu.onEnd = x => avLanded(x, e, a);
}
function avLanded(cu, e, a){
  if (!units.has(cu.id)) return;
  const B = avB();
  if (!B.alive(a)){ avReturn(cu, e); return; }                  // аеродром знищено, поки літак сідав — на інший
  units.delete(cu.id);
  const tat = ATKR.tat[cu.key] || ATKR.tatDefault;
  B.prepAdd(a, cu.key, SIM.t + tat, e.grp);
  const G = B.grp(e.grp); if (G){ G.air--; G.landed++; }
  AVX.dirty = true;
}
/* ---- втрата літака (не через ППО): з парку виходить назавжди ---- */
function avLost(cu, why){
  const sd = CARRIERS[cu.key].side, E = ecoE(sd), B = avB(), G = B.grp(cu.avia);
  units.delete(cu.id);
  if (E && E.fleet) { ecoAdd(sd, "c:" + cu.key, -1); facClamp(sd); }
  if (G){ G.air--; G.lost++; }
  gameToast(`${SIDE_N[sd]}: ${CARRIERS[cu.key].n} втрачено — ${why}`);
}
/* ---- аеродром знищено: стоянка й підготовка втрачені, черга переходить на інший ---- */
function avKill(a, now){
  const B = avB(), sd = a.side, K = B.kill(a), E = ecoE(sd);
  let lost = 0;
  for (const k in K.parked){
    const m = K.parked[k];
    lost += m; if (E && E.fleet) ecoAdd(sd, "c:" + k, -m);
  }
  for (const p of K.prep){ lost++; if (E && E.fleet) ecoAdd(sd, "c:" + p.key, -1); }
  for (const e of K.queue){
    const alt = B.nearest(sd, a.c, null), base = B.af(e.base);
    if (alt){
      const spd = CARRIERS[e.key].spd;
      e.readyAt = Math.max(now, e.readyAt) + (base ? B.ferry(base, alt, spd) : 0);      // перегін з базування на новий аеродром вильоту
      B.enqueue(alt, e);
    } else if (base && B.alive(base)){
      B.addParked(base, e.key, 1);
    } else {
      lost++; if (E && E.fleet) ecoAdd(sd, "c:" + e.key, -1);
      const G = B.grp(e.grp); if (G){ G.left--; G.lost++; }
    }
  }
  AVX.dirty = true;
  if (lost) sideToast(sd, `Аеродром «${a.n}» знищено — втрачено літаків: ${lost}`);
}
/* ---- такт: смуги, зліт із черги, підготовка, звірка парку ---- */
function aviaTick(sd){
  const B = avB();
  if (!B || !B.CFG.on || !GAME.on || GAME.puppet || !SIM) return;
  const now = SIM.t;
  for (const a of B.list()){
    const s = a.ref, oi = s && s._oi;
    if (oi == null) continue;
    const dead = HOOKS.siteDead(s);
    if (dead){ if (!a.dead) avKill(a, now); continue; }
    const frac = GAME.obj && OBJS[oi] && OBJS[oi].hp > 0 ? clamp01(GAME.obj[oi] / OBJS[oi].hp) : 1;
    B.setHealth(a, frac);
  }
  for (const a of B.list()){
    if (!B.alive(a)) continue;
    while (a.q.length && B.freeRunway(a, now)){
      const e = B.dequeueReady(a, now); if (!e) break;
      avSpawn(a, e);
    }
  }
  for (const p of B.prepDone(now)){
    if (B.alive(p.af)) B.addParked(p.af, p.key, 1);
    else { const E = ecoE(p.af.side); if (E && E.fleet) ecoAdd(p.af.side, "c:" + p.key, -1); }
  }
  for (const sd2 of ["ua", "ru"]){
    const E = ecoE(sd2); if (!E || !E.fleet) continue;
    for (const key of Object.keys(AV_HOMEOF)){
      if (!avIsAir(key) || CARRIERS[key].side !== sd2 || E.fleet[key] == null) continue;
      let air = 0; for (const u of units.values()) if (u.kind === "c" && u.key === key && u.sd === sd2 && u.avia && !u.avLost && !u.fall) air++;
      const cnt = B.count(sd2, key), d = B.reconcileDelta(E.fleet[key], cnt, air);
      if (d > 0){ const home = B.list().filter(a => a.side === sd2 && B.alive(a)).sort((x, y) => y.rw - x.rw)[0]; if (home) B.addParked(home, key, d); }
      else if (d < 0){ let rest = -d; for (const a of B.list()){ if (rest <= 0) break; if (a.side !== sd2) continue; const m = Math.min(rest, a.parked[key] | 0); if (m > 0){ a.parked[key] -= m; rest -= m; } } }
    }
  }
}
HOOKS.avTick = aviaTick;
function clamp01(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
/* ---- панель пуску: вибір аеродромів ---- */
function avPick(act, v){
  if (act === "avdep") AVX.pick.dep = v === "auto" ? null : +v;
  else AVX.pick.base = v === "auto" ? null : +v;
}
function avNote(side, cKey){
  const B = avB(), cnt = B.count(side, cKey), flight = B.groups().filter(g => g.side === side && (g.left > 0 || g.air > 0));
  const air = flight.reduce((s, g) => s + g.air, 0), left = flight.reduce((s, g) => s + g.left, 0);
  return `Стоянки: <b>${cnt.parked}</b> · у черзі на зліт: <b>${cnt.queue}</b> · на підготовці: <b>${cnt.prep}</b>` +
    (air || left ? ` · у польоті: <b>${air}</b>, очікують вильоту: <b>${left}</b>` : "");
}
/* блок «Аеродроми» у панелі пуску для літаків-носіїв */
function AVX_block(side, cKey, s){
  const B = avB(), C = CARRIERS[cKey]; if (!B) return "";
  const home = AV_HOMEOF[cKey];
  const deps = B.list().filter(a => a.side === side);
  const sel = avAfOfSite(s);
  const curDep = AVX.pick.dep != null ? AVX.pick.dep : (sel ? sel.i : null);
  const bases = deps.filter(a => a.home === home || B.parkedOf(a, cKey) > 0);
  let h = `<div class="lp-sec"><div class="lp-h"><span>Аеродроми</span><span>${escH(C.n)}</span></div>`;
  h += `<div class="lp-h" style="margin-top:4px"><span>Вильоти з</span><span></span></div><div class="chips">` +
    deps.map(a => {
      const ok = B.alive(a);
      return `<button class="chip ${a.i === curDep ? "on" : ""}" data-act="avdep" data-v="${a.i}" ${ok ? "" : "disabled"} title="Злітних смуг працює ${a.k} з ${a.rw}">${escH(a.n)} · смуг ${ok ? a.k : 0}/${a.rw}</button>`;
    }).join("") + `</div>`;
  h += `<div class="lp-h" style="margin-top:8px"><span>Базування (стоянка)</span><span>${AVX.pick.base == null ? "авто" : ""}</span></div><div class="chips">` +
    `<button class="chip ${AVX.pick.base == null ? "on" : ""}" data-act="avbase" data-v="auto">Авто</button>` +
    bases.map(a => `<button class="chip ${a.i === AVX.pick.base ? "on" : ""}" data-act="avbase" data-v="${a.i}" ${B.alive(a) ? "" : "disabled"}>${escH(a.n)} · ${B.parkedOf(a, cKey)} шт.</button>`).join("") + `</div>`;
  h += `<div class="note" id="avNote">${avNote(side, cKey)}</div></div>`;
  return h;
}
/* ---- експорт для тестів і мережі ---- */
/* збитий ППО літак групи: група більше не вважає його в польоті (парк зменшує atkCarLost) */
HOOKS.avShot = t => { const G = avB() && avB().grp(t.avia); if (G){ G.air--; G.lost++; } };
HOOKS.avia = { AVX, aviaInit, aviaTick, avLaunch, avKill, avAvail, avDepPick, avPick, AVX_block, avNote, avFire, avReturn, avLand, avLanded };
window.BV_AVIA_API = HOOKS.avia;
