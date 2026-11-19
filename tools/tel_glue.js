/* tel:v1 */
/* ---------- етап 7.66: МОБІЛЬНІ ПУСКОВІ УСТАНОВКИ БАЛІСТИКИ (ядро: 02g_tel.js) ----------
   Балістичні ракети (Іскандер-М, KN-23, С-400, Точка-У; ATACMS, FP-7, FP-9, Сапсан, Вільха-М) пускаються лише з готової ПУ — окремого об'єкта на мапі:
   • модель ПУ під кожен тип ракети; є запас ракет на борту, потім перезарядка; склад сторони обмежений;
   • гравець ставить ПУ в будь-якій точці своєї території й може змінити місце базування (марш + нове розгортання); підготовка до пуску — 10 ігрових хвилин;
   • дальність рахується від справжньої позиції ПУ (раніше — від центру рубежу + його радіус, звідси «поза дальністю» там, де ціль дістається);
   • противник бачить ПУ лише за розвідданими: розвідувальний БпЛА поруч, контрбатарейна РЛС після пуску, спалах пуску (грубо). Дані приходять із затримкою,
     мають рівень достовірності, старіють, а похибка зростає; за туману війни інакше ПУ противника не видно (без туману / в пісочниці — видно все);
   • ПУ можна пошкодити й знищити ударом ракети (вибух ≤ 3,2 км); < 50 % міцності — розгортання повільніше, < 30 % — пуск неможливий;
   • балістика набирає швидкість і висоту поступово (розгін → набір → політ → зниження); висота визначає клас цілі для РЛС;
   • боти мають свої ПУ, після пуску й після виявлення міняють позицію; у «Вільному» режимі й поза боєм діють старі правила.
   Час у модулі — ігрові хвилини (1 с симуляції = 1 хв). Вимкнути: #debug → BV_EVAL("TEL.on=false"). */
const TEL = { sim: null, on: true, pick: null, sel: null, dirty: true, rt: 0, pt: 0, acc: 0, scan: 0, bot: 0, guest: [], open: false, side: "ua", html: "", pop: null, el: null };
const telCore = () => window.BV_TEL;
const telSim = () => TEL.sim || (TEL.sim = telCore().create({ seed: 66001 }));
const telN = (v, d) => (+v).toFixed(d == null ? 1 : d).replace(".", ",");
const telOn = () => !!GAME.on && GAME.mode !== "free" && TEL.on && GAME.phase !== "over";
const telGated = (side, key) => { if (!telOn()) return false; const M = telCore().MODELS[key]; return !!M && M.side === side; };
const telLand = (side, p) => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && (side === "ua" ? canPlaceAD(p) : ruLand(p));
const telRnd = (c, r) => { const a = Math.random() * 6.2832, d = r * Math.sqrt(Math.random()); return offKm(c, Math.sin(a) * d, Math.cos(a) * d); };
const telMine = () => ["ua", "ru"].filter(sd => GAME.ctrl[sd] === "me");
function telReset(){
  TEL.sim = null; TEL.pick = null; TEL.sel = null; TEL.guest = []; TEL.acc = TEL.scan = TEL.bot = 0; TEL.dirty = true; TEL.html = "";
  telPopClose(); telPickBar(false);
}
/* ---------- старт бою: на кожній стороні — по одній готовій ПУ кожного типу в зонах рубежів ---------- */
function telHome(side, key){
  const sites = SITES.filter(s => !s.off && siteSide(s) === side && weaponsFor(s).includes(key) && !(HOOKS.siteDead && HOOKS.siteDead(s)));
  if (!sites.length) return null;
  const s = sites[Math.floor(Math.random() * sites.length)];
  for (let i = 0; i < 25; i++){ const p = telRnd(s.c, Math.max(2, zoneR(s) * 0.7)); if (telLand(side, p)) return p; }
  return telLand(side, s.c) ? s.c.slice() : null;
}
function telStart(){
  telReset(); if (GAME.puppet || !telOn()) return;
  const core = telCore(), sim = telSim();
  for (const sd of ["ua", "ru"]) for (const key of core.keysOf(sd)){
    for (let i = 0; i < core.MODELS[key].start; i++){ const p = telHome(sd, key); if (p) core.place(sim, { key, pos: p, ready: true }); }
  }
}
/* ---------- установки сторони (на господарі — зі стану, у гостя — зі знімка) ---------- */
function telOwn(side){
  if (GAME.puppet) return TEL.guest.filter(g => g.side === side && g.own && g.state !== "destroyed");
  return TEL.sim ? TEL.sim.tels.filter(t => t.side === side && t.state !== "destroyed") : [];
}
const telCanFire = t => t.state === "ready" && t.rounds > 0 && t.hp >= telCore().CFG.disabledBelow;
const telReady = (side, key) => telOwn(side).filter(t => t.key === key && telCanFire(t));
/* план пуску з ПУ: кандидати — готові установки, що дістають ціль; дальність від СПРАВЖНЬОЇ позиції ПУ */
function telPlan(side, key, c, L){
  const core = telCore(), M = core.MODELS[key], W = WEAPONS[key], list = telReady(side, key), out = { cands: [], minNeed: Infinity, cap: 0, msg: null };
  if (!list.length){
    const all = telOwn(side).filter(t => t.key === key), pick = (a, b) => (a && a.state === "ready" ? a : b);
    if (!all.length) out.msg = `Немає ПУ «${M.short}»: розмістіть установку у вікні «ПУ» (кнопка ПУ на мапі) — розгортання ${core.CFG.prepMin} ігрових хв`;
    else {
      const t = all.reduce(pick), ST = { march: "на марші", deploying: `розгортається (ще ≈ ${Math.ceil(t.timer)} хв)`, reloading: `перезаряджається (≈ ${Math.ceil(t.timer)} хв)`, ready: t.hp < core.CFG.disabledBelow ? "пошкоджена" : "без ракет" };
      out.msg = `ПУ «${M.short}» не готова: ${ST[t.state] || t.state}`;
    }
    return out;
  }
  for (const t of list){
    const need = L(t.pos) + (c.spread || 0); out.minNeed = Math.min(out.minNeed, need);
    if (need <= W.km){ out.cands.push({ site: c.site, need, tel: t.id, pt: t.pos.slice() }); out.cap += t.rounds; }
  }
  return out;
}
const telReach = (side, key) => telReady(side, key).map(t => [t.pos[0], t.pos[1], WEAPONS[key].km - 2]);
const telCapOf = (side, key) => telReady(side, key).reduce((a, t) => a + t.rounds, 0);
/* пуск: узяти установку (рекомендовану або будь-яку іншу з кандидатів із ракетами) */
function telTake(cands, id, key){
  const sim = TEL.sim, core = telCore(); if (!sim) return null;
  for (const tid of [id].concat(cands.map(c => c.tel).filter(x => x !== id))){ const t = core.byId(sim, tid); if (t && t.key === key && core.canFire(sim, t)) return t; }
  return null;
}
const telMuzzle = t => offKm(t.pos, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
const telFrom = t => `${telCore().MODELS[t.key].name} · ${t.id}`;
function telRefund(side, key){
  if (stockOf(side, key) !== Infinity) GAME.stock[side][key] = (GAME.stock[side][key] | 0) + 1;
  S7.stockChanged && S7.stockChanged(); TEL.dirty = true;
}
function telFired(t, u){
  const core = telCore(), sim = telSim(), foe = other(t.side), M = core.MODELS[t.key];
  core.fire(sim, t.id); if (u) u.tel = t.id;
  /* спалах пуску бачать засоби раннього попередження противника: грубе місце, середня достовірність */
  if (core.observe(sim, t, foe, { src: "launch", conf: 0.55, err: 2.6, delay: 0.6 }) && GAME.on) sideToast(foe, `Зафіксовано пуск балістичної ракети — ПУ виявлено приблизно (≈ 3 км), перевірте розвідданими`);
  if (GAME.on) sideToast(t.side, `${M.short}: пуск, лишилось ракет на ПУ: ${t.rounds}${t.rounds ? "" : " · перезарядка"} — змініть позицію, ПУ могли виявити`);
  TEL.dirty = true;
}
/* ---------- політ: поступовий розгін і набір висоти ---------- */
const telSpdK = u => telCore().speedK(u.tl, u.L > 0 ? u.s / u.L : 0);
const telAltCls = u => u.tl ? telCore().altClass(telCore().altKm(u.tl, u.L > 0 ? u.s / u.L : 0)) : "high";
function telFlightTxt(u){
  if (!u.tl || u.fall || u.inv) return "";
  const fi = telCore().flightInfo(u.tl, u.L > 0 ? u.s / u.L : 0); if (!fi) return "";
  return ` · ${fi.phase}: висота ${fi.alt < 10 ? telN(fi.alt) : Math.round(fi.alt)} км, ${telN(fi.v / 1000)} км/с (M${telN(fi.mach, 0)})`;
}
/* текст у панелі пуску: звідки летить ракета */
function telPointHtml(plan, key, hasTarget){
  const core = telCore(), M = core.MODELS[key], n = telReady(plan.side, key).length, tot = telOwn(plan.side).filter(t => t.key === key).length;
  if (!n) return `Пуск — лише з мобільної ПУ <b>«${escH(M.short)}»</b>: готових немає${tot ? ` (на мапі: ${tot})` : ""}. Розмістіть установку кнопкою <b>ПУ</b> на мапі — розгортання ${core.CFG.prepMin} ігрових хв.`;
  return `Пуск — з мобільних ПУ <b>«${escH(M.short)}»</b>: готових ${n}, ракет на них ${telCapOf(plan.side, key)}${hasTarget ? ` · у межах дальності ${plan.cands.length} з ${n}` : ""}. Дальність рахується від справжньої позиції установки.`;
}
const telFlightHtml = u => { const t = telFlightTxt(u); return t ? "<br>" + t.replace(/^ · /, "") : ""; };
const telHm = u => u.tl && !u.fall ? Math.max(30, telCore().altKm(u.tl, u.L > 0 ? u.s / u.L : 0) * 1000) : 0;
/* ---------- удар ракети по установці ---------- */
function telStrike(u, sd){
  if (!TEL.sim || !TEL.sim.tels.length) return;
  const core = telCore(), hits = core.blast(TEL.sim, sd, u.pos, wDmg(u.key));
  for (const h of hits){
    const M = core.MODELS[h.tel.key];
    if (h.killed){ gameToast(`${SIDE_N[sd]}: знищено мобільну ПУ «${M.short}»`); sideToast(h.tel.side, `Вашу ПУ «${M.short}» знищено`); if (TEL.sel === h.tel.id) telPopClose(); }
    else { sideToast(sd, `Уражено мобільну ПУ «${M.short}» (міцність ${Math.round(h.tel.hp * 100)} %)`); sideToast(h.tel.side, `ПУ «${M.short}» пошкоджено: ${Math.round(h.tel.hp * 100)} %`); }
  }
  if (hits.length) TEL.dirty = true;
}
/* ---------- розвідка: джерела даних про ПУ противника ---------- */
function telScan(){
  const core = telCore(), sim = TEL.sim; if (!sim || !sim.tels.length) return;
  for (const u of units.values()){                                   // розвідувальний БпЛА поруч (≤ 12 км)
    if (u.kind !== "w" || u.fall || !u.pos || !u.sd) continue;
    const W = WEAPONS[u.key]; if (!W || !W.recon) continue;
    for (const t of sim.tels){
      if (t.side === u.sd || t.state === "destroyed" || core.dist(u.pos, t.pos) > 12) continue;
      if (Math.random() < 0.35 * core.sigOf(sim, t)) core.observe(sim, t, u.sd, { src: "recon", conf: 0.8, err: 0.35, delay: 1.5 });
    }
  }
  if (typeof RAD !== "undefined" && RAD.sim){                        // контрбатарейна РЛС зафіксувала позицію пуску
    for (const sd of ["ua", "ru"]) for (const g of RAD.sim.pic[sd].ground){
      if (g.state === "lost") continue; const gp = radLL(g.x, g.y);
      for (const t of sim.tels){
        if (t.side === sd || t.state === "destroyed" || sim.t - t.lastFire > 4) continue;
        const d = core.dist(gp, t.pos); if (d <= Math.max(2, 3 * (g.sigma || 0.3))) core.observe(sim, t, sd, { src: "cb-radar", conf: Math.min(0.95, Math.max(0.45, g.conf || 0.6)), err: Math.max(0.15, g.sigma || 0.3), delay: 0.5 });
      }
    }
  }
}
/* ---------- боти: власні ПУ, зміна позиції після пуску й після виявлення ---------- */
function telBots(){
  const core = telCore(), sim = TEL.sim; if (!sim) return;
  for (const sd of ["ua", "ru"]){
    if (!BOT[sd]) continue;
    for (const key of core.keysOf(sd)){                              // втрачені установки замінюються зі складу
      if (core.mine(sim, sd, key).length < core.MODELS[key].start + 1 && sim.depot[sd][key] > 0){ const p = telHome(sd, key); if (p) core.place(sim, { key, pos: p }); }
    }
    for (const t of core.mine(sim, sd)){
      if (t.state === "march") continue;
      const seen = core.view(sim, other(sd), t), scoot = t.lastFire > (t.sc || -1) && sim.t - t.lastFire >= 0.5, hunted = seen && seen.level !== "low" && sim.t - (t.sc2 || -1e9) > 12;
      if (!scoot && !hunted) continue;
      const p = telHome(sd, t.key); if (!p) continue;
      if (core.relocate(sim, t.id, p).ok){ if (scoot) t.sc = t.lastFire; if (hunted) t.sc2 = sim.t; }
    }
  }
}
/* ---------- крок ---------- */
function telTick(sd){
  if (!TEL.sim || !GAME.on || GAME.puppet || GAME.phase !== "run") return;
  TEL.acc += sd; if (TEL.acc < 0.5) return;
  const dt = TEL.acc, core = telCore(); TEL.acc = 0;
  for (const e of core.step(TEL.sim, dt * core.CFG.minPerSec)){
    const M = core.MODELS[e.tel ? e.tel.key : e.key];
    if (e.t === "ready") sideToast(e.tel.side, `ПУ «${M.short}» розгорнута — готова до пуску`);
    else if (e.t === "reloaded") sideToast(e.tel.side, `ПУ «${M.short}» перезаряджена`);
    else if (e.t === "resupply") sideToast(e.side, `На склад повернуто ПУ «${M.short}»`);
  }
  TEL.scan += dt; if (TEL.scan >= 1){ TEL.scan = 0; telScan(); }
  TEL.bot += dt; if (TEL.bot >= 4){ TEL.bot = 0; telBots(); }
  TEL.dirty = true;
}
/* ---------- команди (господар / одиночна гра; гість шле їх господарю) ---------- */
function telApply(side, op, p, say){
  const core = telCore(), sim = telSim(), msg = m => { if (say) say(m); return { ok: false, msg: m }; };
  if (!telOn()) return msg("Мобільні ПУ діють лише в бою");
  if (op === "place"){
    const M = core.MODELS[p.key]; if (!M || M.side !== side) return msg("Немає доступу до цієї установки");
    if (!(sim.depot[side][p.key] > 0)) return msg(`Склад: ПУ «${M.short}» немає — знищені повертаються по одній раз на ${Math.round(core.CFG.resupplyMin / 60)} год`);
    if (!telLand(side, p.pos)) return msg(side === "ua" ? "ПУ — лише на вільній території України" : "ПУ — лише на території Росії та в зоні окупації");
    const t = core.place(sim, { key: p.key, pos: p.pos }); TEL.dirty = true;
    return { ok: true, tel: t, msg: `ПУ «${M.short}»: розгортання ${core.CFG.prepMin} ігрових хв` };
  }
  const t = core.byId(sim, p.id); if (!t || t.side !== side || t.state === "destroyed") return msg("Установки немає");
  if (op === "move"){
    if (!telLand(side, p.pos)) return msg(side === "ua" ? "ПУ — лише на вільній території України" : "ПУ — лише на території Росії та в зоні окупації");
    const r = core.relocate(sim, t.id, p.pos); if (!r.ok) return msg(r.msg);
    TEL.dirty = true; return { ok: true, msg: `ПУ «${core.MODELS[t.key].short}»: марш ≈ ${r.eta} хв, потім розгортання ${core.CFG.prepMin} хв` };
  }
  if (op === "recall"){
    if (!core.recall(sim, t.id)) return msg("Згорнути зараз не можна: ПУ щойно вела пуск");
    TEL.dirty = true; if (TEL.sel === p.id) telPopClose(); return { ok: true, msg: "ПУ повернуто на склад" };
  }
  return msg("Невідома команда");
}
function telCmd(sd, p, deny){ if (!p || typeof p.op !== "string") return; const r = telApply(sd, p.op, { key: p.key, id: p.id, pos: Array.isArray(p.pos) ? [+p.pos[0], +p.pos[1]] : null }, deny); if (r.ok && r.msg) deny(r.msg); }
function telDo(side, op, p){
  if (GAME.puppet){ HOOKS.route && HOOKS.route("tel", Object.assign({ op }, p)); return { ok: true }; }
  const r = telApply(side, op, p, toast); if (r.ok && r.msg) toast(r.msg); telPanel(); return r;
}
/* ---------- що видно гравцеві (і що йде гостю) ---------- */
function telDisplayFor(view){
  const core = telCore(), sim = TEL.sim, out = []; if (!sim) return out;
  for (const t of sim.tels){
    const own = view ? t.side === view : false;
    if (view && !own){
      const v = core.view(sim, view, t); if (!v) continue;
      out.push({ id: t.id, key: t.key, side: t.side, pos: v.pos, state: "?", timer: 0, rounds: 0, hp: 1, own: 0, est: 1, err: v.err, level: v.level, age: v.age, moving: v.moving ? 1 : 0, stale: v.stale ? 1 : 0 });
    } else out.push({ id: t.id, key: t.key, side: t.side, pos: t.pos.slice(), dest: t.dest ? t.dest.slice() : null, state: t.state, timer: t.timer, rounds: t.rounds, hp: t.hp, own: own || !view ? 1 : 0, est: 0, err: 0, level: null, age: 0, moving: t.state === "march" ? 1 : 0, stale: 0 });
  }
  return out;
}
const telShown = () => {
  if (GAME.puppet) return TEL.guest;
  const fs = fogSide(); return telDisplayFor(fs);
};
const telWire = view => !telOn() || !TEL.sim ? [] : telDisplayFor(view).map(d => [d.id, d.key, d.side, r5(d.pos[0]), r5(d.pos[1]), d.state, Math.round(d.timer * 10) / 10, d.rounds, Math.round(d.hp * 100) / 100, d.own, d.est, Math.round(d.err * 10) / 10, d.level || 0, Math.round(d.age), d.moving, d.stale, d.dest ? r5(d.dest[0]) : 0, d.dest ? r5(d.dest[1]) : 0]);
const telUnwire = a => ({ id: a[0], key: a[1], side: a[2], pos: [a[3], a[4]], state: a[5], timer: a[6], rounds: a[7], hp: a[8], own: a[9], est: a[10], err: a[11], level: a[12] || null, age: a[13], moving: a[14], stale: a[15], dest: a[16] ? [a[16], a[17]] : null });
/* ---------- карта ---------- */
const TEL_COL = { ua: "#22c3e6", ru: "#ff6b6b" }, TEL_LV = { high: "#ff4d4d", medium: "#ff9a3c", low: "#9aa4b2" };
function telRender(now){
  const map = S7.map; if (!map || !GAME.on || (now - TEL.rt < 250 && !TEL.dirty)) return; TEL.rt = now;
  try {
    if (!map.getSource("telp")){
      if (!map.isStyleLoaded()) return;
      for (const id of ["telz", "tell", "telp"]) map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "telz-f", type: "fill", source: "telz", paint: { "fill-color": ["get", "c"], "fill-opacity": ["get", "o"] } });
      map.addLayer({ id: "telz-l", type: "line", source: "telz", paint: { "line-color": ["get", "c"], "line-width": 1, "line-opacity": 0.75, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "tell-l", type: "line", source: "tell", paint: { "line-color": ["get", "c"], "line-width": 1.6, "line-opacity": 0.8, "line-dasharray": [1, 1.5] } });
      map.addLayer({ id: "telp-c", type: "circle", source: "telp", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-opacity": ["get", "o"], "circle-stroke-color": ["get", "s"], "circle-stroke-width": 2 } });
      map.on("click", "telp-c", e => { if (TEL.pick) return; const f = e.features && e.features[0]; if (f) telPop(String(f.properties.id)); });
      map.on("mouseenter", "telp-c", () => { if (!TEL.pick) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "telp-c", () => { if (!TEL.pick) map.getCanvas().style.cursor = ""; });
      map.on("click", e => {
        if (!TEL.pick) return; const pk = TEL.pick, p = [e.lngLat.lng, e.lngLat.lat], side = pk.side;
        const r = GAME.puppet ? telDo(side, pk.op, { key: pk.key, id: pk.id, pos: p }) : telApply(side, pk.op, { key: pk.key, id: pk.id, pos: p }, toast);
        if (r.ok){ if (r.msg) toast(r.msg); telPickStop(); telPanel(); }
      });
    }
    const pf = [], zf = [], lf = [], list = telShown();
    for (const d of list){
      const M = telCore().MODELS[d.key]; if (!M) continue;
      const col = TEL_COL[d.side] || "#fff";
      if (d.est){
        zf.push({ type: "Feature", properties: { c: TEL_LV[d.level] || "#9aa4b2", o: d.stale ? 0.05 : 0.12 }, geometry: { type: "Polygon", coordinates: [circlePoly(d.pos, Math.max(0.6, d.err), 48)] } });
        pf.push({ type: "Feature", properties: { id: d.id, r: 5, c: col, s: TEL_LV[d.level] || "#9aa4b2", o: d.stale ? 0.35 : 0.8 }, geometry: { type: "Point", coordinates: d.pos } });
        continue;
      }
      const ST = { ready: "#ffffff", deploying: "#ffd23f", march: "#ff9a3c", reloading: "#ffb347", destroyed: "#555" };
      pf.push({ type: "Feature", properties: { id: d.id, r: d.own ? 6.5 : 5.5, c: col, s: d.hp < 0.5 ? "#ff3b3b" : ST[d.state] || "#fff", o: d.state === "ready" ? 1 : 0.6 }, geometry: { type: "Point", coordinates: d.pos } });
      if (d.dest) lf.push({ type: "Feature", properties: { c: col }, geometry: { type: "LineString", coordinates: [d.pos, d.dest] } });
      if (TEL.sel === d.id && d.own) zf.push({ type: "Feature", properties: { c: col, o: 0.03 }, geometry: { type: "Polygon", coordinates: [circlePoly(d.pos, WEAPONS[d.key].km, WEAPONS[d.key].km > 500 ? 160 : 90)] } });
    }
    map.getSource("telz").setData({ type: "FeatureCollection", features: zf });
    map.getSource("tell").setData({ type: "FeatureCollection", features: lf });
    map.getSource("telp").setData({ type: "FeatureCollection", features: pf });
    TEL.dirty = false;
  } catch (e) { /* карта ще не готова */ }
  telUi(now);
}
/* ---------- вікно установки й панель «ПУ» ---------- */
const telBar = (v, c) => `<span class="tel-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${c}"></i></span>`;
function telPopClose(){ if (TEL.pop){ TEL.pop.remove(); TEL.pop = null; } TEL.sel = null; TEL.dirty = true; }
function telPop(id){
  const core = telCore(), d = telShown().find(x => x.id === id); if (!d) return;
  telPopClose(); TEL.sel = id; TEL.dirty = true;
  const M = core.MODELS[d.key], W = WEAPONS[d.key], el = document.createElement("div"); TEL.pop = el; el.className = "tel-pop";
  const mine = !!d.own && telMine().includes(d.side) && !GAME.spec;
  let h = `<b style="color:${TEL_COL[d.side]}">${escH(M.name)}</b> · ${SIDE_N[d.side]}<br>Ракета: ${escH(W.n)} · дальність ${W.km} км · на борту ${M.rounds}`;
  if (d.est) h += `<br>Дані розвідки: <b style="color:${TEL_LV[d.level]}">${core.LEVEL_N[d.level]}</b> · ${d.age < 1 ? "щойно" : "≈ " + Math.round(d.age) + " хв тому"}${d.stale ? " (застарілі)" : ""} · похибка ≈ ${telN(Math.max(0.5, d.err))} км${d.moving ? " · була на марші" : ""}<br><small>Позиція, стан і ракети — невідомі. Удар по цій точці може не влучити.</small>`;
  else h += `<br>Стан: <b>${core.STATE_N[d.state]}</b>${d.timer > 0 ? ` · ще ≈ ${Math.ceil(d.timer)} хв` : ""} · ракет: ${d.rounds}/${M.rounds}<br>Міцність: ${Math.round(d.hp * 100)} % ${telBar(d.hp, d.hp < 0.5 ? "#ff5a3c" : "#4cd964")}${d.hp < core.CFG.disabledBelow ? " — пуск неможливий" : d.hp < core.CFG.slowBelow ? " — розгортання повільніше" : ""}`;
  h += `<div class="tel-btns">` + (mine ? `<button data-e="mv">Змінити місце</button><button data-e="rc">На склад</button>` : "") + `<button data-e="x">×</button></div>`;
  el.innerHTML = h;
  el.querySelectorAll("button").forEach(b => { b.onclick = () => {
    const a = b.dataset.e;
    if (a === "mv"){ telPickStart({ op: "move", id: d.id, side: d.side }); telPopClose(); return; }
    if (a === "rc"){ telDo(d.side, "recall", { id: d.id }); telPopClose(); return; }
    telPopClose(); }; });
  document.body.appendChild(el);
}
function telPickBar(on, txt){
  if (typeof document.getElementById !== "function") return;
  let b = document.getElementById("telPickBar");
  if (!on){ if (b) b.remove(); const m = S7.map; if (m && m.getCanvas) m.getCanvas().style.cursor = ""; return; }
  if (!b){ b = document.createElement("div"); b.id = "telPickBar"; b.className = "tel-pickbar"; document.body.appendChild(b); }
  b.innerHTML = `<span>${escH(txt)}</span><button type="button">Скасувати</button>`; b.querySelector("button").onclick = () => { telPickStop(); telPanel(); };
}
function telPickStart(pk){
  TEL.pick = pk; const M = telCore().MODELS[pk.key || (telShown().find(x => x.id === pk.id) || {}).key];
  telPickBar(true, pk.op === "place" ? `ПУ «${M ? M.short : ""}»: натисніть на мапі, де розгорнути (Esc — скасувати)` : `ПУ «${M ? M.short : ""}»: натисніть на мапі нове місце базування (Esc — скасувати)`);
  const m = S7.map; if (m && m.getCanvas) m.getCanvas().style.cursor = "crosshair"; telPanel();
}
function telPickStop(){ TEL.pick = null; telPickBar(false); telPanel(); }
function telPanelHtml(side){
  const core = telCore(), sim = TEL.sim, own = GAME.puppet ? telOwn(side) : (sim ? sim.tels.filter(t => t.side === side && t.state !== "destroyed") : []);
  const my = telMine(); let h = `<div class="tel-h"><b>Мобільні ПУ · ${SIDE_N[side]}</b>` + (my.length > 1 ? my.map(s => `<button class="tel-chip${s === side ? " on" : ""}" data-tp="side" data-v="${s}">${SIDE_N[s]}</button>`).join("") : "") + `<button class="tel-x" data-tp="close" aria-label="Закрити">×</button></div>`;
  h += `<div class="tel-note">Балістику пускають лише готові ПУ. Розгортання після розміщення чи зміни місця — ${core.CFG.prepMin} ігрових хв. Після пуску ПУ видно ≈ ${core.CFG.exposeMin} хв — змініть позицію.</div>`;
  h += `<div class="tel-sec">Склад і розміщення</div>`;
  for (const k of core.keysOf(side)){
    const M = core.MODELS[k], n = GAME.puppet ? (TEL.depotG && TEL.depotG[k]) | 0 : (sim ? sim.depot[side][k] | 0 : 0), pk = TEL.pick && TEL.pick.op === "place" && TEL.pick.key === k;
    h += `<div class="tel-row"><span class="tn">${escH(M.name)}<small>${escH(WEAPONS[k].n)} · ${WEAPONS[k].km} км · ракет ${M.rounds} · у резерві ${GAME.puppet ? "?" : n}</small></span><button class="tel-b${pk ? " on" : ""}" data-tp="place" data-k="${k}" ${!GAME.puppet && n <= 0 ? "disabled" : ""}>${pk ? "Скасувати" : "Розмістити"}</button></div>`;
  }
  h += `<div class="tel-sec">На мапі · ${own.length}</div>`;
  if (!own.length) h += `<div class="tel-note">Немає розгорнутих ПУ — балістичні пуски неможливі.</div>`;
  for (const t of own){
    const M = core.MODELS[t.key], c = t.state === "ready" ? "#4cd964" : t.state === "march" ? "#ff9a3c" : "#ffd23f", pr = t.state === "deploying" ? 1 - t.timer / core.CFG.prepMin : t.state === "reloading" ? 1 - t.timer / core.CFG.reloadMin : 1;
    h += `<div class="tel-row"><span class="tn">${t.id} · ${escH(M.short)}<small><b style="color:${c}">${core.STATE_N[t.state]}</b>${t.timer > 0 ? ` · ≈ ${Math.ceil(t.timer)} хв` : ""} · ракет ${t.rounds}/${M.rounds} · міцність ${Math.round(t.hp * 100)} %</small>${telBar(pr, c)}</span>` +
      `<span class="tel-ops"><button class="tel-b" data-tp="fly" data-id="${t.id}" title="Показати на мапі">◎</button><button class="tel-b${TEL.pick && TEL.pick.id === t.id ? " on" : ""}" data-tp="move" data-id="${t.id}" title="Змінити місце базування">↔</button><button class="tel-b" data-tp="recall" data-id="${t.id}" title="Згорнути на склад">⤓</button></span></div>`;
  }
  const foe = other(side), est = telShown().filter(d => d.est && d.side === foe);
  h += `<div class="tel-sec">Розвіддані про ПУ противника · ${est.length}</div>`;
  h += est.length ? est.map(d => `<div class="tel-row"><span class="tn">${escH(telCore().MODELS[d.key].short)}<small style="color:${TEL_LV[d.level]}">${telCore().LEVEL_N[d.level]} · ${d.age < 1 ? "щойно" : Math.round(d.age) + " хв тому"} · ±${telN(Math.max(0.5, d.err))} км${d.stale ? " · застаріло" : ""}</small></span><button class="tel-b" data-tp="fly" data-id="${d.id}">◎</button></div>`).join("") : `<div class="tel-note">Нічого не відомо. Джерела: розвідувальний БпЛА поруч (до 12 км), контрбатарейна РЛС після пуску, спалах пуску (грубо). Дані приходять із затримкою й старіють.</div>`;
  return h;
}
function telPanel(){ TEL.html = ""; telUi(performance.now(), true); }
function telUi(now, force){
  if (typeof document.createElement !== "function" || !document.body) return;
  const on = telOn() && !GAME.spec && telMine().length > 0;
  let fab = document.getElementById("telFab");
  if (!on){ if (fab) fab.style.display = "none"; const pn = document.getElementById("telPanel"); if (pn) pn.style.display = "none"; return; }
  if (!fab){
    fab = document.createElement("button"); fab.id = "telFab"; fab.className = "tel-fab"; fab.type = "button"; fab.textContent = "ПУ"; fab.title = "Мобільні пускові установки балістики";
    fab.onclick = () => { TEL.open = !TEL.open; telPanel(); }; document.body.appendChild(fab);
  }
  fab.style.display = "";
  let pn = document.getElementById("telPanel");
  if (!pn){
    pn = document.createElement("div"); pn.id = "telPanel"; pn.className = "tel-panel"; document.body.appendChild(pn);
    pn.addEventListener("click", e => {
      const b = e.target.closest("[data-tp]"); if (!b) return; const a = b.dataset.tp, side = TEL.side;
      if (a === "close"){ TEL.open = false; telPickStop(); return; }
      if (a === "side"){ TEL.side = b.dataset.v; return telPanel(); }
      if (a === "place"){ if (TEL.pick && TEL.pick.op === "place" && TEL.pick.key === b.dataset.k) return telPickStop(); return telPickStart({ op: "place", key: b.dataset.k, side }); }
      if (a === "move"){ if (TEL.pick && TEL.pick.id === b.dataset.id) return telPickStop(); return telPickStart({ op: "move", id: b.dataset.id, side }); }
      if (a === "recall") { telDo(side, "recall", { id: b.dataset.id }); return; }
      if (a === "fly"){ const d = telShown().find(x => x.id === b.dataset.id), m = S7.map; if (d && m){ m.easeTo({ center: d.pos, zoom: Math.max(m.getZoom(), 6), duration: 700 }); telPop(d.id); } }
    });
  }
  const mine = telMine(); if (!mine.includes(TEL.side)) TEL.side = mine[0];
  pn.style.display = TEL.open ? "" : "none"; fab.classList.toggle("on", TEL.open);
  if (!TEL.open) return;
  if (force || now - TEL.pt > 1000){ TEL.pt = now; const h = telPanelHtml(TEL.side); if (h !== TEL.html){ TEL.html = h; pn.innerHTML = h; } }
}
window.BV_TEL_API = { TEL, sim: telSim, start: telStart, reset: telReset, tick: telTick, plan: telPlan, gated: telGated, ready: telReady, take: telTake, fired: telFired, strike: telStrike, scan: telScan, bots: telBots, apply: telApply, shown: telShown, wire: telWire, unwire: telUnwire, reach: telReach, capOf: telCapOf, spdK: telSpdK, altCls: telAltCls, flightTxt: telFlightTxt, panelHtml: telPanelHtml, home: telHome, pointHtml: telPointHtml, flightHtml: telFlightHtml, hm: telHm };
