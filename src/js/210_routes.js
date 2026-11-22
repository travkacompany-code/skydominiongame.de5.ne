/* SKYDOMINION · 210 · маршрути (етап 6, за бажанням).
   • ПАТРУЛЮВАННЯ (авіація ППО): послідовність точок. Виконавець, поки система летить, по черзі дає
     штатну команду «точка патрулювання» (HOOKS.adCmd «airCmd»); коли літак дійшов — переходить далі.
     Цикл — опційно. Вихід з маршруту: «Зупинити», повернення на аеродром або знищення системи.
   • УДАР (пуск · проміжні · повернення): лише планування — збереження й відображення на мапі. Виконання
     ударних вильотів у грі поки не підключено (вони керуються іншою логікою).
   Маршрути зберігаються в localStorage браузера (ключ «sd.routes.v1»). Ніщо не є обов'язковим. */
(function boot() {
  "use strict";
  if (window.BV_ROUTE_UI) return;
  if (!window.BV_QUICK || !window.BV_QUICK_UI) return setTimeout(boot, 150);
  window.BV_ROUTE_UI = true;

  const KEY = "sd.routes.v1";
  const $ = id => document.getElementById(id);
  const map = () => (window.BV_DND_HOST && window.BV_DND_HOST.S7 ? window.BV_DND_HOST.S7.map : null);
  const toast = m => { if (window.BV_DND_HOST && window.BV_DND_HOST.toast) window.BV_DND_HOST.toast(m); };
  const dkm = (a, b) => { const kx = 111.32 * Math.cos(a[1] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };

  /* ---------- сховище ---------- */
  function load(){
    try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && Array.isArray(d.patrol) && Array.isArray(d.strike)) return d; } catch (_) {}
    return { patrol: [], strike: [] };
  }
  let DB = load();
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (_) { toast("Не вдалося зберегти маршрут у браузері"); } }
  const uid = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- панель ---------- */
  const panel = document.createElement("div");
  panel.id = "rtPanel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Маршрути авіації");
  document.body.appendChild(panel);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "rtSvg"; svg.setAttribute("aria-hidden", "true");
  document.body.appendChild(svg);

  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "rtBtn"; btn.textContent = "⟶ Маршрути";
  btn.title = "Маршрути патрулювання й ударів (не обов'язково)";
  btn.addEventListener("click", () => { panel.hidden ? openPanel() : closePanel(); });
  document.body.appendChild(btn);

  /* стан побудови */
  let B = null;                        // { kind, pts:[{p,t}], name, edit: id|null }
  let FOLLOW = null;                   // { unit, rid, idx, issued, loop, status }
  const PT_TYPES = [["launch", "Пуск"], ["via", "Проміжна"], ["ret", "Повернення"]];
  let ptType = "launch";

  function openPanel(){ panel.hidden = false; renderPanel(); }
  function closePanel(){ panel.hidden = true; stopBuild(); }

  function renderPanel(){
    panel.textContent = "";
    const h = document.createElement("div"); h.className = "rt-h";
    const t = document.createElement("b"); t.textContent = "Маршрути";
    const x = document.createElement("button"); x.type = "button"; x.className = "rt-x"; x.textContent = "×"; x.setAttribute("aria-label", "Закрити");
    x.onclick = closePanel; h.append(t, x); panel.appendChild(h);

    /* режим побудови */
    const row = document.createElement("div"); row.className = "rt-row";
    const mk = (label, on, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "rt-chip" + (on ? " on" : ""); b.textContent = label; b.setAttribute("aria-pressed", String(on)); b.onclick = fn; return b; };
    row.appendChild(mk("Патрулювання", !B || B.kind === "patrol", () => { startBuild("patrol"); }));
    row.appendChild(mk("Удар (план)", B && B.kind === "strike", () => { startBuild("strike"); }));
    panel.appendChild(row);

    if (B){
      const bl = document.createElement("div"); bl.className = "rt-build";
      const inp = document.createElement("input"); inp.type = "text"; inp.className = "rt-name"; inp.placeholder = "Назва маршруту"; inp.value = B.name; inp.maxLength = 40;
      inp.oninput = () => { B.name = inp.value; };
      bl.appendChild(inp);
      if (B.kind === "strike"){
        const r2 = document.createElement("div"); r2.className = "rt-row";
        for (const [k, n] of PT_TYPES) r2.appendChild(mk(n, ptType === k, () => { ptType = k; renderPanel(); }));
        bl.appendChild(r2);
      }
      const cnt = document.createElement("div"); cnt.className = "rt-hint";
      cnt.textContent = B.kind === "patrol" ? `Точки: ${B.pts.length}. Натисніть на мапі, щоб додати точку.` : `Точки: ${B.pts.length}. Натискайте на мапі — тип: ${PT_TYPES.find(q => q[0] === ptType)[1].toLowerCase()}.`;
      bl.appendChild(cnt);
      const acts = document.createElement("div"); acts.className = "rt-row";
      acts.appendChild(mk("Прибрати точку", false, () => { B.pts.pop(); renderPanel(); }));
      acts.appendChild(mk("Скасувати", false, stopBuild));
      const ok = mk("Зберегти", false, saveBuild); ok.classList.add("rt-go");
      ok.disabled = B.pts.length < (B.kind === "patrol" ? 1 : 2);
      acts.appendChild(ok);
      bl.appendChild(acts);
      panel.appendChild(bl);
    }

    /* збережені маршрути */
    const list = document.createElement("div"); list.className = "rt-list";
    const all = [...DB.patrol.map(r => ["patrol", r]), ...DB.strike.map(r => ["strike", r])];
    if (!all.length){ const e = document.createElement("div"); e.className = "rt-hint"; e.textContent = "Збережених маршрутів немає. Маршрути — за бажанням: можна керувати авіацією й без них."; list.appendChild(e); }
    for (const [kind, r] of all){
      const it = document.createElement("div"); it.className = "rt-it";
      const nm = document.createElement("div"); nm.className = "rt-nm";
      const b1 = document.createElement("b"); b1.textContent = r.name;
      const s = document.createElement("small");
      s.textContent = kind === "patrol" ? `патрулювання · точок ${r.pts.length}${r.loop ? " · цикл" : ""}` : `удар (план) · пуск ${r.launch.length}, проміжних ${r.via.length}, повернення ${r.ret.length}`;
      nm.append(b1, s); it.appendChild(nm);
      const ac = document.createElement("div"); ac.className = "rt-row";
      if (kind === "patrol"){
        ac.appendChild(mk("▶ До вибраної", false, () => startFollow(r)));
        ac.appendChild(mk(r.loop ? "Цикл: так" : "Цикл: ні", !!r.loop, () => { r.loop = !r.loop; save(); renderPanel(); }));
      }
      ac.appendChild(mk("Показати", false, () => { r.show = !r.show; drawSvg(); }));
      ac.appendChild(mk("Видалити", false, () => { if (kind === "patrol") DB.patrol = DB.patrol.filter(q => q.id !== r.id); else DB.strike = DB.strike.filter(q => q.id !== r.id); save(); drawSvg(); renderPanel(); }));
      it.appendChild(ac); list.appendChild(it);
    }
    panel.appendChild(list);

    if (FOLLOW){
      const st = document.createElement("div"); st.className = "rt-hint rt-on";
      const rn = [...DB.patrol].find(q => q.id === FOLLOW.rid);
      st.textContent = `Виконується: ${rn ? rn.name : "маршрут"} · точка ${Math.min(FOLLOW.idx + 1, rn ? rn.pts.length : 0)} з ${rn ? rn.pts.length : 0}`;
      panel.appendChild(st);
      panel.appendChild(mk("■ Зупинити маршрут", false, stopFollow));
    }
  }

  /* ---------- побудова: клік по мапі ---------- */
  function startBuild(kind){
    B = { kind, pts: [], name: "Маршрут " + (DB.patrol.length + DB.strike.length + 1), edit: null };
    renderPanel(); drawSvg();
    toast(kind === "patrol" ? "Клікайте по мапі — точки патрулювання" : "Клікайте по мапі — точки удару (тип обирається вище)");
  }
  function stopBuild(){ B = null; drawSvg(); if (!panel.hidden) renderPanel(); }
  function saveBuild(){
    if (!B) return;
    const name = (B.name || "Маршрут").trim() || "Маршрут";
    if (B.kind === "patrol"){
      if (B.pts.length < 1) return;
      DB.patrol.push({ id: uid(), name, pts: B.pts.map(q => q.p), loop: false, show: true });
    } else {
      if (B.pts.length < 2) return;
      const rr = { id: uid(), name, launch: [], via: [], ret: [], show: true };
      for (const q of B.pts) rr[q.t].push(q.p);
      DB.strike.push(rr);
    }
    save(); toast(`Збережено: ${name}`); stopBuild();
  }

  /* перехоплення кліків по мапі, поки побудова активна (як у рамки: без панорамування під час додавання) */
  let down = null;
  document.addEventListener("pointerdown", e => {
    if (!B) return; const m = $("map"); if (!m || !m.contains(e.target) || e.button !== 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  }, true);
  ["mousedown", "touchstart"].forEach(t => document.addEventListener(t, e => { if (B && down){ e.stopImmediatePropagation(); if (e.cancelable && t === "touchstart") e.preventDefault(); } }, true));
  window.addEventListener("pointermove", e => { if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true; }, true);
  window.addEventListener("pointerup", e => {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    if (d.moved || !B) return;
    const m = map(); if (!m) return;
    const r = m.getContainer().getBoundingClientRect();
    const ll = m.unproject([d.x - r.left, d.y - r.top]); const p = [ll.lng, ll.lat];
    B.pts.push({ p, t: B.kind === "strike" ? ptType : "pt" });
    renderPanel(); drawSvg();
  }, true);
  document.addEventListener("click", e => { if (B && $("map") && $("map").contains(e.target)){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && B){ e.preventDefault(); stopBuild(); }
    if (e.key === "Backspace" && B && document.activeElement && document.activeElement.tagName !== "INPUT"){ B.pts.pop(); renderPanel(); drawSvg(); }
  }, true);

  /* ---------- виконання патрульного маршруту ---------- */
  function unitById(id){ return window.BV_QUICK.list().find(x => x.id === id) || null; }
  function startFollow(r){
    const u = window.BV_QUICK.list().find(x => x.sel);
    if (!u){ toast("Спершу виберіть авіацію ППО на панелі"); return; }
    FOLLOW = { unit: u.id, rid: r.id, idx: 0, issued: false, loop: !!r.loop };
    toast(`${u.name}: маршрут «${r.name}»`);
    renderPanel(); tick();
  }
  function stopFollow(){ FOLLOW = null; renderPanel(); }
  function tick(){
    if (!FOLLOW) return;
    const r = DB.patrol.find(q => q.id === FOLLOW.rid), u = unitById(FOLLOW.unit);
    if (!r || !u){ FOLLOW = null; renderPanel(); return; }
    if (u.state === "rtb" || u.state === "reload"){ return; }                    // повернення/перезарядка — не втручаємось
    const target = r.pts[FOLLOW.idx];
    if (!FOLLOW.issued){
      if (!window.BV_QUICK.order(u.id, "patrolTo", target)){ toast("Маршрут: точка недоступна — зупинено"); FOLLOW = null; renderPanel(); return; }
      FOLLOW.issued = true; renderPanel(); return;
    }
    if (u.state === "patrol" && u.pos && dkm(u.pos, target) < 4){       // дійшов до точки
      FOLLOW.issued = false; FOLLOW.idx++;
      if (FOLLOW.idx >= r.pts.length){ if (FOLLOW.loop) FOLLOW.idx = 0; else { FOLLOW = null; toast("Маршрут завершено"); renderPanel(); return; } }
      renderPanel();
    }
  }
  setInterval(tick, 500);

  /* ---------- накладка на мапі ---------- */
  function drawSvg(){
    const m = map(); if (!m || !m.getContainer) { svg.textContent = ""; return; }
    const c = m.getContainer().getBoundingClientRect();
    svg.setAttribute("width", innerWidth); svg.setAttribute("height", innerHeight);
    svg.textContent = "";
    const proj = p => { const q = m.project(p); return [c.left + q.x, c.top + q.y]; };
    const line = (pts, cls) => { if (pts.length < 2) return; const pl = document.createElementNS(svg.namespaceURI, "polyline"); pl.setAttribute("points", pts.map(p => proj(p).join(",")).join(" ")); pl.setAttribute("class", cls); svg.appendChild(pl); };
    const dot = (p, cls) => { const q = proj(p); const cc = document.createElementNS(svg.namespaceURI, "circle"); cc.setAttribute("cx", q[0]); cc.setAttribute("cy", q[1]); cc.setAttribute("r", 5); cc.setAttribute("class", cls); svg.appendChild(cc); };
    for (const r of DB.patrol) if (r.show !== false){ line(r.pts, "rt-p"); r.pts.forEach(p => dot(p, "rt-pd")); }
    for (const r of DB.strike) if (r.show !== false){
      line([...r.launch, ...r.via, ...r.ret], "rt-s");
      r.launch.forEach(p => dot(p, "rt-sl")); r.via.forEach(p => dot(p, "rt-sv")); r.ret.forEach(p => dot(p, "rt-sr"));
    }
    if (B){
      if (B.kind === "patrol"){ line(B.pts.map(q => q.p), "rt-b"); B.pts.forEach(q => dot(q.p, "rt-bd")); }
      else { line(B.pts.map(q => q.p), "rt-b"); B.pts.forEach(q => dot(q.p, q.t === "launch" ? "rt-sl" : q.t === "via" ? "rt-sv" : "rt-sr")); }
    }
  }
  const m0 = map(); if (m0 && m0.on) { try { m0.on("move", drawSvg); } catch (_) {} }
  setInterval(drawSvg, 500);
})();
