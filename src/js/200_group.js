/* SKYDOMINION · 200 · підрозділи: виділення рамкою й групові накази (етап 4).
   • Рамка: Ctrl/⌘ + перетягування по мапі або кнопка «Рамка» (для дотику). Shift не використано —
     він у MapLibre є зумом-рамкою.
   • Підрозділ — набір систем ППО, які ділять один наказ. Ctrl/⌘-клік по панелі додає/знімає систему.
   • Груповий наказ — той самий BV_QUICK.order для кожної системи; результат — тост «X з Y».
   Нової ігрової логіки немає: лише вибір і повтор перевірених команд. */
(function boot() {
  "use strict";
  if (window.BV_GROUP_UI) return;
  if (!window.BV_QUICK || !window.BV_QUICK_UI) return setTimeout(boot, 150);
  window.BV_GROUP_UI = true;

  const $ = id => document.getElementById(id);
  const map = () => (window.BV_DND_HOST && window.BV_DND_HOST.S7 ? window.BV_DND_HOST.S7.map : null);
  const toast = m => { if (window.BV_DND_HOST && window.BV_DND_HOST.toast) window.BV_DND_HOST.toast(m); };
  const G = () => window.BV_QUICK.group;

  /* ---------- кнопка режиму рамки (для дотику й для тих, хто не тримає Ctrl) ---------- */
  let marq = false;
  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "mselBtn"; btn.textContent = "▭ Рамка";
  btn.setAttribute("aria-pressed", "false"); btn.title = "Виділити підрозділ рамкою (або Ctrl/⌘ + перетягування)";
  btn.addEventListener("click", () => { marq = !marq; btn.classList.toggle("on", marq); btn.setAttribute("aria-pressed", String(marq)); });
  document.body.appendChild(btn);

  /* ---------- рамка ---------- */
  const box = document.createElement("div"); box.id = "mselBox"; box.hidden = true;
  document.body.appendChild(box);
  let R = null, suppressClick = 0;

  document.addEventListener("pointerdown", e => {
    const m = $("map"); if (!m || !m.contains(e.target) || e.button !== 0) return;
    if (!(marq || e.ctrlKey || e.metaKey)) return;
    if (!window.BV_QUICK.list().length) return;
    e.preventDefault(); e.stopImmediatePropagation();          // не даємо мапі почати панорамування/зум-рамку
    R = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    box.hidden = false; placeBox();
  }, true);
  /* блокуємо подальші mouse/touch-події мапи на час рамки, інакше карта все одно зсунеться */
  ["mousedown", "touchstart", "mousemove", "touchmove"].forEach(t =>
    document.addEventListener(t, e => { if (R){ e.stopImmediatePropagation(); if (e.cancelable && t.startsWith("touch")) e.preventDefault(); } }, true));
  window.addEventListener("pointermove", e => {
    if (!R || e.pointerId !== R.id) return;
    R.x = e.clientX; R.y = e.clientY; if (Math.hypot(R.x - R.x0, R.y - R.y0) > 4) R.moved = true;
    placeBox();
  }, true);
  window.addEventListener("pointerup", e => {
    if (!R || e.pointerId !== R.id) return;
    const r = R; R = null; box.hidden = true; suppressClick = performance.now() + 350;
    if (!r.moved){ G().clear(); render(); return; }
    const ids = inRect(Math.min(r.x0, r.x), Math.min(r.y0, r.y), Math.max(r.x0, r.x), Math.max(r.y0, r.y));
    if (!ids.length){ G().clear(); toast("У рамці немає техніки"); render(); return; }
    if (ids.length === 1){ G().clear(); window.BV_QUICK.select(ids[0]); }
    else { G().set(ids); toast(`Підрозділ: ${ids.length} систем · Ctrl-клік по панелі — додати або прибрати`); }
    render();
  }, true);
  window.addEventListener("pointercancel", () => { if (R){ R = null; box.hidden = true; } }, true);
  document.addEventListener("click", e => { if (performance.now() < suppressClick){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  function placeBox(){
    const x = Math.min(R.x0, R.x), y = Math.min(R.y0, R.y);
    box.style.left = x + "px"; box.style.top = y + "px";
    box.style.width = Math.abs(R.x - R.x0) + "px"; box.style.height = Math.abs(R.y - R.y0) + "px";
  }
  function inRect(x0, y0, x1, y1){
    const m = map(), c = m && m.getContainer && m.getContainer().getBoundingClientRect(); if (!c) return [];
    return window.BV_QUICK.list().filter(u => {
      if (!u.pos) return false;
      const p = m.project(u.pos), x = c.left + p.x, y = c.top + p.y;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }).map(u => u.id);
  }

  /* ---------- кільця навколо систем підрозділу ---------- */
  const rings = document.createElement("div"); rings.id = "mselRings"; rings.setAttribute("aria-hidden", "true");
  document.body.appendChild(rings);
  function drawRings(){
    const m = map(), c = m && m.getContainer && m.getContainer().getBoundingClientRect();
    const ids = G().ids(), list = window.BV_QUICK.list().filter(u => ids.includes(u.id));
    rings.textContent = "";
    if (!c || list.length < 2) return;
    for (const u of list){
      if (!u.pos) continue;
      const p = m.project(u.pos), d = document.createElement("i");
      d.style.left = (c.left + p.x) + "px"; d.style.top = (c.top + p.y) + "px";
      rings.appendChild(d);
    }
  }
  function render(){ drawRings(); }
  setInterval(render, 400);
  const mp = map(); if (mp && mp.on) { try { mp.on("move", render); } catch (_) {} }

  /* ---------- груповий наказ ---------- */
  const menu = document.createElement("div");
  menu.id = "grpMenu"; menu.hidden = true; menu.setAttribute("role", "menu");
  document.body.appendChild(menu);

  function run(op, v, label){
    const ids = G().ids(); if (!ids.length) return;
    let ok = 0;
    for (const id of ids){ if (window.BV_QUICK.order(id, op, v)) ok++; }
    toast(`${label}: ${ok} з ${ids.length}`);
    if (op === "remove") G().clear();
    close(); render();
  }
  function item(label, enabled, fn, cls){
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "menuitem"); b.className = "om-i" + (cls ? " " + cls : "");
    b.textContent = label; b.disabled = !enabled; b.addEventListener("click", () => { if (!b.disabled) fn(); });
    return b;
  }
  let confirmAll = false;
  function build(){
    const list = window.BV_QUICK.list().filter(u => G().ids().includes(u.id));
    menu.textContent = "";
    const h = document.createElement("div"); h.className = "om-h";
    const t = document.createElement("b"); t.textContent = `Підрозділ · ${list.length} систем`;
    const s = document.createElement("small"); s.textContent = list.map(u => u.name).slice(0, 4).join(", ") + (list.length > 4 ? " …" : "");
    h.append(t, s); menu.appendChild(h);
    const ready = list.filter(u => u.state === "ready" && u.mag < u.max && (u.reserve === "inf" || u.reserve > 0)).length;
    menu.appendChild(item(`Перезарядити готові (${ready})`, ready > 0, () => run("reload", undefined, "Перезарядка")));
    menu.appendChild(item("Режим: автоматичний (усі)", list.some(u => u.mode !== "auto"), () => run("mode", "auto", "Режим автоматичний")));
    menu.appendChild(item("Режим: ручний (усі)", list.some(u => u.mode !== "manual"), () => run("mode", "manual", "Режим ручний")));
    menu.appendChild(item("Показати підрозділ", true, () => { const u = list[0]; window.BV_QUICK.focus(u.id); close(); }));
    const sep = document.createElement("div"); sep.className = "om-sep"; menu.appendChild(sep);
    menu.appendChild(item(confirmAll ? "Підтвердити: зняти всі" : "Зняти всі з позиції…", true,
      () => { if (!confirmAll){ confirmAll = true; build(); return; } run("remove", undefined, "Знято з позиції"); }, "om-danger"));
    menu.appendChild(item("Зняти вибір підрозділу", true, () => { G().clear(); close(); render(); }));
  }
  function open(x, y){
    if (G().ids().length < 2) return false;
    confirmAll = false; build(); menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x)) + "px";
    menu.style.top = Math.max(6, Math.min(innerHeight - r.height - 6, y)) + "px";
    const f = menu.querySelector("button:not([disabled])"); if (f) f.focus({ preventScroll: true });
    return true;
  }
  function close(){ menu.hidden = true; confirmAll = false; }
  window.BV_GROUP_MENU = (x, y) => open(x, y);

  /* правий клік по мапі при підрозділі (без вибраної окремої системи) */
  document.addEventListener("contextmenu", e => {
    if (e.defaultPrevented || G().ids().length < 2) return;
    const m = $("map"); if (m && m.contains(e.target)){ e.preventDefault(); open(e.clientX, e.clientY); }
  }, false);
  document.addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target)) close(); }, true);
  document.addEventListener("keydown", e => { if (!menu.hidden && e.key === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
})();
