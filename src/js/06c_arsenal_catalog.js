/* Arsenal catalog bridge: keeps every gameplay equipment entry visible in the Arsenal. */
(() => {
  "use strict";
  const ROOT = "#bcShop";
  const GRID = ".bc-grid";
  const MARK = "data-bv-arsenal-catalog";
  const esc = value => String(value == null ? "" : value).replace(/[&<>\"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
  const imageFor = key => {
    const w = window.BV3 && window.BV3.WEAPONS && window.BV3.WEAPONS[key];
    const sprite = w && Array.isArray(w.img) ? w.img[0] : null;
    const data = window.BV_SPR && window.BV_SPR.missiles && sprite && window.BV_SPR.missiles[sprite];
    return data && data.src ? `<img src="${esc(data.src)}" alt="">` : `<span class="bv-arsenal-placeholder">◆</span>`;
  };
  const catalog = () => {
    const out = [], seen = new Set();
    const add = (key, name, type, side, imageKey) => {
      if (!key || seen.has(key)) return;
      seen.add(key); out.push({ key, name: name || key, type: type || "Техніка", side: side || "—", imageKey });
    };
    const game = window.BV3;
    if (game && game.WEAPONS) Object.entries(game.WEAPONS).forEach(([key, w]) => {
      if (!w.child) add(key, w.n, w.type, w.side, key);
    });
    const air = window.BV4;
    if (air && air.AD_TYPES) Object.entries(air.AD_TYPES).forEach(([key, t]) => {
      add("ad:" + key, t.n, t.type, t.side, null);
    });
    if (game && game.CARRIERS) Object.entries(game.CARRIERS).forEach(([key, c]) => {
      add("carrier:" + key, c.n, c.kind === "air" ? "Літак-носій" : "Корабель-носій", c.side, null);
    });
    return out.sort((a, b) => a.side.localeCompare(b.side, "uk") || a.name.localeCompare(b.name, "uk"));
  };
  const isArsenal = shop => {
    const active = shop.querySelector(".bc-tabs button.on, .bc-tabs .on");
    return !!active && /арсенал|arsenal/i.test(active.textContent || "");
  };
  function sync() {
    const shop = document.querySelector(ROOT);
    if (!shop || !shop.classList.contains("on") || !isArsenal(shop)) return;
    const grid = shop.querySelector(GRID);
    if (!grid || grid.querySelector(`[${MARK}]`)) return;
    const items = catalog();
    if (!items.length) return;
    const section = document.createElement("section");
    section.className = "bc-sec";
    section.setAttribute(MARK, "1");
    section.innerHTML = `<div class="bc-sh"><span>Вся техніка гри</span><em>${items.length} позицій</em></div><div class="bc-grid">` +
      items.map(item => `<article class="bc-it" data-equipment-key="${esc(item.key)}"><div class="bc-ctry">${esc(item.side)}</div><div class="bc-pic">${item.imageKey ? imageFor(item.imageKey) : `<span class="bv-arsenal-placeholder">◆</span>`}</div><div class="bc-nm">${esc(item.name)}</div><div class="bc-sb">${esc(item.type)}</div><div class="bc-st">Підключено до арсеналу</div></article>`).join("") + `</div>`;
    grid.closest(".bc-sec")?.after(section) || shop.querySelector(".bc-body")?.append(section);
  }
  const observer = new MutationObserver(sync);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    sync();
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
