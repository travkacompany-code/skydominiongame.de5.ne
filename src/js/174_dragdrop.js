/* SKYDOMINION · 174 · Drag & Drop карток на мапу
   Тягнемо картку (ППО, авіація, РЛС/РЕБ, ракета, мобільна ПУ) із її панелі прямо на мапу:
   • під час перетягування — «привид» картки, точка призначення, коло дії/лінія маршруту й підсвітка
     допустимих (зелений) та недопустимих (червоний) зон; жовтий — дія можлива, але з застереженням;
   • після відпускання виконується ШТАТНА дія гри (placeUnit / takeoff / вибір РЛС·РЕБ / вибір цілі або точки пуску / ПУ).
   Нової ігрової логіки тут немає: усі перевірки (територія, дальність, склад, боєкомплект, купівля, фаза бою) —
   ті самі функції, що й у звичайних панелях; модуль лише викликає їх через місток window.BV_DND_HOST та
   HOOKS.dndAp / HOOKS.dndLp (див. tools/apply_dragdrop.py).
   Миша: тягнути за 5 px. Дотик: утримання ≈ 0,23 с (інакше палець гортає список); точка скидання — на 58 px
   вище пальця, щоб його не затуляв. Esc або скидання поза мапою — скасування. */
(function () {
  "use strict";
  if (window.BV_DND) return;

  const COL = { ok: "#35d07f", warn: "#ffc53d", bad: "#ff5a4d" };
  const HOLD_MS = 230, SLOP_MOUSE = 5, SLOP_TOUCH = 9, LIFT = 58, EDGE = 56, PAN_MAX = 15, ZONE_CELLS = 11000;
  const EMPTY = { type: "FeatureCollection", features: [] };
  const $ = id => document.getElementById(id);

  const host = () => window.BV_DND_HOST || null;
  const hooks = () => { const h = host(); return h ? h.HOOKS : null; };
  const getMap = () => { const h = host(); return h && h.S7 ? h.S7.map : null; };
  const toast = m => { const h = host(); if (h && h.toast) h.toast(m); };

  let S = null;                       // активний жест
  let ghost = null, hint = null, pill = null, pillTimer = 0, zoneCv = null, zoneT = 0, suppressUntil = 0;

  /* ---------- яку картку тягнемо ---------- */
  /* етап 7.74: клей (tools/dnd_glue.js) вирішує, які картки можна тягнути; решта — як раніше, клік */
  function cardInfo(t){
    const ci = cardInfoAny(t);
    return ci && (!host() || !host().supports || host().supports(ci.kind, ci.key)) ? ci : null;
  }
  function cardInfoAny(t){
    if (!t || !t.closest) return null;
    let el = t.closest('#adp .wcard[data-ad="key"]'); if (el) return { kind: "ad", key: el.dataset.k, el };
    el = t.closest('#adp .wcard[data-ad="akey"]'); if (el) return { kind: "air", key: el.dataset.k, el };
    el = t.closest('#launch .wcard[data-act="weapon"]'); if (el) return { kind: "rocket", key: el.dataset.k, el };
    el = t.closest('#adp [data-ad="radpick"]'); if (el) return { kind: "rad", key: el.dataset.k, el };
    el = t.closest('#adp [data-ad="ewpick"]'); if (el) return { kind: "ew", key: el.dataset.k, el };
    el = t.closest(".tel-row");
    if (el){ const b = el.querySelector('[data-tp="place"][data-k]'); if (b && !b.disabled) return { kind: "tel", key: b.dataset.k, el }; }
    return null;
  }
  function cardName(el){
    const n = el.querySelector(".wn") || el.querySelector(".tn");
    if (!n) return (el.textContent || "").trim().slice(0, 28);
    let s = ""; for (const c of n.childNodes){ if (c.nodeType === 3) s += c.nodeValue; else if (c.tagName !== "SMALL") s += c.textContent; }
    return (s || n.textContent || "").trim();
  }

  /* ---------- жест: миша / дотик ---------- */
  function onDown(e){
    if (S || (e.pointerType === "mouse" && e.button !== 0) || e.isPrimary === false) return;
    const ci = cardInfo(e.target); if (!ci) return;
    S = { kind: ci.kind, key: ci.key, el: ci.el, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      touch: e.pointerType !== "mouse", drag: false, timer: 0, raf: 0, dirty: true, ev: null, evT: 0, evX: -1, evY: -1, last: e };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    if (S.touch) S.timer = setTimeout(() => { S.timer = 0; if (S && !S.drag) begin(); }, HOLD_MS);
  }
  function onMove(e){
    if (!S || e.pointerId !== S.id) return;
    S.x = e.clientX; S.y = e.clientY; S.last = e;
    if (!S.drag){
      const d = Math.hypot(S.x - S.x0, S.y - S.y0);
      if (S.touch){ if (d > SLOP_TOUCH) cleanup(); return; }        // палець повіз список — це прокрутка, а не перетягування
      if (d > SLOP_MOUSE) begin(); else return;
    }
    if (!S) return;
    if (e.cancelable) e.preventDefault();
    placeGhost(); S.dirty = true;
  }
  function onUp(e){
    if (!S || e.pointerId !== S.id) return;
    S.x = e.clientX; S.y = e.clientY; S.last = e;
    if (!S.drag){ cleanup(); return; }                               // звичайний клік — штатна обробка картки
    if (e.cancelable) e.preventDefault();
    drop();
  }
  function onCancel(e){ if (S && e.pointerId === S.id) { S.drag ? finish("cancel") : cleanup(); } }

  /* ---------- початок перетягування ---------- */
  function begin(){
    const h = hooks(), map = getMap();
    if (!h || !map || !host() || !h.dndAp) return cleanup();
    const bk = S.kind === "rocket" ? "w" : S.kind === "ad" || S.kind === "air" ? "a" : null;
    if (bk && h.bcLock && h.bcLock(bk, S.key)) return cleanup();       // платна картка без покупки — штатна підказка магазину
    if ((S.kind === "ad" || S.kind === "air") && S.el.classList.contains("empty")){ toast("Склад порожній — ця система недоступна"); return cleanup(); }
    // будь-який активний «вибір точки» штатного інтерфейсу скасовуємо: картку тягнемо замість нього
    try { h.dndAp.stop && h.dndAp.stop(); h.dndLp && h.dndLp.stop && h.dndLp.stop(); host().tel && host().tel.stop && host().tel.stop(); } catch (_) {}
    S.drag = true; S.zone = zonePred();
    if (S.timer){ clearTimeout(S.timer); S.timer = 0; }
    document.body.classList.add("dnd-on");
    S.el.classList.add("dnd-src");
    S.panel = S.el.closest("#adp,#launch") || rootOf(S.el);
    if (S.panel) S.panel.classList.add("dnd-away");
    buildGhost(); buildHint();
    ensureLayers(map);
    S.mv = () => { S.dirty = true; scheduleZone(); };
    map.on("move", S.mv);
    paintZone(true);
    if (S.touch && navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
    placeGhost();
    S.raf = requestAnimationFrame(frame);
  }
  const rootOf = el => { let r = el; while (r && r.parentElement && r.parentElement !== document.body) r = r.parentElement; return r && r !== document.body ? r : null; };

  function buildGhost(){
    ghost = document.createElement("div"); ghost.className = "dnd-ghost off"; ghost.setAttribute("aria-hidden", "true");
    const im = S.el.querySelector("img");
    if (im){ const i = document.createElement("img"); i.alt = ""; i.src = im.currentSrc || im.src; ghost.appendChild(i); }
    const gt = document.createElement("div"); gt.className = "gt";
    const b = document.createElement("b"); b.textContent = cardName(S.el);
    const sm = document.createElement("small"); sm.textContent = "Відпустіть на мапі";
    gt.appendChild(b); gt.appendChild(sm); ghost.appendChild(gt);
    document.body.appendChild(ghost);
    S.gSm = sm;
  }
  function buildHint(){
    hint = document.createElement("div"); hint.className = "dnd-hint"; hint.setAttribute("role", "status");
    hint.innerHTML = "<i>⤓</i>Відпустіть на мапі · Esc — скасувати";
    document.body.appendChild(hint);
  }

  const dropXY = () => S.touch ? [S.x, S.y - LIFT] : [S.x, S.y];
  function placeGhost(){
    if (!ghost) return;
    const w = ghost.offsetWidth || 170, hgt = ghost.offsetHeight || 46, [dx, dy] = dropXY();
    let gx, gy;
    if (S.touch){ gx = dx - w / 2; gy = dy - hgt - 22; } else { gx = S.x + 18; gy = S.y + 16; }
    gx = Math.max(6, Math.min(window.innerWidth - w - 6, gx)); gy = Math.max(6, Math.min(window.innerHeight - hgt - 6, gy));
    ghost.style.setProperty("--gx", gx + "px"); ghost.style.setProperty("--gy", gy + "px");
  }

  /* ---------- розміщувана «зона»: що вважається допустимою територією ---------- */
  function zonePred(){
    const h = hooks();
    try {
      if (S.kind === "rocket") return h.dndLp && h.dndLp.zone ? h.dndLp.zone(S.key) : null;
      if (S.kind === "tel") return host().tel && host().tel.zone ? host().tel.zone(S.key) : null;
      return h.dndAp.zone ? h.dndAp.zone(S.kind, S.key) : null;
    } catch (_) { return null; }
  }

  /* ---------- що під пальцем/мишею ---------- */
  function overMap(x, y){
    const el = document.elementFromPoint(x, y); if (!el) return false;
    if (el.tagName === "CANVAS" && el.classList.contains("maplibregl-canvas")) return true;
    if (el.id === "map" || el.id === "cross" || el.classList.contains("frame") || el.classList.contains("maplibregl-canvas-container")) return true;
    return !!el.closest(".maplibregl-popup,.maplibregl-marker");
  }
  function siteAt(map, pt){
    if (!map.getLayer("site-icons")) return null;
    const r = S.touch ? 18 : 10;
    try { const f = map.queryRenderedFeatures([[pt[0] - r, pt[1] - r], [pt[0] + r, pt[1] + r]], { layers: ["site-icons"] }); return f.length ? +f[0].properties.id : null; }
    catch (_) { return null; }
  }
  /* оцінка точки: { over, state: ok|warn|bad|off, msg, label, ring, from, p, ... } */
  function evalAt(force){
    const map = getMap(), h = hooks(), [x, y] = dropXY(), now = performance.now();
    if (!force && S.ev && now - S.evT < 70 && Math.hypot(x - S.evX, y - S.evY) < 6) return S.ev;
    let r;
    if (!overMap(x, y)) r = { over: false, state: "off", msg: "Відпустіть на мапі" };
    else {
      const rect = map.getContainer().getBoundingClientRect(), pt = [x - rect.left, y - rect.top], ll = map.unproject(pt), p = [ll.lng, ll.lat];
      try {
        if (S.kind === "rocket") r = h.dndLp.probe(S.key, p, siteAt(map, pt));
        else if (S.kind === "tel") r = host().tel.probe(S.key, p);
        else r = h.dndAp.probe(S.kind, S.key, p);
      } catch (e) { r = { ok: false, msg: "Не вдалося перевірити точку" }; }
      r = r || { ok: false, msg: "Недоступно" };
      r.over = true; r.p = p; r.pt = pt;
      r.state = r.state || (r.ok ? "ok" : "bad");
    }
    S.ev = r; S.evT = now; S.evX = x; S.evY = y;
    return r;
  }

  /* ---------- мапа: шари попереднього перегляду ---------- */
  function ensureLayers(map){
    const before = map.getLayer("site-icons") ? "site-icons" : undefined;
    const clr = ["match", ["get", "s"], "ok", COL.ok, "warn", COL.warn, COL.bad];
    if (!map.getSource("dnd-pre")){
      map.addSource("dnd-pre", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "dnd-ring-fill", type: "fill", source: "dnd-pre", filter: ["==", ["get", "t"], "ring"], paint: { "fill-color": clr, "fill-opacity": 0.14 } }, before);
      map.addLayer({ id: "dnd-ring-line", type: "line", source: "dnd-pre", filter: ["==", ["get", "t"], "ring"], paint: { "line-color": clr, "line-width": 2, "line-dasharray": [2, 1.4], "line-opacity": 0.95 } }, before);
      map.addLayer({ id: "dnd-link", type: "line", source: "dnd-pre", filter: ["==", ["get", "t"], "link"], layout: { "line-cap": "round" }, paint: { "line-color": clr, "line-width": 2.2, "line-dasharray": [1, 1.6], "line-opacity": 0.9 } });
      map.addLayer({ id: "dnd-pt-halo", type: "circle", source: "dnd-pre", filter: ["==", ["get", "t"], "pt"], paint: { "circle-radius": 13, "circle-color": clr, "circle-opacity": 0.22 } });
      map.addLayer({ id: "dnd-pt", type: "circle", source: "dnd-pre", filter: ["==", ["get", "t"], "pt"], paint: { "circle-radius": 6.5, "circle-color": "rgba(5,11,24,.78)", "circle-stroke-width": 2.6, "circle-stroke-color": clr } });
    }
    if (!zoneCv) zoneCv = document.createElement("canvas");
    if (!map.getSource("dnd-zone")){
      zoneCv.width = zoneCv.height = 2;
      map.addSource("dnd-zone", { type: "canvas", canvas: zoneCv, coordinates: zoneCoords(map), animate: true });
      map.addLayer({ id: "dnd-zone", type: "raster", source: "dnd-zone", paint: { "raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "linear" } }, map.getLayer("dnd-ring-fill") ? "dnd-ring-fill" : undefined);
    }
    map.setLayoutProperty("dnd-zone", "visibility", "visible");
  }
  function zoneCoords(map){
    const c = map.getContainer(), w = c.clientWidth, h = c.clientHeight, u = (x, y) => { const l = map.unproject([x, y]); return [l.lng, l.lat]; };
    return [u(0, 0), u(w, 0), u(w, h), u(0, h)];
  }
  /* підсвітка допустимих (зелений) і недопустимих (червоний) зон: вибірка предиката по сітці екрана */
  function paintZone(){
    const map = getMap(); if (!map || !S || !S.drag || !S.zone || !zoneCv) return;
    const src = map.getSource("dnd-zone"); if (!src) return;
    const c = map.getContainer(), w = c.clientWidth, h = c.clientHeight;
    const step = Math.max(7, Math.ceil(Math.sqrt(w * h / ZONE_CELLS))), cols = Math.ceil(w / step), rows = Math.ceil(h / step);
    zoneCv.width = cols; zoneCv.height = rows;
    const g = zoneCv.getContext("2d"), img = g.createImageData(cols, rows), d = img.data;
    const lngs = new Array(cols), lats = new Array(rows);
    for (let i = 0; i < cols; i++) lngs[i] = map.unproject([(i + 0.5) * step, h / 2]).lng;
    for (let j = 0; j < rows; j++) lats[j] = map.unproject([w / 2, (j + 0.5) * step]).lat;
    const pred = S.zone;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++){
      let ok = false; try { ok = !!pred([lngs[i], lats[j]]); } catch (_) {}
      const k = (j * cols + i) * 4;
      if (ok){ d[k] = 53; d[k + 1] = 208; d[k + 2] = 127; d[k + 3] = 62; } else { d[k] = 255; d[k + 1] = 90; d[k + 2] = 77; d[k + 3] = 30; }
    }
    g.putImageData(img, 0, 0);
    try { src.setCoordinates(zoneCoords(map)); } catch (_) {}
    map.triggerRepaint();
  }
  function scheduleZone(){
    if (zoneT || !S || !S.drag) return;
    zoneT = setTimeout(() => { zoneT = 0; paintZone(); }, 160);
  }
  function drawPreview(r){
    const map = getMap(), src = map && map.getSource("dnd-pre"); if (!src) return;
    const f = [];
    if (r && r.over && r.p){
      const s = r.state;
      if (r.ring > 0) f.push({ type: "Feature", properties: { t: "ring", s }, geometry: { type: "Polygon", coordinates: [host().circleRing(r.p, r.ring, 72)] } });
      if (r.from) f.push({ type: "Feature", properties: { t: "link", s }, geometry: { type: "LineString", coordinates: [r.from, r.snap || r.p] } });
      f.push({ type: "Feature", properties: { t: "pt", s }, geometry: { type: "Point", coordinates: r.snap || r.p } });
    }
    src.setData({ type: "FeatureCollection", features: f });
  }
  function drawGhostState(r){
    if (!ghost) return;
    ghost.classList.remove("ok", "warn", "bad", "off"); ghost.classList.add(r.state === "ok" || r.state === "warn" || r.state === "bad" ? r.state : "off");
    const mark = r.state === "ok" ? "✓ " : r.state === "warn" ? "⚠ " : r.state === "bad" ? "✕ " : "";
    const txt = r.state === "ok" ? (r.label || "Можна розмістити") : r.state === "warn" ? [r.label, r.msg].filter(Boolean).join(" · ") : (r.msg || r.label || "");
    S.gSm.textContent = mark + txt;
    placeGhost();
  }

  /* ---------- цикл кадрів: автопрокрутка мапи біля краю + оцінка точки ---------- */
  function autopan(){
    const map = getMap(), [x, y] = dropXY(); if (!map) return;
    const c = map.getContainer().getBoundingClientRect();
    if (x < c.left || x > c.right || y < c.top || y > c.bottom) return;
    if (!overMap(x, y)) return;
    const dx = x - c.left < EDGE ? -(EDGE - (x - c.left)) : c.right - x < EDGE ? EDGE - (c.right - x) : 0;
    const dy = y - c.top < EDGE + 40 ? -(EDGE + 40 - (y - c.top)) : c.bottom - y < EDGE ? EDGE - (c.bottom - y) : 0;
    if (!dx && !dy) return;
    map.panBy([Math.round(dx / EDGE * PAN_MAX), Math.round(dy / (EDGE + 40) * PAN_MAX)], { animate: false });
  }
  function frame(){
    if (!S || !S.drag) return;
    S.raf = requestAnimationFrame(frame);
    autopan();
    if (!S.dirty) return;
    S.dirty = false;
    const r = evalAt(false);
    drawGhostState(r); drawPreview(r);
  }

  /* ---------- скидання ---------- */
  function drop(){
    const map = getMap(), h = hooks(); if (!map || !h) return finish("cancel");
    const r = evalAt(true);
    if (!r.over) return finish("cancel");
    if (r.state === "bad"){ toast(r.msg || "Сюди не можна"); return finish("reject"); }
    let ok = false;
    try {
      const ev = { type: "click", lngLat: { lng: r.p[0], lat: r.p[1] }, point: { x: r.pt[0], y: r.pt[1] }, originalEvent: S.last, dnd: true };
      if (S.kind === "rocket") ok = h.dndLp.apply(S.key, r.p, r);
      else if (S.kind === "tel") ok = host().tel.apply(S.key, r.p, ev);
      else ok = h.dndAp.apply(S.kind, S.key, r.p, ev);
    } catch (e) { ok = false; if (window.console) console.error("[dnd]", e); }
    const kind = S.kind;
    finish(ok ? "ok" : "reject");
    if (ok && kind === "rocket") showLaunchPill();
  }
  function finish(mode){
    if (!S) return;
    const s = S, map = getMap();
    S = null;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (zoneT){ clearTimeout(zoneT); zoneT = 0; }
    detach(s);
    if (map){
      try { if (s.mv) map.off("move", s.mv); } catch (_) {}
      try { map.getSource("dnd-pre") && map.getSource("dnd-pre").setData(EMPTY); } catch (_) {}
      try { map.getLayer("dnd-zone") && map.setLayoutProperty("dnd-zone", "visibility", "none"); } catch (_) {}
    }
    document.body.classList.remove("dnd-on");
    s.el && s.el.classList.remove("dnd-src");
    if (s.panel) s.panel.classList.remove("dnd-away");
    if (hint){ hint.remove(); hint = null; }
    const g = ghost; ghost = null;
    if (g){
      if (mode === "ok"){ g.classList.add("pop"); setTimeout(() => g.remove(), 230); }
      else if (mode === "reject"){ g.classList.remove("ok", "warn", "off"); g.classList.add("bad", "shake"); setTimeout(() => { g.classList.add("pop"); }, 300); setTimeout(() => g.remove(), 560); }
      else g.remove();
    }
    suppressUntil = performance.now() + 450;                          // клік після перетягування — не вважати вибором картки
  }
  function detach(s){
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    if (s && s.timer) clearTimeout(s.timer);
  }
  function cleanup(){ if (!S) return; const s = S; S = null; detach(s); }                 // жест не став перетягуванням
  function cancel(){ if (S && S.drag) finish("cancel"); else cleanup(); }

  /* ---------- швидкий пуск після скидання ракети на ціль ---------- */
  function hidePill(){ if (pillTimer){ clearInterval(pillTimer); pillTimer = 0; } if (pill){ pill.remove(); pill = null; } }
  function showLaunchPill(){
    const h = hooks(); if (!h || !h.dndLp || !h.dndLp.summary) return;
    const sm = h.dndLp.summary(); if (!sm) return;
    hidePill();
    pill = document.createElement("div"); pill.className = "dnd-launch" + (sm.side === "ru" ? " ru" : ""); pill.setAttribute("role", "status");
    const t = document.createElement("div"); t.className = "dl-t";
    t.textContent = sm.title; const sub = document.createElement("small"); sub.textContent = sm.sub || ""; t.appendChild(sub);
    const go = document.createElement("button"); go.className = "dl-go"; go.type = "button"; go.textContent = "Пуск"; go.disabled = !sm.ok;
    const x = document.createElement("button"); x.className = "dl-x"; x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Закрити");
    pill.appendChild(t); pill.appendChild(go); pill.appendChild(x);
    go.onclick = () => { const b = $("lpGo"); if (b && !b.disabled) b.click(); hidePill(); };
    x.onclick = hidePill;
    document.body.appendChild(pill);
    const t0 = performance.now(), sig = sm.sig;
    pillTimer = setInterval(() => {      // зникає: панель закрито, ціль змінено або минуло 12 с
      const s2 = h.dndLp.summary();
      if (!s2 || s2.sig !== sig || performance.now() - t0 > 12000) { hidePill(); return; }
      if (go.disabled === !!s2.ok) go.disabled = !s2.ok;
    }, 400);
  }

  /* ---------- службові обробники ---------- */
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("dragstart", e => { if (cardInfo(e.target)) e.preventDefault(); }, true);
  document.addEventListener("contextmenu", e => { if (S && (S.drag || S.timer)) e.preventDefault(); }, true);
  document.addEventListener("touchmove", e => { if (S && S.drag && e.cancelable) e.preventDefault(); }, { passive: false, capture: true });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && S && S.drag){ e.preventDefault(); e.stopImmediatePropagation(); finish("cancel"); } }, true);
  document.addEventListener("click", e => { if (performance.now() < suppressUntil){ e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener("blur", () => { if (S) cancel(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && S) cancel(); });
  window.addEventListener("resize", () => { if (S && S.drag){ S.dirty = true; scheduleZone(); } });

  window.BV_DND = { state: () => S, cancel, cardInfo, evalAt: () => (S && S.drag ? evalAt(true) : null), hidePill, version: "7.74" };
})();
