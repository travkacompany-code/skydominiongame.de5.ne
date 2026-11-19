# Етап 7.56: РЕБ і РЛС — вкладки панелі «Розміщення ППО» (замість плаваючих кнопок поверх мапи).
# Патчить src/js/03_game.js і dist/game_ultra.html ОДНАКОВО. Ідемпотентний. Частина РЛС лежить у tools/radar_glue.js (її вшиває apply_radar.py).
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
rd = lambda p: open(p, encoding='utf-8').read()
wr = lambda p, s: open(p, 'w', encoding='utf-8').write(s)
def once(s, a, b, what):
    n = s.count(a)
    if n != 1: sys.exit(f'ПОМИЛКА: якір «{what}» знайдено {n} разів (очікувався 1) — {what}')
    return s.replace(a, b)

EW_NEW = r'''/* ---------- панель: вкладка «РЕБ» у панелі «Розміщення ППО» (етап 7.56) ---------- */
function ewStationsHtml(side){
  const mine = EW.st.filter(s => s.side === side && s.alive); if (!mine.length) return "";
  return `<div class="lp-h" style="margin-top:12px"><span>Мої станції РЕБ · ${mine.length}</span></div><div class="tlist">` + mine.map(s => {
    const rdy = Math.max(0, Math.ceil(s.rdy - SIM.t));
    return `<button class="trow btn" data-ad="ewst" data-v="${s.id}"><span class="tn">${escH(EWSYS[s.key].n)}<small>${!s.on ? "тиша" : rdy ? "розгортання " + rdy + " с" : "працює"}${s.seen[other(s.side)] > SIM.t ? " · виявлена противником" : ""}</small></span></button>`; }).join("") + `</div>`;
}
function ewTabHtml(side){
  EW.side = side;
  const n = EW.st.filter(s => s.side === side && s.alive).length;
  return `<div class="lp-sec"><div class="lp-h"><span>РЕБ</span><span>безкоштовно · ${n}/40</span></div>` +
    `<div class="note">Оберіть станцію й натисніть на мапі. Своїх не глушить. Станцію противника можна вразити лише після виявлення РЕР.</div><div class="tlist">` +
    EW_STR[side].map(k => { const T = EWSYS[k]; return `<button class="trow btn ${EW.pick === k ? "on" : ""}" data-ad="ewpick" data-k="${k}"><span class="tn">${escH(T.n)}<small>${T.l.length ? T.l.join("+") : "РЕР"}${T.R ? " · " + T.R + " км" : ""}${T.el ? " · РЕР " + T.el + " км" : ""} · ${escH(T.d)}</small></span></button>`; }).join("") + `</div>` +
    `<div class="note">Шари: ${Object.values(EW_LAYERS).map(l => `<span style="color:${l[1]}">■</span> ${l[0]}`).join(" · ")}</div>` +
    `<div id="ewStList">${ewStationsHtml(side)}</div></div>`;
}
function ewPanel(){ if (HOOKS.apSync) HOOKS.apSync(); }      // після розміщення/скасування — оновити панель ППО
function ewPanelRefresh(){ if (!EW.pick && HOOKS.apTabLive) HOOKS.apTabLive("ew"); }
'''
RAD_NEW = r'''function radStationsHtml(side){
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
'''

# ---- 1) radar_glue.js ----
g = rd('tools/radar_glue.js')
if 'function radarTabHtml' not in g:
    i = g.index('function radarPanel(){'); j = g.index('window.BV_RAD = RAD;')
    g = g[:i] + RAD_NEW + g[j:]
    g = once(g, 'if (RAD.open && document.getElementById("radPanel") && !RAD.pick) radarPanel();', 'if (!RAD.pick && HOOKS.apTabLive) HOOKS.apTabLive("rad");', 'radar_glue: refresh')
    wr('tools/radar_glue.js', g); print('radar_glue.js оновлено')

# ---- 2) 03_game.js та dist ----
def patch(s):
    if 'function ewTabHtml' in s: return s, False
    i = s.index('function ewPanel(){'); j = s.index('window.BV_EW = EW;')
    s = s[:i] + EW_NEW + s[j:]
    # вкладки
    s = once(s, 'data-v="units">Установки${nU ? ` · ${nU}` : ""}</button></div>`;',
      'data-v="units">Установки${nU ? ` · ${nU}` : ""}</button>` +\n      `<button class="${AP.tab === "ew" ? "on" : ""}" data-ad="tab" data-v="ew">РЕБ</button>` +\n      `<button class="${AP.tab === "rad" ? "on" : ""}" data-ad="tab" data-v="rad">РЛС</button></div>`;', 'вкладки ППО')
    s = once(s, '    } else if (AP.tab === "alerts"){',
      '''    } else if (AP.tab === "ew" || AP.tab === "rad"){      // етап 7.56: РЕБ і РЛС — частина розміщення ППО
      h += AP.tab === "ew" ? ewTabHtml(side) : radarTabHtml(side);
      $("adBody").innerHTML = h;
      $("adGo").style.display = "none";
      const pk = AP.tab === "ew" ? EW.pick : RAD.pick;
      $("adMsg").className = "lp-msg" + (pk ? " ok" : ""); $("adMsg").textContent = pk ? "Натисніть на мапі, де розгорнути станцію" : "Оберіть станцію зі списку";
    } else if (AP.tab === "alerts"){''', 'гілка вкладки')
    # вибір точки: спільна панель pickbar
    s = once(s, '  function adStartPick(kind){\n    AP.pick = kind;', '  function adStartPick(kind){\n    EW.pick = null; RAD.pick = null;\n    AP.pick = kind;', 'adStartPick')
    s = once(s, '  function adStopPick(){\n    if (!AP.pick) return;',
      '  function adStopPick(){\n    if (EW.pick || RAD.pick){ EW.pick = null; RAD.pick = null; $("pickbar").classList.remove("on"); $("adp").classList.remove("min"); map.getCanvas().style.cursor = ""; }\n    if (!AP.pick) return;', 'adStopPick')
    s = once(s, '  HOOKS.pickDone = () => { if (!AP.pick) return false; adStopPick(); apRender(); return true; };\n  HOOKS.escape = () => { if (AP.pick){ adStopPick(); apRender(); return true; }',
      '''  HOOKS.pickDone = () => { if (!AP.pick && !EW.pick && !RAD.pick) return false; adStopPick(); apRender(); return true; };
  HOOKS.escape = () => { if (AP.pick || EW.pick || RAD.pick){ adStopPick(); apRender(); return true; }''', 'pickDone/escape')
    s = once(s, '  HOOKS.mapClick = e => {\n    const p = [e.lngLat.lng, e.lngLat.lat];',
      '''  /* етап 7.56: після розміщення РЕБ/РЛС (клік на мапі) — прибрати рядок вибору й оновити вкладку */
  HOOKS.apSync = () => {
    if (!AP.pick && !EW.pick && !RAD.pick && !(HOOKS.lpPicking && HOOKS.lpPicking())){ $("pickbar").classList.remove("on"); $("adp").classList.remove("min"); }
    if (AP.open) apRender();
  };
  HOOKS.apTabLive = t => {      // живе оновлення списку станцій без скидання прокрутки
    if (!AP.open || AP.mode !== "post" || AP.tab !== t || AP.pick) return;
    const el = $(t === "ew" ? "ewStList" : "radStList"); if (!el) return;
    const side = postSide(), html = t === "ew" ? ewStationsHtml(side) : radStationsHtml(side);
    if (el.innerHTML !== html) el.innerHTML = html;
  };
  function stationPick(isE, k){
    const o = isE ? EW : RAD, was = o.pick === k;
    adStopPick(); o.side = postSide();
    if (!was){
      o.pick = k; $("pickbar").classList.add("on"); $("pickDone").textContent = "Скасувати";
      $("pickTxt").textContent = isE ? `РЕБ «${EWSYS[k].n}»: натисніть на мапі, де розгорнути` : `РЛС «${radBV().BYID[k].name}»: натисніть на мапі, де розгорнути`;
      map.getCanvas().style.cursor = "crosshair"; if (isNarrow()) $("adp").classList.add("min");
    }
    apRender();
  }
  HOOKS.mapClick = e => {
    if (EW.pick || RAD.pick) return true;      // клік по мапі зараз — розміщення станції, а не відкриття об'єктів
    const p = [e.lngLat.lng, e.lngLat.lat];''', 'mapClick')
    s = once(s, '      case "close": return apClose();\n      case "tab": AP.tab = v;',
      '''      case "close": return apClose();
      case "ewpick": return stationPick(true, b.dataset.k);      // етап 7.56
      case "radpick": return stationPick(false, b.dataset.k);
      case "radneed": RAD.need = !RAD.need; return apRender();
      case "ewst": { const x = EW.st.find(q => q.id === +v); if (x){ ewPop(x.id); map.easeTo({ center: x.c, zoom: Math.max(map.getZoom(), 6), duration: 800 }); } return; }
      case "radst": { const m = RAD.meta.get(v); radPop(v); if (m) map.easeTo({ center: m.c, zoom: Math.max(map.getZoom(), 6), duration: 800 }); return; }
      case "tab": AP.tab = v;''', 'case tab')
    return s, True

# старі Escape-слухачі вже видалені разом із ewPanel; у glue — теж (блок radarPanel замінено)
changed = []
for p in ['src/js/03_game.js', 'dist/game_ultra.html']:
    s, ch = patch(rd(p))
    if ch: wr(p, s); changed.append(p)
print('змінено:', changed or 'нічого')
