/* ---------- етап 8: літаки ДРЛО — Saab 340 AEW&C (ASC 890, ua) і А-50У (ru) ----------
   Ядро: src/js/02j_aew.js (BV_AEW). Тип — запис AD_TYPES з полем aew:true (стороні ua, без озброєння).
   • Політ: власний автомат станів (база → транзит → патрулювання по колу → бінго/повернення → посадка →
     перезарядка → новий виліт за залишком вильотів). Той самий набір станів, що в авіації ППО, тож команди
     карти (вибір аеродрому, точка патрулювання, повернення) працюють без змін.
   • РЛС: у повітрі літак — станція радіолокатора (surveillance, 3D) у спільній симуляції РЛС. Позиція і висота
     оновлюються щотакту; дальність залежить від висоти. Коло обнаружения малює слой «радіолокація».
   • Цілі: вражаючі ракети/дрони, вражаючі літаки ППО та авіаносії противника (kind «c», клас air) — видимі РЛС.
   • Наведення: винищувачі ППО в патрулюванні отримують трек ДРЛО на ракету/дрон противника (до 260 км від точки
     патрулювання) і йдуть на перехват через звичайну логіку цілі (atk).
   ДРЛО не є ціллю для винищувачів (у грі немає повітряного бою між літаками) — лише обнаруження й передача даних. */
function aewUnit(u){ const T = AD_TYPES[u.key]; return !!(T && T.aew); }
function aewAir(u){ return window.BV_AEW.airborne(u.state); }
function aewLive(){ for (const u of ADS.units.values()) if (aewUnit(u) && aewAir(u)) return true; return false; }
function aewWas(){ if (!RAD.sim) return false; for (const st of RAD.sim.stations){ const m = RAD.meta.get(st.id); if (m && m.aew != null) return true; } return false; }
function aewCover(sd){ for (const u of ADS.units.values()) if (aewUnit(u) && u.side === sd && aewAir(u)) return true; return false; }

/* автомат станів ДРЛО: викликається замість airStep */
function aewStep(u, T, sd){
  const C = window.BV_AEW.CFG, A = window.BV_AEW;
  if (u.state === "base") return;
  ADS.dirty = true;
  if (u.state === "reload"){                                    // перезарядка/заправка на аеродромі
    u.rl -= sd;
    if (u.rl <= 0){
      u.fuel = 1; u.sp = 0; u.state = "base";
      if (u.after === "patrol" && u.reserve > 0){               // новий виліт: залишок вильотів зменшується, якщо злетів
        airGo(u, u.patrol, "transit");
        if (u.state === "transit" && u.reserve !== Infinity) u.reserve--;
      }
    }
    return;
  }
  const bingo = airFuelStep(u, T, sd);                          // пальне: вичерпано — літак втрачено
  if (u.fuel <= 0 && AIRX.flameout){ ADS.units.delete(u.id); ADS.dirty = true; HOOKS.adHint && HOOKS.adHint(u.side, `${T.n}: пальне вичерпано — ДРЛО втрачено`); return; }
  if (bingo && u.state !== "rtb"){                              // бінго — на аеродром; далі — посадка
    HOOKS.adHint && HOOKS.adHint(u.side, `${T.n}: бінго — повертається на аеродром`);
    airRTB(u, u.reserve > 0 ? "patrol" : "base"); return;
  }
  if (u.state === "rtb"){                                       // посадка
    const v = airSpeed(u, T, AIR.cruise * airK(T), sd);
    if (airFollow(u, v, sd)){
      u.pos = u.home.slice(); u.sp = 0;
      if (u.after === "patrol" && u.reserve > 0){ u.state = "reload"; u.rl = A.tp(u.key, "turnaround"); }
      else { u.state = "base"; u.fuel = 1; }
    }
    return;
  }
  const v = airSpeed(u, T, AIR.cruise * airK(T), sd), st = v * sd;
  if (u.state === "transit"){                                   // до точки патрулювання
    if (airFollow(u, v, sd)) u.state = "patrol";
    return;
  }
  // патрулювання: коло радіусом orbitKm навколо точки, перехід до точки, якщо далеко
  const R = A.tp(u.key, "orbitKm"), dp = hav(u.pos, u.patrol);
  let aim;
  if (dp > R * 1.6) aim = u.patrol;
  else { const b = (brg(u.patrol, u.pos) + 110) * D2R; aim = offKm(u.patrol, Math.sin(b) * R, Math.cos(b) * R); }
  turnTo(u, brg(u.pos, aim), sd);
  const a = u.hdg * D2R, nxt = offKm(u.pos, Math.sin(a) * st, Math.cos(a) * st);
  if (airOK(u.side, nxt) || !airOK(u.side, u.pos)) u.pos = nxt;
  else turnTo(u, brg(u.pos, u.patrol), sd, 3);                  // кордон: розворот усередину
}

/* звірка станції РЛС з літаком ДРЛО: станція є лише в повітрі; позиція, висота, дальність — щотакту */
function aewSync(){
  const BV = radBV(); if (!BV || !window.BV_AEW) return;
  const sim = radSim(), keep = new Set(), A = window.BV_AEW;
  for (const u of ADS.units.values()){
    if (!aewUnit(u) || !aewAir(u)) continue;
    const T = AD_TYPES[u.key], q = radXY(u.pos), h = A.height(u.state, u.key), R = A.rangeKm(h, u.key);
    let st = u.rsid ? sim.stations.find(s => s.id === u.rsid) : null;
    if (!st){
      st = BV.addStation(sim, { type: A.radarFor(u.key).id, id: "AEW" + u.id, x: q.x, y: q.y, status: "working", cmd: "HQ-" + T.side, bal: { rangeKm: R } });
      u.rsid = st.id;
    }
    st.x = q.x; st.y = q.y; st.h = h;
    const cur = st.bal && st.bal.rangeKm;
    if (cur == null || Math.abs(cur - R) > 0.5){ st.bal = Object.assign({}, st.bal || {}, { rangeKm: R }); st.$p = null; }
    const m = RAD.meta.get(st.id) || { ex: { ua: 0, ru: 0 }, seen: { ua: 0, ru: 0 }, resume: 0, kills: 0 };
    m.c = u.pos.slice(); m.side = T.side; m.key = u.key; m.aew = u.id; RAD.meta.set(st.id, m);
    keep.add(st.id);
  }
  for (let i = sim.stations.length - 1; i >= 0; i--){            // ДРЛО сів або втрачений — станція зникає
    const st = sim.stations[i], m = RAD.meta.get(st.id);
    if (m && m.aew != null && !keep.has(st.id)){ sim.stations.splice(i, 1); RAD.meta.delete(st.id); }
  }
  RAD.dirty = true;
}

/* цілі для РЛС: повітряні цілі противника, яких раніше РЛС не бачила (ракети/дрони вже в radTargets) */
function aewTargets(tg){
  for (const u of ADS.units.values()){
    const T = AD_TYPES[u.key];
    if (!T || !T.air || !u.pos || u.state === "base" || u.state === "reload") continue;
    const q = radXY(u.pos);
    tg.push({ id: "ad" + u.id, side: u.side || "ua", x: q.x, y: q.y, cat: T.heli ? "heli" : "fighter", alt: T.heli ? "low" : "mid" });
  }
  for (const u of units.values()){
    if (u.kind !== "c" || u.fall || !u.pos || !u.avia) continue;
    const CR = CARRIERS[u.key]; if (!CR || CR.kind !== "air") continue;
    const q = radXY(u.pos);
    tg.push({ id: "c" + u.id, side: u.sd || "ru", x: q.x, y: q.y, cat: "bomber", alt: "mid" });
  }
  return tg;
}

/* наведення ДРЛО: найближча ракета/дрон противника з треком супроводу, який винищувач може збити */
function aewCue(u, T){
  const sd = u.side || "ua", sim = RAD.sim, A = window.BV_AEW;
  if (!sim || !A || !aewCover(sd)) return null;
  let best = null, bd = Infinity;
  for (const c of sim.pic[sd].air){
    if (c._ref == null || !A.cueOK(c, sim.t)) continue;
    const t = units.get(c._ref);
    if (!t || t.kind !== "w" || t.fall || !isFoe(u, t) || !WEAPONS[t.key]) continue;
    if (!(T.p[AD_CI[WEAPONS[t.key].ad]] > 0) || adSkipT(u, t) || !patrolOK(sd, t.pos)) continue;
    if (hav(u.patrol, t.pos) > A.tp(u.key, "cueKm")) continue;
    const d = hav(u.pos, t.pos); if (d < bd){ bd = d; best = t; }
  }
  return best;
}
