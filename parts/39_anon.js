
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

