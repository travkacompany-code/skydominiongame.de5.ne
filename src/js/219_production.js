/* SKYDOMINION · 219 · виробництво боєкомплекту (етап 5).
   Спрощена модель: кожен тип ППО має свій запас магазинів, який поповнюється з часом (RATE_SEC на магазин,
   ліміт CAP). Запас витрачається на поповнення резерву вибраної системи — через штатну команду «add».
   Заводи на карті в цьому зрізі не моделюються: це шар ресурсу, а не будівництво. Блок — усередині
   панелі ППО (#avWrap), поруч із рамкою й маршрутами. Конфігурація: window.BV_PROD_CFG. */
(function boot() {
  "use strict";
  if (window.BV_PROD) return;
  const wrap = document.getElementById("avWrap");
  if (!wrap || !window.BV_QUICK || !window.BV_QUICK_UI || !window.BV_DND_HOST) return setTimeout(boot, 200);

  const CFG = Object.assign({ RATE_SEC: 40, CAP: 12, START: 4, FEED: 1 }, window.BV_PROD_CFG || {});
  const STOCK = new Map();                                  // тип → магазинів на складі
  const have = key => { if (!STOCK.has(key)) STOCK.set(key, CFG.START); return STOCK.get(key); };
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function feed(id, key){
    if (window.BV_LOG) return window.BV_LOG.send(id, key);      // з логістикою: магазин їде конвоєм (220)
    const u = window.BV_QUICK.list().find(x => x.id === id);
    if (!u) return false;
    if (u.reserve === "inf") return false;
    if (have(key) < CFG.FEED) { if (window.BV_DND_HOST.toast) window.BV_DND_HOST.toast("Склад порожній: виробництво ще не випустило магазин"); return false; }
    const ok = window.BV_QUICK.order(id, "addMag", CFG.FEED);
    if (!ok) return false;
    STOCK.set(key, have(key) - CFG.FEED);
    return true;
  }

  const box = $("div", "pd-box"); box.id = "avProd"; box.hidden = true;
  wrap.appendChild(box);
  let sig = "";
  function render(){
    const shown = !wrap.hidden;
    box.hidden = !shown;
    if (!shown) return;
    const sel = window.BV_QUICK.list().find(x => x.sel && x.air !== undefined);
    const keys = [...new Set(window.BV_QUICK.list().map(x => x.key))];
    const s = JSON.stringify([sel ? sel.id : null, sel ? sel.reserve : null, keys.map(k => [k, have(k)]), window.BV_LOG ? window.BV_LOG.convoys() : null]);
    if (s === sig) return;
    sig = s;
    box.textContent = "";
    box.appendChild($("div", "pd-h", "Виробництво боєкомплекту"));
    const row = $("div", "pd-s");
    for (const k of keys){
      const n = window.BV_QUICK.list().find(x => x.key === k);
      row.appendChild($("span", "pd-c", `${n ? n.name : k}: ${have(k)}`));
    }
    box.appendChild(row);
    if (window.BV_LOG){
      const cv = window.BV_LOG.convoys().slice(-4);
      if (cv.length){
        const L = $("div", "pd-l");
        for (const c of cv){
          const t = c.state === "road" ? `у дорозі ${c.pct}%` : c.state === "done" ? "прибув" : "знищено";
          L.appendChild($("div", "pd-r" + (c.state === "lost" ? " bad" : ""), `Конвой №${c.id} → ${c.name}: ${t}`));
        }
        box.appendChild(L);
      }
    }
    if (sel){
      const b = $("button", "pd-go", window.BV_LOG ? `Відправити магазин конвоєм · «${sel.name}»` : `+${CFG.FEED} магазин у резерв «${sel.name}»`);
      b.type = "button";
      b.disabled = sel.reserve === "inf" || have(sel.key) < CFG.FEED;
      b.addEventListener("click", () => { feed(sel.id, sel.key); sig = ""; render(); });
      box.appendChild(b);
    } else {
      box.appendChild($("div", "pd-h2", "Виберіть систему, щоб поповнити її резерв."));
    }
  }

  /* випуск: з часом кожен тип отримує +1 магазин, поки не досягне ліміту */
  setInterval(() => {
    for (const k of [...STOCK.keys()]){
      if (STOCK.get(k) < CFG.CAP) STOCK.set(k, STOCK.get(k) + 1);
    }
    for (const u of window.BV_QUICK.list()) have(u.key);
  }, CFG.RATE_SEC * 1000);
  setInterval(render, 500);

  /* порядок: наказ «addMag» = штатна команда add з кількістю магазинів (див. quick_glue) */
  window.BV_PROD = { stock: k => have(k), feed, cfg: CFG,
    take: (k, n) => { STOCK.set(k, have(k) - n); sig = ""; },
    give: (k, n) => { STOCK.set(k, Math.min(CFG.CAP, have(k) + n)); sig = ""; } };
  render();
})();
