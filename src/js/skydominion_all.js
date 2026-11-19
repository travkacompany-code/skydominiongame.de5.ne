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
/* SKYDOMINION 2 — 101_app_ui.js
   Меню «как в мобильной игре»: нижние вкладки, анимация плиток при смене экрана,
   тактильный отклик. Логику игры не трогает: вкладки — обычные кнопки data-s7,
   их подхватывает штатный обработчик кликов. */
(() => {
  "use strict";
  const body = document.body, sc = document.getElementById("mmScroll");
  if (!sc) return;
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    battle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M12 8v5"/><circle cx="12" cy="16" r=".6" fill="currentColor"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1.4 11H5.4z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>'
  };
  const tabs = document.createElement("nav");
  tabs.id = "mmTabs"; tabs.setAttribute("aria-label", "Навігація");
  tabs.innerHTML =
    `<button type="button" data-t="home" data-s7="go" data-v="main">${I.home}<span>Головна</span></button>` +
    `<button type="button" data-t="battle" data-s7="go" data-v="online">${I.battle}<span>Бій</span></button>` +
    `<button type="button" data-t="shop" data-s7="bcshop" hidden>${I.shop}<span>Магазин</span></button>` +
    `<button type="button" data-t="me" data-s7="go" data-v="profile">${I.me}<span>Профіль</span></button>`;
  body.appendChild(tabs);

  const MAP = { main: "home", online: "battle", scen: "battle", tours: "battle", sandbox: "battle", profile: "me", friends: "me" };
  let ft = 0;
  function fresh(){ sc.classList.add("fresh"); clearTimeout(ft); ft = setTimeout(() => sc.classList.remove("fresh"), 1100); }
  function sync(){
    const on = MAP[sc.dataset.scr || "main"];
    tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.t === on));
    if (sc.dataset.scr === "main"){
      tabs.querySelector('[data-t="shop"]').hidden = !sc.querySelector('[data-s7="bcshop"]');
      const em = sc.querySelector(".mm-me em"), n = em && /:\s*(\d+)/.exec(em.textContent), me = tabs.querySelector('[data-t="me"]');
      let bd = me.querySelector(".bdg");
      if (n){ if (!bd){ bd = document.createElement("i"); bd.className = "bdg"; me.appendChild(bd); } bd.textContent = n[1]; } else if (bd) bd.remove();
    }
  }
  new MutationObserver(() => { fresh(); sync(); }).observe(sc, { attributes: true, attributeFilter: ["data-scr"] });
  new MutationObserver(sync).observe(sc, { childList: true });
  new MutationObserver(() => { if (body.classList.contains("s7-menu")){ fresh(); sync(); } }).observe(body, { attributes: true, attributeFilter: ["class"] });
  fresh(); sync();

  /* тактильный отклик (Android/Chrome) */
  document.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" || !navigator.vibrate) return;
    if (e.target.closest(".mbtn,#mmTabs button,.s7b,.lp-go,.mm-me,.bc-mbal")) navigator.vibrate(8);
  }, { passive: true });
})();
