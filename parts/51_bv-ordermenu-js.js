
/* SKYDOMINION · 190 · контекстне меню швидких наказів (етап 3).
   Відкривається правою кнопкою (або довгим натисканням на дотику): по панелі швидкого доступу — на
   конкретній системі; по мапі — за вибраною системою ППО. Дії — лише через window.BV_QUICK.order,
   тобто ті самі команди, що в панелі техніки. «Зняти з позиції» потребує повторного підтвердження. */
(function boot() {
  "use strict";
  if (window.BV_ORDER_UI) return;
  if (!window.BV_QUICK) return setTimeout(boot, 150);
  window.BV_ORDER_UI = true;

  const MODE = { auto: "автоматичний", manual: "ручний" };
  const menu = document.createElement("div");
  menu.id = "ordMenu"; menu.hidden = true; menu.setAttribute("role", "menu");
  document.body.appendChild(menu);
  let openId = null, confirmRemove = false, lpT = 0, lpX = 0, lpY = 0;

  const unit = id => window.BV_QUICK.list().find(x => x.id === id) || null;
  const selected = () => window.BV_QUICK.list().find(x => x.sel) || null;

  function item(label, enabled, run, cls){
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "menuitem"); b.className = "om-i" + (cls ? " " + cls : "");
    b.textContent = label; b.disabled = !enabled;
    b.addEventListener("click", () => { if (!b.disabled) run(); });
    return b;
  }
  function sep(){ const d = document.createElement("div"); d.className = "om-sep"; return d; }

  function build(u){
    menu.textContent = "";
    const h = document.createElement("div"); h.className = "om-h";
    const t = document.createElement("b"); t.textContent = u.name;
    const s = document.createElement("small"); s.textContent = `боєкомплект ${u.mag}/${u.max}` + (u.reserve !== 0 ? ` · резерв ${u.reserve === "inf" ? "∞" : u.reserve}` : "");
    h.append(t, s); menu.appendChild(h);
    const readyReload = u.state === "ready" && u.mag < u.max && (u.reserve === "inf" || u.reserve > 0);
    menu.appendChild(item("Перезарядити", readyReload, () => act(u.id, "reload")));
    if (u.dmg > 0){
      const lbl = u.dmg === 3 ? "Ремонт триває…" : u.dmg === 2 ? "Ремонтувати (критично пошкоджено)" : "Ремонтувати (пошкоджено)";
      menu.appendChild(item(lbl, u.dmg !== 3, () => act(u.id, "repair")));
    }
    menu.appendChild(item(`Режим: ${MODE.auto}`, u.mode !== "auto", () => act(u.id, "mode", "auto")));
    menu.appendChild(item(`Режим: ${MODE.manual}`, u.mode !== "manual", () => act(u.id, "mode", "manual")));
    menu.appendChild(item("Показати на мапі", true, () => { window.BV_QUICK.focus(u.id); close(); }));
    menu.appendChild(sep());
    menu.appendChild(item(confirmRemove ? "Підтвердити: зняти з позиції" : "Зняти з позиції…", true,
      () => {
        if (!confirmRemove){ confirmRemove = true; build(u); return; }
        act(u.id, "remove"); close();
      }, "om-danger"));
    menu.appendChild(item("Скасувати", true, close));
  }

  function act(id, op, v){
    const ok = window.BV_QUICK.order(id, op, v);
    if (!ok && op !== "remove") { toast("Наказ не виконано: перевірте стан системи"); }
    if (op === "remove" && ok) toast("Систему знято з позиції");
    close();
  }
  function toast(m){ if (window.BV_DND_HOST && window.BV_DND_HOST.toast) window.BV_DND_HOST.toast(m); }

  function openAt(u, x, y){
    if (window.BV_GROUP_MENU && window.BV_QUICK.group.ids().length > 1 && window.BV_GROUP_MENU(x, y)) return;   // етап 4
    if (!u) return;
    openId = u.id; confirmRemove = false; build(u);
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x)) + "px";
    menu.style.top = Math.max(6, Math.min(innerHeight - r.height - 6, y)) + "px";
    const f = menu.querySelector("button:not([disabled])"); if (f) f.focus({ preventScroll: true });
  }
  function close(){ openId = null; confirmRemove = false; menu.hidden = true; }

  /* правий клік по панелі швидкого доступу */
  document.addEventListener("contextmenu", e => {
    const qk = e.target.closest && e.target.closest("#qkBar .qk-u");
    if (qk){ e.preventDefault(); const id = qk.dataset.id; const u = unit(+id); if (u) openAt(u, e.clientX, e.clientY); return; }
    const map = document.getElementById("map");
    if (map && map.contains(e.target)){ const u = selected(); if (u){ e.preventDefault(); openAt(u, e.clientX, e.clientY); } }
  }, true);

  /* довге натискання на дотику по мапі з вибраною системою */
  document.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch") return;
    const map = document.getElementById("map"); if (!map || !map.contains(e.target)) return;
    const u = selected(); if (!u) return;
    lpX = e.clientX; lpY = e.clientY;
    clearTimeout(lpT); lpT = setTimeout(() => { lpT = 0; openAt(u, lpX, lpY - 20); }, 550);
  }, true);
  document.addEventListener("pointermove", e => { if (lpT && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10){ clearTimeout(lpT); lpT = 0; } }, true);
  document.addEventListener("pointerup", () => { clearTimeout(lpT); lpT = 0; }, true);

  /* закриття: Esc, клік поза меню, зміна вибору */
  document.addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target)) close(); }, true);
  document.addEventListener("keydown", e => {
    if (menu.hidden) return;
    if (e.key === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      const items = [...menu.querySelectorAll("button:not([disabled])")]; if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const n = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[n].focus(); e.preventDefault();
    }
  }, true);
  window.addEventListener("blur", close);
})();
