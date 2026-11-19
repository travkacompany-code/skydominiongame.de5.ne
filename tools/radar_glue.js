/* ---------- етап 7.55: РЛС (ядро: 02c_radar.js) — станції, контакти, зв'язок з РЕБ і ППО ----------
   Станції обох сторін ставляться з панелі «РЛС» (безкоштовно, як РЕБ). Кожна оглядова станція періодично сканує повітряні цілі
   (units kind "w") і будує контакти: попередній → виявлено → супровід → ідентифіковано → втрачено. Дані йдуть на КП стороною каналу зв'язку
   і зливаються у спільну картину. Контрбатарейні РЛС реагують на пуски ракет з землі (tochka / atacms / iskander / fp-7 / fp-9).
   З РЕБ: шар RADAR глушить виявлення, шар COM рве канал до КП, станція-випромінювач видима РЕР (el) і її можна вразити після виявлення.
   З ППО: ЗРК (r ≥ 20 км, не гармати) б'ють по цілі лише за «захопленням» — контакт у спільній картині з достатньою якістю
   (якщо в сторони є хоч одна станція); зблизька (≤ 10 км) — власними засобами. Сторона без станцій грає за класичними правилами. */
var RAD = { sim: null, meta: new Map(), open: false, pick: null, side: "ua", acc: 0, rt: 0, pt: 0, dirty: true, need: true, uid: 1, net: { ua: 0, ru: 0 }, lock: new Map(), seenL: new Set(), noted: new Set(), sel: null };
const RAD_LON0 = 32;
const RAD_HP = { strategic: 5, surveillance: 3, low_altitude: 2, multifunction: 3, counter_battery: 2 };
const RAD_CLS_N = { strategic: "стратегічна", surveillance: "оглядова", low_altitude: "малі висоти", multifunction: "багатофункціональна", counter_battery: "контрбатарейна" };
const RAD_CB_KEYS = { tochka: 1, atacms: 1, iskander: 1, fp7: 1, fp9: 1 };
const RAD_ST_COL = { preliminary: "#9aa4b2", detected: "#ffd23f", tracking: "#ff9a3c", identified: "#ff4d4d", lost: "#6b7280" };
const radXY = p => ({ x: (p[0] - RAD_LON0) * 111.32 * Math.cos(p[1] * D2R), y: p[1] * 110.574 });
const radLL = (x, y) => { const lat = y / 110.574; return [RAD_LON0 + x / (111.32 * Math.cos(lat * D2R)), lat]; };
const radBV = () => window.BV_RADAR;
/* flight:v1 — радіогоризонт (див. 03_game.js) */
const RAD_HT = { ground: 30, low: 120, mid: 6000, high: 25000 };
function radLos(sx, sy, tx, ty, alt){
  const d = Math.hypot(tx - sx, ty - sy), ht = RAD_HT[alt] != null ? RAD_HT[alt] : 1000, dh = 4.12 * (Math.sqrt(40) + Math.sqrt(ht));
  return d <= dh ? 1 : d >= dh * 1.15 ? 0 : 1 - (d - dh) / (dh * 0.15);
}
function radSim(){ return RAD.sim || (RAD.sim = radBV().create({ seed: 20260 })); }
function radarReset(){
  if (!RAD) return;
  RAD.sim = null; RAD.meta.clear(); RAD.lock.clear(); RAD.seenL.clear(); RAD.noted.clear(); RAD.net.ua = RAD.net.ru = 0; RAD.pick = null; RAD.sel = null; RAD.uid = 1; RAD.dirty = true;
  radPopClose(); radarPanel();
}
function radarAdd(key, c, side, free){
  const BV = radBV(), u = BV && BV.BYID[key]; if (!u || u.side !== side) return null;
  if (!free){
    if (!(side === "ua" ? canPlaceAD(c) : ruLand(c))) return null;
    if (RAD.sim && RAD.sim.stations.filter(s => RAD.meta.get(s.id) && RAD.meta.get(s.id).side === side).length >= 24) return null;
  }
  const sim = radSim(), q = radXY(c), P = BV.resolve(u);
  const st = BV.addStation(sim, { type: key, id: "R" + (RAD.uid++), x: q.x, y: q.y, status: "deploying", cmd: "HQ-" + side,
    bal: { deploySec: Math.max(10, Math.round(P.deploySec * 0.1)), relocSec: Math.max(10, Math.round(P.relocSec * 0.1)) } });
  RAD.meta.set(st.id, { c: c.slice(), side, key, ex: { ua: 0, ru: 0 }, seen: { ua: 0, ru: 0 }, resume: 0, kills: 0 });
  RAD.dirty = true; return st;
}
function radarStart(){
  radarReset(); if (!GAME.on) return;
  const DEP = {
    ua: [["ua_79k6", [30.9, 50.2]], ["ua_36d6m1", [36.2, 49.9]], ["ua_p18_malakhit", [32.4, 49.0]], ["ua_trml4d", [30.7, 46.6]], ["ua_giraffe1x", [35.0, 48.4]], ["ua_zoopark3", [36.9, 49.5]]],
    ru: [["ru_55zh6m", [37.4, 55.4]], ["ru_96l6", [36.9, 50.2]], ["ru_1l119", [36.0, 50.8]], ["ru_48ya6k1", [34.2, 45.0]], ["ru_39n6", [36.7, 47.6]], ["ru_1l219m", [36.4, 50.1]]]
  };
  for (const sd of ["ua", "ru"]) if (BOT[sd]) for (const [k, c] of DEP[sd]){ const s = radarAdd(k, c, sd, false); if (s) s.timer = Math.min(s.timer, 20); }
}
/* ---------- світ → РЛС ---------- */
function radProfile(u, W){
  if (hiAlt(u)) return { cat: "ballistic", alt: "high" };
  switch (W.ad){
    case "tac": return W.fpv ? { cat: "fpv", alt: "ground" } : { cat: "uav_small", alt: "low" };
    case "drone": case "jet": return { cat: "uav_large", alt: "low" };
    case "rd": case "cruise": return { cat: "cruise", alt: "low" };
    case "bomb": return { cat: "cruise", alt: "mid" };
    case "ballistic": case "hyper": case "icbm": return { cat: "ballistic", alt: "high" };
    default: return { cat: "cruise", alt: "mid" };
  }
}
function radTargets(){
  const tg = [];
  for (const u of units.values()){
    if (u.kind !== "w" || u.fall || u.sea || u.inv || !u.pos) continue;
    const W = WEAPONS[u.key]; if (!W || W.child || W.sea || u.key === "seadrone") continue;
    const m = radProfile(u, W), q = radXY(u.pos);
    tg.push({ id: u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: m.cat, alt: m.alt });
  }
  return tg;
}
function radLaunches(sim){                                                       // пуск ракети з землі → артилерійська подія для контрбатарейних РЛС
  const BV = radBV(), live = new Set();
  for (const u of units.values()){
    if (u.kind !== "w") continue; live.add(u.id);
    if (!RAD_CB_KEYS[u.key] || RAD.seenL.has(u.id) || !u.pos) continue;
    RAD.seenL.add(u.id); const q = radXY(u.pos);
    BV.artilleryEvent(sim, { side: u.sd || "ru", x: q.x, y: q.y, kind: "rocket", id: u.id });
  }
  if (RAD.seenL.size > 400) for (const id of Array.from(RAD.seenL)) if (!live.has(id)) RAD.seenL.delete(id);
}
function radDetect(sim, dt){                                                      // РЕР противника виявляє працюючу РЛС
  const BV = radBV();
  for (const st of sim.stations){
    const m = RAD.meta.get(st.id); if (!m) continue;
    const foe = other(m.side), T = BV.BYID[st.type], emitting = (st.status === "working" || st.status === "damaged") && T.radarClass !== "counter_battery";
    let inR = false;
    if (emitting) for (const b of EW.st){
      if (b.side !== foe || !ewActive(b)) continue;
      const TB = EWSYS[b.key]; if (!(TB.el > 0)) continue;
      if (hav(m.c, b.c) <= TB.el * (T.radarClass === "strategic" ? 1.6 : 1)){ inR = true; break; }
    }
    m.ex[foe] = Math.max(0, Math.min(8, m.ex[foe] + (inR ? dt : -dt)));
    if (inR && m.ex[foe] >= 6){
      const fresh = !(m.seen[foe] > SIM.t); m.seen[foe] = SIM.t + 90;
      if (fresh && GAME.on){ sideToast(foe, `РЕР виявила РЛС противника: ${T.name}`); sideToast(m.side, `Вашу РЛС «${T.name}» виявлено — вимкніть її або змініть позицію`); }
    }
    if (BOT[m.side]){                                                              // бот гасить виявлену станцію, потім вмикає
      if (st.status === "working" && m.seen[foe] > SIM.t && T.radarClass !== "strategic"){ BV.setOffline(sim, st.id, true); m.resume = SIM.t + 70; }
      else if (st.status === "offline" && m.resume && SIM.t > m.resume){ BV.setOffline(sim, st.id, false); m.resume = 0; }
    }
  }
}
function radarTick(sd){
  if (!RAD.sim) return;
  RAD.acc += sd; if (RAD.acc < 0.5) return;
  const dt = RAD.acc; RAD.acc = 0;
  const BV = radBV(), sim = RAD.sim;
  for (const st of sim.stations){                                                  // РЕБ шару COM рве канал до КП
    const m = RAD.meta.get(st.id); if (!m) continue;
    const com = EW.st.length ? ewE(other(m.side), "COM", m.c) : 0;
    BV.setLink(sim, st.id, { up: com < 0.85, latency: sim.cfg.baseLatencySec * (1 + 4 * com) });
  }
  radLaunches(sim);
  const tg = radTargets();
  BV.step(sim, dt, { targets: () => tg, los: radLos, jam: (p, side) => EW.st.length ? ewE(other(side), "RADAR", radLL(p[0], p[1])) : 0 });
  radDetect(sim, dt);
  RAD.net.ua = RAD.net.ru = 0; RAD.lock.clear();
  for (const st of sim.stations){ const m = RAD.meta.get(st.id); if (m && !st.destroyed && BV.BYID[st.type].radarClass !== "counter_battery") RAD.net[m.side]++; }
  for (const sd2 of ["ua", "ru"]){
    for (const c of sim.pic[sd2].air){
      if (c.state === "lost" || c._ref == null) continue;
      const k = sd2 + ":" + c._ref, o = RAD.lock.get(k); if (!o || c.conf > o.conf) RAD.lock.set(k, c);
    }
    for (const g of sim.pic[sd2].ground) if (g.state === "tracking" && !RAD.noted.has(g.id)){
      RAD.noted.add(g.id); if (GAME.on) sideToast(sd2, "Контрбатарейна РЛС зафіксувала позицію пуску противника");
    }
  }
  for (let i = sim.stations.length - 1; i >= 0; i--){                              // знищені станції прибираємо
    const st = sim.stations[i]; if (st.destroyed){ sim.stations.splice(i, 1); RAD.meta.delete(st.id); if (RAD.sel === st.id) radPopClose(); }
  }
}
/* ---------- ППО: захоплення лише за якісними даними РЛС ---------- */
function radarAdSkip(u, T, t){
  if (!RAD || !RAD.need || !RAD.sim || !T) return false;
  const sd = u.side || "ua";
  if (!(RAD.net[sd] > 0) || T.gun || T.air || !(T.r >= 20) || ADS.units.get(u.id) !== u) return false;
  if (hav(u.pos, t.pos) <= 10) return false;                                       // власні засоби ППО бачать ціль зблизька
  const c = RAD.lock.get(sd + ":" + t.id); if (!c) return true;
  const age = RAD.sim.t - c.lastUpdatedAt, rank = c.state === "identified" ? 4 : c.state === "tracking" ? 3 : 2;
  return !(rank >= 3 && c.conf >= 0.6 && c.sigma <= Math.max(0.6, 0.03 * T.r) && age <= Math.max(8, c.ttl * 0.6));
}
/* ---------- удар по виявленій станції ---------- */
function radarStrike(u, sd){
  const BV = radBV(), sim = RAD.sim, foe = other(sd);
  for (const st of sim.stations.slice()){
    const m = RAD.meta.get(st.id); if (!m || m.side !== foe || !(m.seen[sd] > SIM.t)) continue;
    const d = hav(u.pos, m.c); if (d > 3) continue;
    const T = BV.BYID[st.type]; BV.damage(sim, st.id, wDmg(u.key) * (d < 1.8 ? 1 : 0.6) / (RAD_HP[T.radarClass] || 2));
    if (st.destroyed) gameToast(`${SIDE_N[sd]}: знищено РЛС «${T.name}»`); RAD.dirty = true;
  }
}
/* ---------- карта ---------- */
function radVisible(m){
  if (ewMine(m.side)) return true;
  const me = other(m.side); return ewMine(me) && m.seen[me] > SIM.t;
}
function radarRender(now){
  const map = S7.map; if (!map || (now - RAD.rt < 250 && !RAD.dirty)) return; RAD.rt = now;
  try {
    if (!map.getSource("radz")){
      if (!map.isStyleLoaded()) return;
      for (const id of ["radz", "radp", "radc", "radg"]) map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "radz-f", type: "fill", source: "radz", paint: { "fill-color": ["get", "c"], "fill-opacity": ["case", ["==", ["get", "a"], 1], 0.05, 0.015] } });
      map.addLayer({ id: "radz-l", type: "line", source: "radz", paint: { "line-color": ["get", "c"], "line-width": 1, "line-opacity": 0.7, "line-dasharray": [1, 2] } });
      map.addLayer({ id: "radg-c", type: "circle", source: "radg", paint: { "circle-radius": 5, "circle-color": "#ff8a3c", "circle-opacity": ["get", "o"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });
      map.addLayer({ id: "radc-c", type: "circle", source: "radc", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-opacity": ["get", "o"], "circle-stroke-color": "#0e1116", "circle-stroke-width": 1 } });
      map.addLayer({ id: "radp-c", type: "circle", source: "radp", paint: { "circle-radius": 6, "circle-color": ["get", "c"], "circle-stroke-color": ["case", ["==", ["get", "sn"], 1], "#ff3b3b", "#ffd23f"], "circle-stroke-width": 2, "circle-opacity": ["case", ["==", ["get", "a"], 1], 1, 0.45] } });
      map.on("click", "radp-c", e => { const f = e.features && e.features[0]; if (f) radPop(String(f.properties.id)); });
      map.on("mouseenter", "radp-c", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "radp-c", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", e => {
        if (!RAD.pick) return; if (EW.pick){ RAD.pick = null; return; }
        const st = radarAdd(RAD.pick, [e.lngLat.lng, e.lngLat.lat], RAD.side, false);
        if (st){ toast(`РЛС «${radBV().BYID[st.type].name}»: розгортання ${Math.round(st.timer)} с`); RAD.pick = null; map.getCanvas().style.cursor = ""; radarPanel(); }
        else toast(RAD.side === "ua" ? "РЛС — лише на вільній території України (ліміт 24 станції)" : "РЛС — лише на території Росії та в зоні окупації (ліміт 24 станції)");
      });
    }
    const BV = radBV(), sim = RAD.sim, zf = [], pf = [], cf = [], gf = [];
    if (sim){
      for (const st of sim.stations){
        const m = RAD.meta.get(st.id); if (!m || !radVisible(m)) continue;
        const T = BV.BYID[st.type], cov = BV.coverage(sim, st.id), act = st.status === "working" || st.status === "damaged" ? 1 : 0, col = m.side === "ua" ? "#22c3e6" : "#ff6b6b";
        if (cov && cov.rKm >= 1) zf.push({ type: "Feature", properties: { c: col, a: act }, geometry: { type: "Polygon", coordinates: [circlePoly(m.c, cov.rKm, cov.rKm > 100 ? 120 : 64)] } });
        pf.push({ type: "Feature", properties: { id: st.id, c: col, a: act, sn: m.seen[other(m.side)] > SIM.t ? 1 : 0 }, geometry: { type: "Point", coordinates: m.c } });
      }
      for (const sd of ["ua", "ru"]){
        if (!ewMine(sd)) continue;
        for (const c of sim.pic[sd].air){
          const dx = c.state === "lost" ? 0 : Math.min(15, Math.max(0, sim.t - c.lastUpdatedAt));
          cf.push({ type: "Feature", properties: { id: c.id, c: RAD_ST_COL[c.state], r: c.state === "preliminary" ? 3 : c.state === "detected" ? 4 : 5, o: Math.max(0.25, Math.min(1, c.conf + 0.2)) }, geometry: { type: "Point", coordinates: radLL(c.x + c.vx * dx, c.y + c.vy * dx) } });
        }
        for (const g of sim.pic[sd].ground) gf.push({ type: "Feature", properties: { o: g.state === "lost" ? 0.3 : 0.9 }, geometry: { type: "Point", coordinates: radLL(g.x, g.y) } });
      }
    }
    map.getSource("radz").setData({ type: "FeatureCollection", features: zf });
    map.getSource("radp").setData({ type: "FeatureCollection", features: pf });
    map.getSource("radc").setData({ type: "FeatureCollection", features: cf });
    map.getSource("radg").setData({ type: "FeatureCollection", features: gf });
    RAD.dirty = false;
  } catch (e) { /* карта ще не готова */ }
  if (now - RAD.pt > 1000){ RAD.pt = now; if (!RAD.pick && HOOKS.apTabLive) HOOKS.apTabLive("rad"); }
}
/* ---------- вікно станції й панель ---------- */
let radPopEl = null;
function radPopClose(){ if (radPopEl){ radPopEl.remove(); radPopEl = null; } RAD.sel = null; }
function radPop(id){
  const BV = radBV(), sim = RAD.sim, st = sim && sim.stations.find(s => s.id === id), m = st && RAD.meta.get(id); if (!st || !m) return;
  radPopClose(); RAD.sel = id;
  const T = BV.BYID[st.type], card = BV.snapshot(sim, m.side).stations.find(x => x.id === id), mine = ewMine(m.side), foe = other(m.side);
  const el = document.createElement("div"); radPopEl = el;
  el.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;max-width:360px;padding:12px 14px;background:rgba(14,17,22,.96);border:1px solid rgba(255,210,63,.45);color:#e8eaee;font:12px/1.45 system-ui,sans-serif;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.6)";
  el.innerHTML = `<b style="color:#ffd23f">${escH(T.name)}</b> · ${SIDE_N[m.side]}<br>${RAD_CLS_N[T.radarClass]}${T.detectionRangeKm ? " · дальність " + T.detectionRangeKm + " км (зараз ≈ " + Math.round(card.effectiveRangeKm) + ")" : " · дальність у довіднику не задана"}` +
    `<br>Стан: <b>${escH(card.statusLabel)}</b>${card.timerSec ? " · " + card.timerSec + " с" : ""} · міцність ${(card.hp * (RAD_HP[T.radarClass] || 2)).toFixed(1)} / ${RAD_HP[T.radarClass] || 2}` +
    `<br>Контактів: ${card.tracks}/${card.maxTracks} · канал до КП: ${card.linkUp ? "є" : '<b style="color:#ff6b6b">немає</b>'}` + (m.seen[foe] > SIM.t ? ' · <b style="color:#ff6b6b">виявлена противником</b>' : "") +
    (mine ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button data-e="tg">${st.status === "offline" ? "Увімкнути" : "Тиша (вимкнути)"}</button>${st.hp < 1 && st.status !== "repairing" ? '<button data-e="rp">Ремонт</button>' : ""}<button data-e="rm">Згорнути</button><button data-e="x">×</button></div>` : `<div style="margin-top:8px"><button data-e="x">×</button></div>`);
  el.querySelectorAll("button").forEach(b => { b.style.cssText = "padding:5px 10px;background:#1b2029;color:#e8eaee;border:1px solid rgba(255,210,63,.35);border-radius:5px;cursor:pointer;font:12px system-ui"; b.onclick = () => {
    const a = b.dataset.e;
    if (a === "tg"){ BV.setOffline(sim, id, st.status !== "offline"); if (st.status === "offline" && st.offReason !== "manual") toast("Станція пошкоджена — потрібен ремонт"); RAD.dirty = true; radPop(id); return; }
    if (a === "rp"){ BV.repair(sim, id); RAD.dirty = true; radPop(id); return; }
    if (a === "rm"){ const i = sim.stations.indexOf(st); if (i >= 0) sim.stations.splice(i, 1); RAD.meta.delete(id); RAD.dirty = true; radPopClose(); return; }
    radPopClose(); }; });
  document.body.appendChild(el);
}
function radStationsHtml(side){
  const sim = RAD.sim, snap = sim ? radBV().snapshot(sim, side) : null;
  return snap && snap.stations.length ? `<div class="lp-h" style="margin-top:12px"><span>Мої станції РЛС · ${snap.stations.length}</span></div><div class="tlist">` + snap.stations.map(s => `<button class="trow btn" data-ad="radst" data-v="${s.id}"><span class="tn">${escH(s.name)}<small>${escH(s.statusLabel)} · ${s.tracks}/${s.maxTracks}${s.linkUp ? "" : " · без зв'язку"}</small></span></button>`).join("") + `</div>` : "";
}
/* етап 7.56: вкладка «РЛС» у панелі «Розміщення ППО» (замість плаваючої кнопки) */
function radarTabHtml(side){
  RAD.side = side;
  const BV = radBV(), sim = RAD.sim, n = sim ? sim.stations.filter(s => RAD.meta.get(s.id) && RAD.meta.get(s.id).side === side).length : 0;
  const cat = BV.catalogFor(side, false).sort((a, b2) => (b2.firstRelease - a.firstRelease));
  return `<div class="lp-sec"><div class="lp-h"><span>РЛС</span><span>безкоштовно · ${n}/24</span></div>` +
    `<div class="note">Оберіть станцію й натисніть на мапі. Контакти: <span style="color:#9aa4b2">●</span> попередній <span style="color:#ffd23f">●</span> виявлено <span style="color:#ff9a3c">●</span> супровід <span style="color:#ff4d4d">●</span> ідентифіковано. ЗРК (≥ 20 км) б'ють лише по цілях зі «захопленням».</div>` +
    `<div class="row"><button class="chip ${RAD.need ? "on" : ""}" data-ad="radneed">ППО потребує РЛС: ${RAD.need ? "так" : "ні"}</button></div><div class="tlist" style="margin-top:8px">` +
    cat.map(u => { const P = BV.resolve(u); return `<button class="trow btn ${RAD.pick === u.id ? "on" : ""}" data-ad="radpick" data-k="${u.id}"><span class="tn">${escH(u.name)}<small>${RAD_CLS_N[u.radarClass]} · ${u.detectionRangeKm ? u.detectionRangeKm + " км" : "дальність не задана"} · розгортання ≈ ${Math.max(10, Math.round(P.deploySec * 0.1))} с</small></span></button>`; }).join("") + `</div>` +
    `<div id="radStList">${radStationsHtml(side)}</div></div>`;
}
function radarPanel(){ if (HOOKS.apSync) HOOKS.apSync(); }
window.BV_RAD = RAD;
window.BV_RAD_API = { add: radarAdd, tick: radarTick, adSkip: radarAdSkip, strike: radarStrike, sim: () => RAD.sim, units: () => units, ads: () => ADS, map: () => S7.map, xy: radXY, ll: radLL };   // для тестів
setTimeout(radarPanel, 1600);
