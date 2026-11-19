/* fog:v1 */
/* ---------- етап 7.60: ТУМАН ВІЙНИ (ядро: 02e_fog.js + РЛС 02c_radar.js) ----------
   Гравець бачить противника лише через власну розвідувальну картину. Три джерела:
   1) РЛС (BV_RADAR): пуски БпЛА, ракети й авіація (літаки, вертольоти, носії). Контакт проходить стани попередній → виявлено → супровід → ідентифіковано,
      дані йдуть каналом із затримкою (РЕБ COM її збільшує/рве канал), втрачений контакт лишається «привидом» на останній позиції й зникає;
   2) розвідники (BV_FOG.sense): розвідувальні БпЛА (Орлан-10, ZALA, Supercam), камери тактичних БпЛА, літаки, вертольоти, кораблі шукають
      наземні об'єкти противника — РЛС, ППО, РЕБ, кораблі, транспорт: спершу «щось є» (невідомий тип), після спостереження — «ідентифіковано»;
   3) РЕР (станції РЕБ з `el`): виявлена випромінююча РЛС/РЕБ потрапляє в картину стороною-спостерігачем із затримкою каналу.
   Усе, чого немає в картині, не малюється: ні спрайти, ні сліди, ні кола дальності, ні тривоги, ні пуски зенітних ракет.
   ППО (усі типи, включно з гарматами й літаками-перехоплювачами) отримує цілі лише з картини РЛС своєї сторони: немає контакту з якістю
   «супровід» → ціль не обстрілюється. Картини сторін незалежні; бот і людина грають за однаковими правилами.
   Мережа: власник кімнати шле кожній стороні знімок, відфільтрований її картиною (+ список контактів `F`); гість нічого зайвого не отримує. */
var FOG = { sim: null, acc: 0, all: { ua: new Map(), ru: new Map() }, elT: new Map(), warned: false, guest: { side: null, list: [] },
  idT: new Map(), hit: [], c: null, g: null, W: 0, H: 0, dpr: 1, raf: 0, empty: true, popEl: null, popId: null, tick: 0 };
const fogCore = () => window.BV_FOG;
function fogSim(){ return FOG.sim || (FOG.sim = fogCore().create({ seed: 60777 })); }
function fogReset(){
  FOG.sim = null; FOG.all.ua.clear(); FOG.all.ru.clear(); FOG.elT.clear(); FOG.idT.clear(); FOG.warned = false; FOG.guest = { side: null, list: [] }; FOG.acc = 0; FOG.hit = [];
  if (FOG.popEl){ FOG.popEl.remove(); FOG.popEl = null; FOG.popId = null; }
}
const fogLive = () => !!(GAME.on && GAME.fog);
/* сторона, чиїми очима гравець дивиться; null — бог-режим (пісочниця, глядач, туман вимкнено) */
function fogSide(){
  if (!GAME.on || !GAME.fog || GAME.spec) return null;
  const a = GAME.ctrl.ua === "me", b = GAME.ctrl.ru === "me";
  return a && !b ? "ua" : b && !a ? "ru" : null;
}
const fogDefault = () => (GAME.ctrl.ua === "me") !== (GAME.ctrl.ru === "me");
const FOG_COARSE = { missile: "ракета", aircraft: "літак", helicopter: "вертоліт", uav: "БпЛА" };
const FOG_KIND_N = { r: "РЛС", e: "РЕБ", a: "ППО", s: "корабель", v: "транспорт", x: "об'єкт" };
const FOG_ST_N = { preliminary: "попередній", detected: "виявлено", tracking: "супровід", identified: "ідентифіковано", lost: "втрачено" };
const FOG_COL = { preliminary: "#9aa4b2", detected: "#ffd23f", tracking: "#ff9a3c", identified: "#ff4d4d", lost: "#6b7280" };
const FOG_ID_SEC = 2;      // с «ідентифікації» (знак «?») від моменту, коли контакт став супроводом, до появи спрайта
const fogBrg = (vx, vy) => ((Math.atan2(vx, vy) / D2R) % 360 + 360) % 360;

/* ---------- індекс повітряної картини: id цілі → контакт сторони ---------- */
function fogAirIndex(){
  const sim = RAD.sim;
  for (const sd of ["ua", "ru"]){
    const M = FOG.all[sd]; M.clear(); if (!sim) continue;
    for (const c of sim.pic[sd].air){
      if ((c.state === "tracking" || c.state === "identified") && !FOG.idT.has(c.id)) FOG.idT.set(c.id, sim.t);
      if (c._ref == null) continue;
      const o = M.get(c._ref);
      if (!o || (o.state === "lost" && c.state !== "lost") || (c.state !== "lost" && c.conf > o.conf)) M.set(c._ref, c);
    }
  }
}
/* контакт «розпізнано»: радар ідентифікував його або супровід триває FOG_ID_SEC секунд */
function fogIdentC(c){
  if (c.state === "identified") return true;
  if (c.state !== "tracking") return false;
  const t0 = FOG.idT.get(c.id); return t0 != null && RAD.sim.t - t0 >= FOG_ID_SEC;
}
function fogAirView(sd, ref){
  const c = FOG.all[sd].get(ref), sim = RAD.sim; if (!c || !sim) return null;
  const age = Math.max(0, sim.t - c.lastUpdatedAt), ex = Math.min(age, c.state === "lost" ? 20 : 30), sp = Math.hypot(c.vx, c.vy);
  return { c, state: fogIdentC(c) ? "identified" : c.state, conf: c.conf, age, ll: radLL(c.x + c.vx * ex, c.y + c.vy * ex), hdg: c.hasV && sp > 0.02 ? fogBrg(c.vx, c.vy) : null, spd: sp, sigma: c.sigma + age * 0.05 };
}
/* контакт-«привид» (втрачений) або невпізнаний не малює спрайт — його малює полотно контактів */
function fogUnitSprite(fs, u){
  if (GAME.puppet) return { pos: u.pos, hdg: u.hdg };                       // гість: власник уже відфільтрував знімок
  if (u.kind === "t"){
    const v = fogCore().view(fogSim(), fs, "v" + u.id); if (!v || v.lost || v.rank !== "identified") return null;
    return { pos: radLL(v.x, v.y), hdg: u.hdg };
  }
  const v = fogAirView(fs, u.id); if (!v || v.state !== "identified") return null;
  return { pos: v.ll, hdg: v.hdg == null ? u.hdg : v.hdg };
}
function fogAdSprite(fs, a){
  if (GAME.puppet) return { pos: a.pos, hdg: a.hdg };
  const T = AD_TYPES[a.key]; if (!T) return null;
  if (T.air){ const v = fogAirView(fs, "a" + a.id); if (!v || v.state !== "identified") return null; return { pos: v.ll, hdg: v.hdg == null ? a.hdg : v.hdg }; }
  const v = fogCore().view(fogSim(), fs, (T.ship ? "s" : "a") + a.id); if (!v || v.lost || v.rank !== "identified") return null;
  return { pos: radLL(v.x, v.y), hdg: a.hdg };
}
function fogFollowPos(u){ const fs = fogSide(); if (!fs || !u.sd || u.sd === fs) return null; const fv = fogUnitSprite(fs, u); return fv ? fv.pos : null; }
/* чи є в сторони «фіксація» об'єкта (для удару по виявленій станції): РЕР або розвідник, дані не втрачені */
function fogHasFix(sd, key){ return fogLive() && fogCore().knows(fogSim(), sd, key, "identified"); }
/* чи видно ворожу РЛС/РЕБ на мапі: РЕР, а в режимі туману — лише з картини (із затримкою й старінням) */
function fogStationVisible(me, key, seenUntil){
  if (!fogLive()) return seenUntil > SIM.t;
  return fogCore().knows(fogSim(), me, key, "identified");
}
/* стрілянина зенітних засобів противника видна, лише якщо відомий сам стрілець */
function fogShooterKnown(fs, id){
  const a = ADS.units.get(id); if (!a) return false;
  if (GAME.puppet) return true;
  const T = AD_TYPES[a.key]; if (!T) return false;
  if (T.air){ const v = fogAirView(fs, "a" + a.id); return !!v && v.state !== "lost"; }
  return fogCore().knows(fogSim(), fs, (T.ship ? "s" : "a") + a.id);
}
function fogShotOk(s){
  const fs = fogSide(); if (!fs || s.sd === fs || GAME.puppet) return true;
  return fogShooterKnown(fs, s.from);
}
function fogRoundOk(r){
  const fs = fogSide(); if (!fs || GAME.puppet) return true;
  const a = ADS.units.get(r.from); if (!a || (a.side || "ua") === fs) return true;
  return fogShooterKnown(fs, r.from);
}
function fogFxOk(u){ const fs = fogSide(); return !fs || GAME.puppet || !u || (u.side || "ua") === fs || fogShooterKnown(fs, u.id); }

/* ---------- ППО: цілі лише з картини РЛС ---------- */
function fogAdSkip(u, T, t){
  const sd = u.side || "ua", sim = RAD.sim; if (!sim || !t) return true;
  const c = RAD.lock.get(sd + ":" + t.id); if (!c) return true;
  const age = sim.t - c.lastUpdatedAt, rank = c.state === "identified" ? 4 : c.state === "tracking" ? 3 : 2, r = (T && T.r) || 10;
  const sg = r >= 20 ? Math.max(0.6, 0.03 * r) : Math.max(1.2, 0.35 * r);        // близька ППО приймає й грубіше цілевказання (останні кілометри — власними засобами)
  return !(rank >= 3 && c.conf >= 0.6 && c.sigma <= sg && age <= Math.max(8, c.ttl * 0.6));
}
function fogLostCue(u, t){ return t.id !== u.atk && !!HOOKS.adSkip && HOOKS.adSkip(u, AD_TYPES[u.key], t); }

/* ---------- датчики-розвідники ---------- */
function fogPlatforms(){
  const out = [];
  for (const u of units.values()){
    if (u.kind !== "w" || u.fall || u.sea || !u.pos || u.wait > 0) continue;
    const W = WEAPONS[u.key]; if (!W) continue;
    let cls = null;
    if (W.recon) cls = "recon_uav"; else if (W.ad === "tac" && !W.glide && !W.child) cls = "tac_drone";
    if (!cls) continue;
    const q = radXY(u.pos); out.push({ id: "u" + u.id, cls, side: u.sd || "ru", x: q.x, y: q.y, ll: u.pos, lk: "LINK" });
  }
  for (const a of ADS.units.values()){
    const T = AD_TYPES[a.key]; if (!T) continue;
    let cls = null;
    if (T.air){ if (a.state === "base" || a.state === "reload") continue; cls = T.heli ? "heli" : "jet"; } else if (T.ship) cls = "ship";
    if (!cls) continue;
    const q = radXY(a.pos); out.push({ id: "p" + a.id, cls, side: a.side || "ua", x: q.x, y: q.y, ll: a.pos, lk: "COM" });
  }
  return out;
}
function fogTargets(){
  const tg = [];
  for (const a of ADS.units.values()){
    const T = AD_TYPES[a.key]; if (!T || T.air) continue;
    const q = radXY(a.pos), vis = T.ship ? 1 : a.state === "move" ? 1 : T.gun ? 0.55 : 0.75;
    tg.push({ key: (T.ship ? "s" : "a") + a.id, kind: T.ship ? "s" : "a", x: q.x, y: q.y, side: a.side || "ua", vis, tag: a.key });
  }
  if (RAD.sim) for (const st of RAD.sim.stations){
    const m = RAD.meta.get(st.id); if (!m || st.destroyed) continue;
    const q = radXY(m.c), emit = st.status === "working" || st.status === "damaged";
    tg.push({ key: "r" + st.id, kind: "r", x: q.x, y: q.y, side: m.side, vis: emit ? 1 : 0.35, tag: st.type });
  }
  for (const s of EW.st){
    if (!s.alive) continue;
    const q = radXY(s.c); tg.push({ key: "e" + s.id, kind: "e", x: q.x, y: q.y, side: s.side, vis: ewActive(s) ? 0.7 : 0.3, tag: s.key });
  }
  for (const u of units.values()){
    if (u.kind !== "t" || !u.pos || !u.sd) continue;
    const q = radXY(u.pos); tg.push({ key: "v" + u.id, kind: "v", x: q.x, y: q.y, side: u.sd, vis: 0.6, tag: u.key });
  }
  return tg;
}
function fogLink(pl){
  const S = fogCore().SENS[pl.cls], foe = other(pl.side), j = EW.st.length ? ewE(foe, pl.lk, pl.ll) : 0;
  return { up: j < 0.85, latency: S.lat * (1 + 4 * j) };                        // РЕБ рве канал розвідника або збільшує затримку
}
function fogSense(dt){
  const F = fogCore(), fog = fogSim(), pls = fogPlatforms(), tg = fogTargets();
  const alive = new Set(tg.map(t => t.key));
  for (const pl of pls) F.sense(fog, pl.side, pl, tg, { link: fogLink }, dt);
  /* негативне спостереження: розвідник дивиться в район контакту, а об'єкта там уже нема — контакт знято */
  for (const sd of ["ua", "ru"]){
    for (const v of F.list(fog, sd)){
      if (alive.has(v.key)) continue;
      for (const pl of pls){ if (pl.side === sd && F.covers(pl, v.x, v.y)){ F.clear(fog, sd, v.key); break; } }
    }
  }
}
/* РЕР: випромінююча станція, виявлена станцією РЕБ противника, потрапляє в картину спостерігача (із затримкою каналу) */
function fogElint(){
  const F = fogCore(), fog = fogSim();
  const emit = (key, kind, c, tag, side, seen) => {
    const foe = other(side);
    if (!(seen[foe] > SIM.t)) return;
    const k = foe + key, last = FOG.elT.get(k);
    if (last != null && SIM.t - last < 4) return;
    FOG.elT.set(k, SIM.t);
    const q = radXY(c);
    F.observe(fog, foe, { key, kind, x: q.x, y: q.y, sigma: 0.6, state: "identified", tag, conf: 0.85, src: "elint" }, { up: true, latency: 4 });
  };
  for (const s of EW.st) if (s.alive) emit("e" + s.id, "e", s.c, s.key, s.side, s.seen);
  if (RAD.sim) for (const st of RAD.sim.stations){ const m = RAD.meta.get(st.id); if (m && !st.destroyed) emit("r" + st.id, "r", m.c, st.type, m.side, m.seen); }
}
function fogTick(sd){
  if (!GAME.on || GAME.puppet || !GAME.fog) return;
  FOG.acc += sd; if (FOG.acc < 0.2) return;      // 5 Гц (було 2 Гц), як і РЛС
  const dt = FOG.acc; FOG.acc = 0;
  fogAirIndex();
  fogSense(dt); fogElint(); fogCore().step(fogSim(), dt);
  FOG.tick++; ADS.dirty = true; RAD.dirty = true; EW.dirty = true;
  const fs = fogSide();
  if (!FOG.warned && fs && GAME.phase === "run"){
    FOG.warned = true;
    gameToast("Туман війни: противника видно лише через ваші РЛС і розвідку. ППО отримує цілі тільки від РЛС — розмістіть станції (вкладка «РЛС» у панелі ППО).");
  }
}
function fogStart(){ GAME.fog = fogDefault(); FOG.warned = false; }

/* ---------- сигнали для вже наявних систем ---------- */
/* тривоги: область отримує сигнал лише про цілі, виявлені РЛС тієї сторони, що обороняється */
function fogKnownThreat(tside, u){
  const c = FOG.all[tside].get(u.id); return !!c && c.state !== "lost" && c.state !== "preliminary";
}

/* ---------- контакти для полотна й мережі ---------- */
function fogRefName(ref){
  if (typeof ref === "string" && ref.charAt(0) === "a"){ const a = ADS.units.get(+ref.slice(1)), T = a && AD_TYPES[a.key]; return T ? T.n : null; }
  const u = units.get(ref); if (!u) return null;
  return u.kind === "w" ? (WEAPONS[u.key] || {}).n || null : u.kind === "c" ? (CARRIERS[u.key] || {}).n || null : null;
}
function fogTagName(v){
  if (!v.tag) return null;
  if (v.kind === "r"){ const t = radBV().BYID[v.tag]; return t ? t.name : null; }
  if (v.kind === "e"){ const t = EWSYS[v.tag]; return t ? t.n : null; }
  if (v.kind === "a" || v.kind === "s"){ const t = AD_TYPES[v.tag]; return t ? t.n : null; }
  if (v.kind === "v") return ({ train: "Потяг", truck: "Вантажівка", tanker: "Танкер" })[v.tag] || null;
  return null;
}
/* картина сторони fs у нейтральному вигляді (те саме йде гостю) */
function fogContacts(fs){
  const out = [], sim = RAD.sim;
  if (sim) for (const c of sim.pic[fs].air){
    const age = Math.max(0, sim.t - c.lastUpdatedAt), ex = Math.min(age, c.state === "lost" ? 20 : 30), sp = Math.hypot(c.vx, c.vy);
    out.push({ k: "air", id: c.id, st: fogIdentC(c) ? "identified" : c.state, conf: c.conf, age, ll: radLL(c.x + c.vx * ex, c.y + c.vy * ex), hdg: c.hasV && sp > 0.02 ? fogBrg(c.vx, c.vy) : null, spd: sp,
      sig: c.sigma + age * 0.05, cat: c.cat ? (FOG_COARSE[c.cat] || FOG_COARSE[(radBV().CAT[c.cat] || {}).coarse] || null) : null,
      nm: fogIdentC(c) ? fogRefName(c._ref) : null, dl: sim.cfg.baseLatencySec, n: Object.keys(c.src).length });
  }
  const F = fogCore();
  for (const v of F.list(fogSim(), fs)){
    out.push({ k: "gnd", id: v.key, st: v.lost ? "lost" : v.rank === "identified" ? "identified" : "detected", conf: v.conf, age: v.age, ll: radLL(v.x, v.y), hdg: null, spd: Math.hypot(v.vx, v.vy),
      sig: v.sigma, cat: FOG_KIND_N[v.kind] || FOG_KIND_N.x, nm: fogTagName(v), dl: v.delay, n: v.srcs.length, stale: v.stale ? 1 : 0, kd: v.kind });
  }
  return out;
}
const fogWire = d => [d.k === "air" ? 0 : 1, d.id, d.st, Math.round(d.conf * 100) / 100, Math.round(d.age), r5(d.ll[0]), r5(d.ll[1]), d.hdg == null ? -1 : Math.round(d.hdg), Math.round(d.spd * 100) / 100,
  Math.round(d.sig * 100) / 100, d.cat || 0, d.nm || 0, Math.round(d.dl * 10) / 10, d.n || 0, d.stale || 0, d.kd || 0];
const fogUnwire = a => ({ k: a[0] ? "gnd" : "air", id: a[1], st: a[2], conf: a[3], age: a[4], ll: [a[5], a[6]], hdg: a[7] < 0 ? null : a[7], spd: a[8], sig: a[9], cat: a[10] || null, nm: a[11] || null, dl: a[12], n: a[13], stale: a[14], kd: a[15] || null });
function fogView(){ const fs = fogSide(); if (!fs) return []; return GAME.puppet ? FOG.guest.list.map(fogUnwire) : fogContacts(fs); }

/* ---------- полотно контактів ---------- */
function fogvisInit(map){
  if (FOG.c) return;
  const c = document.createElement("canvas"); c.id = "fogLayer"; c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
  const host = map.getCanvasContainer(), fx = document.getElementById("fxLayer"); if (fx && fx.parentNode === host) host.insertBefore(c, fx); else host.appendChild(c);
  FOG.c = c; FOG.g = c.getContext("2d");
  const resize = () => { const el = map.getContainer(); FOG.W = el.clientWidth; FOG.H = el.clientHeight; FOG.dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(FOG.W * FOG.dpr); c.height = Math.round(FOG.H * FOG.dpr); FOG.empty = false; };
  resize(); window.addEventListener("resize", resize); map.on("resize", resize);
  map.on("move", () => fogvisDraw(performance.now()));
  map.on("click", e => {
    if (RAD.pick || EW.pick || !FOG.hit.length) return;
    let best = null, bd = 1e9;
    for (const h of FOG.hit){ const d = Math.hypot(h.x - e.point.x, h.y - e.point.y); if (d <= h.r && d < bd){ bd = d; best = h; } }
    if (best) fogPop(best.d);
  });
  const loop = now => { FOG.raf = requestAnimationFrame(loop); if (!document.hidden){ try { fogvisDraw(now); } catch (e) { /* кадр пропущено */ } } };
  FOG.raf = requestAnimationFrame(loop);
}
function fogDiamond(g, x, y, r){ g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
function fogvisDraw(now){
  const g = FOG.g, map = S7.map; if (!g || !map) return;
  const fs = fogSide(), V = FOG;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, V.c.width, V.c.height); V.hit = [];
  if (!fs) return;
  g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  const zoom = map.getZoom(), list = fogView();
  const mpp = lat => 78271.52 * Math.cos(lat * D2R) / Math.pow(2, zoom);
  g.textAlign = "center"; g.font = "600 10px system-ui,sans-serif";
  for (const d of list){
    const p = map.project(d.ll), x = p.x, y = p.y;
    if (x < -40 || y < -40 || x > V.W + 40 || y > V.H + 40) continue;
    const live = d.st !== "lost", spriteLive = live && d.st === "identified" && (d.k === "air" || d.kd === "a" || d.kd === "s" || d.kd === "v" || (d.kd === "r" || d.kd === "e") && !GAME.puppet);
    if (spriteLive) continue;                                                     // живий ідентифікований об'єкт малюється власним спрайтом
    const col = FOG_COL[d.st] || "#9aa4b2", a = d.st === "lost" ? Math.max(0.12, 0.5 * (1 - Math.min(1, d.age / 120))) : Math.max(0.35, Math.min(1, 0.3 + d.conf * 0.8)) * (d.stale ? 0.6 : 1);
    g.globalAlpha = a; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.6;
    const sr = d.sig * 1000 / mpp(d.ll[1]);                                         // невизначеність позиції, px
    if (sr > 9 && d.st !== "identified" && d.st !== "lost"){ g.globalAlpha = a * 0.5; g.setLineDash([3, 4]); g.beginPath(); g.arc(x, y, Math.min(sr, 120), 0, 6.2832); g.stroke(); g.setLineDash([]); g.globalAlpha = a; }
    const r = d.st === "preliminary" ? 4 : d.st === "detected" ? 6 : 8;
    if (d.st === "lost") g.setLineDash([2, 3]);
    if (d.k === "air"){ fogDiamond(g, x, y, r); } else { g.beginPath(); g.rect(x - r, y - r, 2 * r, 2 * r); }
    if (d.st === "preliminary" || d.st === "lost"){ g.stroke(); } else { g.globalAlpha = a * 0.28; g.fill(); g.globalAlpha = a; g.stroke(); }
    g.setLineDash([]);
    if (d.k === "air" && d.hdg != null && d.spd > 0.05 && d.st !== "lost"){                    // вектор руху: куди долетить за ~25 с
      const L = Math.min(60, Math.max(10, d.spd * 25 * 1000 / mpp(d.ll[1]))), h = d.hdg * D2R;
      g.beginPath(); g.moveTo(x + Math.sin(h) * r, y - Math.cos(h) * r); g.lineTo(x + Math.sin(h) * (r + L), y - Math.cos(h) * (r + L)); g.stroke();
    }
    g.fillStyle = col; g.globalAlpha = Math.min(1, a + 0.15);
    let lbl = d.st === "lost" ? "−" + Math.round(d.age) + " с" : d.st === "tracking" || d.st === "identified" ? (d.st === "tracking" && d.k === "air" ? "? " + (d.cat || "ціль") : (d.nm || d.cat || "")) : "?";
    if (d.st === "identified" && d.k === "gnd" && d.nm) lbl = d.nm + (d.stale ? " · " + Math.round(d.age) + " с" : "");
    if (d.st === "lost" && d.nm) lbl = d.nm + " " + lbl;
    if (lbl && zoom >= 3.5) g.fillText(lbl, x, y - r - 5);
    V.hit.push({ x, y, r: Math.max(12, r + 6), d });
  }
  g.globalAlpha = 1;
}
/* вікно контакту (клік по відмітці) */
function fogPop(d){
  if (FOG.popEl){ FOG.popEl.remove(); FOG.popEl = null; }
  const el = document.createElement("div"); FOG.popEl = el; FOG.popId = d.id;
  el.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;max-width:340px;padding:12px 14px;background:rgba(14,17,22,.96);border:1px solid rgba(255,154,60,.5);color:#e8eaee;font:12px/1.45 system-ui,sans-serif;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.6)";
  const T = d.nm || d.cat || (d.k === "air" ? "Повітряна ціль" : "Невідомий об'єкт");
  el.innerHTML = `<b style="color:${FOG_COL[d.st]}">${escH(T)}</b> · ${escH(FOG_ST_N[d.st] || d.st)}<br>Впевненість ${Math.round(d.conf * 100)}% · похибка ≈ ${d.sig < 1 ? Math.round(d.sig * 1000) + " м" : d.sig.toFixed(1) + " км"}<br>` +
    `Вік даних: <b>${Math.round(d.age)} с</b>${d.stale ? " · застарілі" : ""} · затримка передачі ≈ ${(d.dl || 0).toFixed(1)} с${d.n ? " · джерел: " + d.n : ""}` +
    (d.spd > 0.02 ? `<br>Швидкість ≈ ${Math.round(d.spd * 3600)} км/год${d.hdg != null ? " · курс " + Math.round(d.hdg) + "°" : ""}` : "") +
    (d.st === "lost" ? `<br><span style="color:#9aa4b2">Контакт втрачено — показано останню відому позицію</span>` : "") +
    `<div style="margin-top:8px"><button style="padding:5px 10px;background:#1b2029;color:#e8eaee;border:1px solid rgba(255,154,60,.4);border-radius:5px;cursor:pointer;font:12px system-ui">×</button></div>`;
  el.querySelector("button").onclick = () => { el.remove(); FOG.popEl = null; FOG.popId = null; };
  document.body.appendChild(el);
}
/* спрощене вікно ворожого спрайта (немає ні «Пуск», ні «Ціль» — вони розвідці невідомі) */
function fogUnitPopHtml(u){
  const fs = fogSide(), ua = u.sd === "ua", v = GAME.puppet ? null : fogAirView(fs, u.kind === "t" ? "v" + u.id : u.id);
  const name = u.kind === "w" ? (WEAPONS[u.key] || {}).n : u.kind === "c" ? (CARRIERS[u.key] || {}).n : ({ train: "Потяг", truck: "Вантажівка", tanker: "Танкер" })[u.key] || "Транспорт";
  const W = u.kind === "w" ? WEAPONS[u.key] : null;
  return `<div class="pp-t" style="color:${ua ? "#9fcbff" : "#ff8e8e"}">${escH(name || "Ціль")}</div><div class="pp-k"><span>${ua ? "Україна" : "Росія"} · ${escH(W ? W.type : "ідентифіковано")}</span></div>` +
    `<div class="pp-d">Дані розвідки${v ? ` · впевненість ${Math.round(v.conf * 100)}% · вік ${Math.round(v.age)} с` : ""}${v && v.spd > 0.02 ? `<br>Швидкість ≈ ${Math.round(v.spd * 3600)} км/год${v.hdg != null ? " · курс " + Math.round(v.hdg) + "°" : ""}` : ""}<br>Звідки й куди летить — невідомо</div>`;
}

/* ---------- панель: стан розвідки й перемикач ---------- */
function fogStatsHtml(side){
  if (!fogLive()) return `<div class="note">Туман війни вимкнено — на мапі видно все.</div>`;
  const F = fogCore(), st = F.stats(fogSim(), side), sim = RAD.sim, nAir = sim ? sim.pic[side].air.filter(c => c.state !== "lost").length : 0, net = RAD.net[side] | 0;
  const blind = !(net > 0);
  return `<div class="note">${blind ? `<b style="color:#ff6b6b">Немає жодної РЛС — ППО не отримує цілей.</b> ` : ""}Повітряних контактів: <b>${nAir}</b> · наземних об'єктів: <b>${st.detected + st.identified}</b> ` +
    `(ідентифіковано ${st.identified}, застарілих ${st.stale}, втрачених ${st.lost}) · затримка розвідданих ≈ ${st.delay.toFixed(1)} с.</div>`;
}
/* fog:end */
