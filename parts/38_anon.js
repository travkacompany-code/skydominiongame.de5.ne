
/* SKYDOMINION 2 — 100_modals.js
   Независимый от игровой логики слой: сворачивание/перетаскивание панелей,
   свайп-вниз для закрытия диалогов, фокус-ловушка. Работает через делегирование,
   поэтому переживает любые перерисовки innerHTML в панелях. */
(() => {
  "use strict";
  const PANELS = "#launch,#adp,#facp,#lgp,#gmChat,#gmStat,#gmFree";
  const $ = s => document.querySelector(s);
  const narrow = () => !matchMedia("(min-width:700px)").matches;

  /* ---------- кнопка «свернуть» в каждой панели ---------- */
  function foldPanel(p, on){
    p.classList.toggle("fold", on);
    const b = p.querySelector(":scope>.pn-fold");
    if (b){ b.setAttribute("aria-label", on ? "Розгорнути" : "Згорнути"); b.title = on ? "Розгорнути" : "Згорнути (карта вільна)"; b.setAttribute("aria-expanded", String(!on)); }
    /* если пользователь сам развернул панель во время выбора точки — уважаем это */
    p.classList.toggle("unfold", !on);
  }
  document.querySelectorAll(PANELS).forEach(p => {
    if (p.querySelector(":scope>.pn-fold")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "pn-fold";
    b.addEventListener("click", e => { e.stopPropagation(); foldPanel(p, !p.classList.contains("fold")); });
    p.appendChild(b); foldPanel(p, false); p.classList.remove("unfold");
  });

  /* ---------- перетаскивание (ПК) / свайп-свёртка (телефон) за заголовок ---------- */
  let dr = null;
  document.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    const h = e.target.closest(".lp-head,.hd");
    if (!h || e.target.closest("button,input,select,textarea,a,[data-act],[data-s7],[data-ad]")) return;
    const p = h.closest(PANELS); if (!p) return;
    const r = p.getBoundingClientRect(), t = (p.style.translate || "0px 0px").split(" ");
    dr = { p, x: e.clientX, y: e.clientY, r, bx: parseFloat(t[0]) || 0, by: parseFloat(t[1]) || 0, moved: false, swiped: false };
    if (e.pointerType === "mouse") e.preventDefault();      // без выделения текста
  });
  document.addEventListener("pointermove", e => {
    if (!dr) return;
    const dx = e.clientX - dr.x, dy = e.clientY - dr.y;
    if (narrow()){
      if (dr.swiped) return;
      if (dy > 38){ foldPanel(dr.p, true); dr.swiped = true; }
      else if (dy < -38){ foldPanel(dr.p, false); dr.swiped = true; }
      return;
    }
    if (!dr.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!dr.moved){ dr.moved = true; document.body.classList.add("pn-drag"); }
    const L = Math.min(Math.max(dr.r.left + dx, 80 - dr.r.width), innerWidth - 80),
          T = Math.min(Math.max(dr.r.top + dy, 0), innerHeight - 44);
    dr.p.style.translate = (dr.bx + L - dr.r.left) + "px " + (dr.by + T - dr.r.top) + "px";
  });
  const endDrag = () => { if (dr) document.body.classList.remove("pn-drag"); dr = null; };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  /* двойной клик по заголовку = свернуть/развернуть */
  document.addEventListener("dblclick", e => {
    const h = e.target.closest(".lp-head,.hd");
    if (!h || e.target.closest("button,input,select,textarea,a,[data-act],[data-s7],[data-ad]")) return;
    const p = h.closest(PANELS); if (p) foldPanel(p, !p.classList.contains("fold"));
  });
  addEventListener("resize", () => { if (narrow()) document.querySelectorAll(PANELS).forEach(p => p.style.translate = ""); });

  /* ---------- диалоги: свайп вниз по заголовку закрывает (телефон) ---------- */
  let sw = null;
  document.addEventListener("pointerdown", e => {
    if (!narrow() || e.button > 0) return;
    const h = e.target.closest("#s7mdl:not(.ig) .mdl-h");
    if (!h || e.target.closest(".mdl-x")) return;
    sw = { d: h.closest(".mdl"), y: e.clientY, dy: 0 };
    sw.d.style.transition = "none";
  });
  document.addEventListener("pointermove", e => {
    if (!sw) return;
    sw.dy = Math.max(0, e.clientY - sw.y);
    sw.d.style.translate = "0 " + sw.dy + "px";
    sw.d.style.opacity = String(1 - Math.min(sw.dy / 400, .5));
  });
  const endSwipe = () => {
    if (!sw) return;
    const { d, dy } = sw; sw = null;
    d.style.transition = "translate .2s, opacity .2s";
    if (dy > 90){ const x = d.querySelector(".mdl-x"); x && x.click(); }
    else { d.style.translate = ""; d.style.opacity = ""; }
  };
  document.addEventListener("pointerup", endSwipe);
  document.addEventListener("pointercancel", endSwipe);

  /* ---------- Tab не уходит из диалога на карту ---------- */
  document.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const m = $("#s7mdl.on:not(.ig)"); if (!m) return;
    const f = [...m.querySelectorAll("button,input,select,textarea,a[href],[tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    const a = document.activeElement, i = f.indexOf(a);
    if (e.shiftKey && (i <= 0)){ e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)){ e.preventDefault(); f[0].focus(); }
  }, true);
})();

